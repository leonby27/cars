import crypto from "node:crypto";
import { pool } from "./site-data/db.mjs";
import { hashPassword, verifyPassword, readCookie } from "./auth.mjs";
import { partnerRegistrationValues, partnerRequestUpdate, partnerSourceUrl } from "../src/partner-model.js";

const COOKIE = "abcars_partner";
const TTL = 7 * 24 * 3600;
const tokenHash = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const normalizePartnerLogin = (value) => String(value || "").trim().toLowerCase();
const safePartner = (row) => ({ id:row.id, login:row.login, name:row.name });
const safeRequest = (row) => ({ id:row.id, leadKey:row.lead_key, ...row.snapshot, status:row.status, ownerNote:row.owner_note, note:row.partner_note, demo:row.demo, assignedAt:row.assigned_at, updatedAt:row.updated_at, completedAt:row.completed_at });
const cookieToken = (request) => { try { return readCookie(request.headers.cookie, COOKIE); } catch { return null; } };

export async function provisionPartner({ login, name, password }, { db = pool, replace = false } = {}) {
  login = normalizePartnerLogin(login);
  name = String(name || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(login) || !name || name.length > 100 || typeof password !== "string" || password.length < 8 || password.length > 200) throw new Error("invalid_partner_credentials");
  const credentials = await hashPassword(password);
  const { rows } = await db.query(`INSERT INTO partner_accounts (id,login,name,password_salt,password_hash)
    VALUES ($1,$2,$3,$4,$5) ${replace ? `ON CONFLICT(login) DO UPDATE SET name=EXCLUDED.name,
    password_salt=EXCLUDED.password_salt,password_hash=EXCLUDED.password_hash,active=true,updated_at=now()` : ""}
    RETURNING id,login,name`, [crypto.randomUUID(), login, name, credentials.salt, credentials.hash]);
  await db.query("DELETE FROM partner_sessions WHERE partner_id=$1", [rows[0].id]);
  return safePartner(rows[0]);
}

export async function authenticatePartner({ login, password }, { db = pool } = {}) {
  if (typeof password !== "string" || password.length > 200) return null;
  const { rows } = await db.query("SELECT * FROM partner_accounts WHERE login=$1 AND active", [normalizePartnerLogin(login)]);
  const row = rows[0];
  // Unknown and disabled logins take the same password derivation path.
  const valid = await verifyPassword(password, row?.password_salt || "partner-unavailable", row?.password_hash || "0".repeat(128));
  return row && valid ? safePartner(row) : null;
}
export async function createPartnerSession(partnerId, { db = pool } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.query("INSERT INTO partner_sessions (token_hash,partner_id,expires_at) VALUES ($1,$2,now()+($3 * interval '1 second'))", [tokenHash(token),partnerId,TTL]);
  return token;
}
export async function sessionPartner(request, { db = pool } = {}) {
  const token = cookieToken(request);
  if (!token) return null;
  const { rows } = await db.query(`SELECT a.id,a.login,a.name FROM partner_sessions s JOIN partner_accounts a ON a.id=s.partner_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND a.active`, [tokenHash(token)]);
  return rows[0] ? safePartner(rows[0]) : null;
}
export async function deletePartnerSession(request, { db = pool } = {}) {
  const token = cookieToken(request);
  if (token) await db.query("DELETE FROM partner_sessions WHERE token_hash=$1", [tokenHash(token)]);
}
export function partnerCookie(token, request) {
  const secure = request.headers["x-forwarded-proto"] === "https" || request.socket?.encrypted;
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? TTL : 0}${secure ? "; Secure" : ""}`;
}
export async function partnerDashboard(request, { db = pool } = {}) {
  const partner = await sessionPartner(request, { db });
  if (!partner) return { error:"unauthorized" };
  const { rows } = await db.query("SELECT * FROM partner_requests WHERE partner_id=$1 ORDER BY assigned_at DESC,id DESC", [partner.id]);
  return { partner, requests:rows.map(safeRequest) };
}
export async function updatePartnerRequest(request, id, values, { db = pool } = {}) {
  const partner = await sessionPartner(request, { db });
  if (!partner) return { error:"unauthorized" };
  const update = partnerRequestUpdate(values);
  if (!update) return { error:"invalid_update" };
  const { rows } = await db.query(`UPDATE partner_requests SET status=$3,partner_note=$4,updated_at=now(),
    completed_at=CASE WHEN $3='completed' THEN coalesce(completed_at,now()) ELSE NULL END
    WHERE id=$1 AND partner_id=$2 RETURNING *`, [id,partner.id,update.status,update.note]);
  return rows[0] ? { request:safeRequest(rows[0]) } : { error:"request_not_found" };
}
export function partnerLeadSnapshot(lead) {
  const customer = lead.customer || {};
  const car = lead.car;
  return {
    kind:lead.kind, createdAt:lead.createdAt,
    customer:{ name:customer.name || "", phone:customer.phone || customer.contact || "", email:customer.email || "", telegram:customer.telegram || "", city:customer.city || "" },
    car:car ? { id:car.id, title:car.title, image:car.image || "", year:car.year || null, sourceUrl:partnerSourceUrl(car.sourceUrl) } : null,
    comment:lead.comment || "", filters:lead.filters || null,
  };
}
export async function assignPartnerLead(lead, partnerId, note = "", { db = pool } = {}) {
  if (typeof note !== "string" || note.length > 2000) return { error:"invalid_note" };
  const active = await db.query("SELECT id FROM partner_accounts WHERE id=$1 AND active", [partnerId]);
  if (!active.rowCount) return { error:"partner_not_found" };
  const { rows } = await db.query(`INSERT INTO partner_requests (id,lead_key,partner_id,snapshot,owner_note)
    VALUES ($1,$2,$3,$4,$5) ON CONFLICT(lead_key) DO UPDATE SET
      snapshot=EXCLUDED.snapshot,owner_note=EXCLUDED.owner_note,updated_at=now(),
      status=CASE WHEN partner_requests.partner_id=EXCLUDED.partner_id THEN partner_requests.status ELSE 'new' END,
      partner_note=CASE WHEN partner_requests.partner_id=EXCLUDED.partner_id THEN partner_requests.partner_note ELSE '' END,
      completed_at=CASE WHEN partner_requests.partner_id=EXCLUDED.partner_id THEN partner_requests.completed_at ELSE NULL END,
      assigned_at=CASE WHEN partner_requests.partner_id=EXCLUDED.partner_id THEN partner_requests.assigned_at ELSE now() END,
      partner_id=EXCLUDED.partner_id RETURNING lead_key,partner_id,status,owner_note,partner_note`,
    [crypto.randomUUID(),lead.id,partnerId,partnerLeadSnapshot(lead),note.trim()]);
  return { assignment:rows[0] };
}
export async function partnerDirectory({ db = pool } = {}) {
  const [partners, assignments, registrationRequests] = await Promise.all([
    db.query("SELECT id,login,name FROM partner_accounts WHERE active ORDER BY name,login"),
    db.query("SELECT lead_key,partner_id,status,owner_note,partner_note FROM partner_requests WHERE NOT demo"),
    db.query('SELECT id,name,phone,created_at AS "createdAt",updated_at::text AS "updatedAt",seen_at AS "seenAt" FROM partner_registration_requests ORDER BY updated_at DESC'),
  ]);
  return { partners:partners.rows, assignments:assignments.rows, registrationRequests:registrationRequests.rows };
}
export async function createPartnerRegistrationRequest(value, { db = pool } = {}) {
  const values = partnerRegistrationValues(value);
  if (!values) return { error:"invalid_registration" };
  await db.query(`INSERT INTO partner_registration_requests(id,name,phone) VALUES($1,$2,$3)
    ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,updated_at=now(),seen_at=NULL`, [crypto.randomUUID(),values.name,values.phone]);
  return { ok:true };
}

export async function markPartnerRegistrationsSeen(value, { db = pool } = {}) {
  const requests = value?.requests;
  if (!Array.isArray(requests) || !requests.length || requests.length > 100 || requests.some((item) =>
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(item?.id || "") ||
    typeof item?.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt)))) return { error:"invalid_requests" };
  // A repeated application arriving after the list was loaded must stay unread.
  const result = await db.query(`UPDATE partner_registration_requests AS request SET seen_at=now()
    FROM unnest($1::uuid[], $2::timestamptz[]) AS viewed(id, updated_at)
    WHERE request.id=viewed.id AND request.updated_at=viewed.updated_at AND request.seen_at IS NULL`,
    [requests.map((item) => item.id), requests.map((item) => item.updatedAt)]);
  return { ok:true, viewed:result.rowCount };
}

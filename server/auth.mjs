import crypto from "node:crypto";
import { promisify } from "node:util";
import { pool } from "./db.mjs";

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "navostok_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export const normalizePhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 9) return `375${digits}`;
  return digits;
};

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const safeUser = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email || "",
  telegram: row.telegram || "",
  city: row.city || "",
  preferredContact: row.preferred_contact || "phone",
  createdAt: row.created_at,
});

export function normalizeProfile(profile = {}) {
  return {
    name: String(profile.name || "").trim(),
    email: String(profile.email || "").trim().toLowerCase(),
    telegram: String(profile.telegram || "").trim().replace(/^@+/, ""),
    city: String(profile.city || "").trim(),
    preferredContact: ["phone", "telegram", "email"].includes(profile.preferredContact) ? profile.preferredContact : "phone",
  };
}

export async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString("hex") };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export async function createAccount({ name, phone, password }) {
  const normalizedPhone = normalizePhone(phone);
  const existing = await pool.query("SELECT 1 FROM customer_accounts WHERE phone=$1", [normalizedPhone]);
  if (existing.rowCount) return { error: "phone_already_registered" };
  const credentials = await hashPassword(password);
  const result = await pool.query(
    "INSERT INTO customer_accounts (id,name,phone,password_salt,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,phone,created_at",
    [crypto.randomUUID(), name, normalizedPhone, credentials.salt, credentials.hash],
  );
  return { user: safeUser(result.rows[0]) };
}

export async function authenticateAccount({ phone, password }) {
  const result = await pool.query("SELECT * FROM customer_accounts WHERE phone=$1", [normalizePhone(phone)]);
  const row = result.rows[0];
  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) return null;
  return safeUser(row);
}

export async function createSession(customerId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO customer_sessions (token_hash,customer_id,expires_at) VALUES ($1,$2,now() + ($3 * interval '1 second'))",
    [hashToken(token), customerId, SESSION_TTL_SECONDS],
  );
  return token;
}

export async function getSessionUser(request) {
  const token = readCookie(request.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  const result = await pool.query(
    `SELECT a.id,a.name,a.phone,a.email,a.telegram,a.city,a.preferred_contact,a.created_at
       FROM customer_sessions s
       JOIN customer_accounts a ON a.id=s.customer_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [hashToken(token)],
  );
  return result.rows[0] ? safeUser(result.rows[0]) : null;
}

async function getSessionAccount(request) {
  const token = readCookie(request.headers.cookie, SESSION_COOKIE);
  if (!token) return null;
  const result = await pool.query(
    `SELECT a.*
       FROM customer_sessions s
       JOIN customer_accounts a ON a.id=s.customer_id
      WHERE s.token_hash=$1 AND s.expires_at>now()`,
    [hashToken(token)],
  );
  return result.rows[0] || null;
}

export async function updateAccountProfile(request, profile) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const value = normalizeProfile(profile);
  const result = await pool.query(
    `UPDATE customer_accounts
        SET name=$2,email=NULLIF($3,''),telegram=NULLIF($4,''),city=NULLIF($5,''),preferred_contact=$6,updated_at=now()
      WHERE id=$1
      RETURNING id,name,phone,email,telegram,city,preferred_contact,created_at`,
    [account.id, value.name, value.email, value.telegram, value.city, value.preferredContact],
  );
  return { user:safeUser(result.rows[0]) };
}

export async function deleteAccount(request, password) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  if (!(await verifyPassword(password, account.password_salt, account.password_hash))) return { error:"invalid_credentials" };
  await pool.query("DELETE FROM customer_accounts WHERE id=$1", [account.id]);
  return { ok:true };
}

export async function listAccountFavorites(request) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  const result = await pool.query("SELECT listing_id FROM customer_favorites WHERE customer_id=$1 ORDER BY created_at", [account.id]);
  return { ids:result.rows.map((row) => row.listing_id) };
}

export async function setAccountFavorite(request, listingId, favorite) {
  const account = await getSessionAccount(request);
  if (!account) return { error:"unauthorized" };
  if (favorite) {
    await pool.query("INSERT INTO customer_favorites (customer_id,listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [account.id, listingId]);
  } else {
    await pool.query("DELETE FROM customer_favorites WHERE customer_id=$1 AND listing_id=$2", [account.id, listingId]);
  }
  return { ok:true };
}

export async function deleteSession(request) {
  const token = readCookie(request.headers.cookie, SESSION_COOKIE);
  if (token) await pool.query("DELETE FROM customer_sessions WHERE token_hash=$1", [hashToken(token)]);
}

export function readCookie(header = "", name) {
  const entry = String(header).split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

export function sessionCookie(token, request) {
  const secure = request.headers["x-forwarded-proto"] === "https";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request) {
  const secure = request.headers["x-forwarded-proto"] === "https";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

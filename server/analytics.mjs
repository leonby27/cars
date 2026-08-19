import crypto from "node:crypto";
import { pool } from "./db.mjs";
import { readCookie } from "./auth.mjs";

export const ANALYTICS_EVENTS = new Set([
  "page_view",
  "vehicle_view",
  "availability_click",
  "registration_completed",
  "favorite_added",
  "custom_search_submitted",
]);

const COOKIE_NAME = "evcars_analytics";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const text = (value, max) => String(value || "").trim().slice(0, max);

export function normalizeAnalyticsEvent(body = {}) {
  const eventName = text(body.eventName, 64);
  if (!ANALYTICS_EVENTS.has(eventName)) return { error:"invalid_event" };
  const eventId = text(body.eventId, 80);
  const visitorId = text(body.visitorId, 80);
  const sessionId = text(body.sessionId, 80);
  const path = text(body.path, 400) || "/";
  if (!eventId || !visitorId || !sessionId) return { error:"invalid_event_identity" };
  const properties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
  // Личные данные в события не принимаем вообще, даже если их пришлёт браузер: приём
  // событий открыт без пароля, поэтому любой мог бы набить таблицу чужими именами и
  // телефонами. Имя и телефон берутся из таблицы аккаунтов, где они уже есть.
  const safeProperties = {};
  if (properties.source) safeProperties.source = text(properties.source, 40);
  return {
    eventId,
    visitorId,
    sessionId,
    eventName,
    path,
    listingId:text(body.listingId, 200) || null,
    listingTitle:text(body.listingTitle, 240) || null,
    properties:safeProperties,
  };
}

export async function recordAnalyticsEvent(body) {
  const event = normalizeAnalyticsEvent(body);
  if (event.error) return event;
  await pool.query(
    `INSERT INTO analytics_events (event_id,visitor_id,session_id,event_name,path,listing_id,listing_title,properties)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (event_id) DO NOTHING`,
    [event.eventId,event.visitorId,event.sessionId,event.eventName,event.path,event.listingId,event.listingTitle,JSON.stringify(event.properties)],
  );
  return { ok:true };
}

export async function resetAnalyticsData() {
  const result = await pool.query("DELETE FROM analytics_events");
  return { ok:true, deleted:result.rowCount };
}

const analyticsPassword = () => String(process.env.ANALYTICS_PASSWORD || "");
const analyticsSecret = () => String(process.env.ANALYTICS_SESSION_SECRET || analyticsPassword());
const digest = (value) => crypto.createHash("sha256").update(String(value)).digest();

export function verifyAnalyticsPassword(password) {
  const expected = analyticsPassword();
  if (!expected) return { ok:false, error:"analytics_not_configured" };
  return { ok:crypto.timingSafeEqual(digest(password), digest(expected)) };
}

export function createAnalyticsToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ iat:now, exp:now + SESSION_TTL_SECONDS * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", analyticsSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAnalyticsToken(token, now = Date.now()) {
  const secret = analyticsSecret();
  if (!secret || !token) return false;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  let actual;
  try { actual = Buffer.from(signature, "base64url"); } catch { return false; }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(session.iat) <= now && Number(session.exp) > now;
  } catch { return false; }
}

export function hasAnalyticsSession(request) {
  return verifyAnalyticsToken(readCookie(request.headers.cookie, COOKIE_NAME));
}

const secureRequest = (request) => request.headers["x-forwarded-proto"] === "https";
export function analyticsCookie(token, request) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secureRequest(request) ? "; Secure" : ""}`;
}
export function clearAnalyticsCookie(request) {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureRequest(request) ? "; Secure" : ""}`;
}

export function normalizeAnalyticsDays(value) {
  return [7, 30, 90].includes(Number(value)) ? Number(value) : 30;
}

export async function getAnalyticsDashboard(daysValue) {
  const days = normalizeAnalyticsDays(daysValue);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const [summaryResult,dailyResult,vehiclesResult,registrationsResult,recentResult,accountsResult] = await Promise.all([
    pool.query(`SELECT
      count(DISTINCT visitor_id)::int AS visitors,
      count(DISTINCT session_id)::int AS sessions,
      count(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      count(*) FILTER (WHERE event_name='vehicle_view')::int AS vehicle_views,
      count(*) FILTER (WHERE event_name='availability_click')::int AS availability_clicks,
      count(*) FILTER (WHERE event_name='registration_completed')::int AS registrations,
      count(*) FILTER (WHERE event_name='custom_search_submitted')::int AS custom_searches,
      count(*) FILTER (WHERE event_name='favorite_added')::int AS favorites
      FROM analytics_events WHERE created_at >= $1`, [cutoff]),
    pool.query(`SELECT created_at::date::text AS day,
      count(DISTINCT visitor_id)::int AS visitors,
      count(*) FILTER (WHERE event_name='vehicle_view')::int AS vehicle_views,
      count(*) FILTER (WHERE event_name='availability_click')::int AS availability_clicks,
      count(*) FILTER (WHERE event_name='registration_completed')::int AS registrations,
      count(*) FILTER (WHERE event_name='custom_search_submitted')::int AS custom_searches
      FROM analytics_events WHERE created_at >= $1 GROUP BY created_at::date ORDER BY created_at::date`, [cutoff]),
    pool.query(`SELECT listing_id, max(listing_title) AS listing_title,
      count(*) FILTER (WHERE event_name='vehicle_view')::int AS views,
      count(*) FILTER (WHERE event_name='availability_click')::int AS availability_clicks,
      count(*) FILTER (WHERE event_name='favorite_added')::int AS favorites
      FROM analytics_events WHERE created_at >= $1 AND listing_id IS NOT NULL
      GROUP BY listing_id ORDER BY availability_clicks DESC, views DESC LIMIT 30`, [cutoff]),
    // Список регистраций читаем из таблицы аккаунтов, а не из событий: события
    // принимаются без пароля и подделываются, а аккаунт создаётся только настоящей
    // регистрацией. Заодно личные данные остаются в одном месте.
    pool.query(`SELECT name, phone, created_at
      FROM customer_accounts WHERE created_at >= $1
      ORDER BY created_at DESC LIMIT 100`, [cutoff]),
    pool.query(`SELECT event_name,listing_id,listing_title,path,created_at
      FROM analytics_events WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 30`, [cutoff]),
    // Регистрации считаем по аккаунтам, а не по событиям — тем же источником, из которого
    // берётся список ниже. Иначе счётчик и список расходятся: событий может не быть вовсе
    // (браузер не отправил, посетитель заблокировал), а аккаунт всё равно создан.
    pool.query(`SELECT created_at::date::text AS day, count(*)::int AS registrations
      FROM customer_accounts WHERE created_at >= $1 GROUP BY 1`, [cutoff]),
  ]);
  const registrationsByDay = new Map(accountsResult.rows.map((row) => [row.day, row.registrations]));
  const registrations = [...registrationsByDay.values()].reduce((total, value) => total + value, 0);
  // День с регистрацией, но без событий, в выборке событий не появится — добавляем его сами,
  // иначе регистрация исчезла бы из графика.
  const daily = dailyResult.rows.map((row) => ({ ...row, registrations:registrationsByDay.get(row.day) || 0 }));
  for (const [day, count] of registrationsByDay) {
    if (!daily.some((row) => row.day === day)) daily.push({ day, visitors:0, vehicle_views:0, availability_clicks:0, registrations:count, custom_searches:0 });
  }
  daily.sort((left, right) => left.day.localeCompare(right.day));
  return {
    days,
    generatedAt:new Date().toISOString(),
    summary:{ ...summaryResult.rows[0], registrations },
    daily,
    vehicles:vehiclesResult.rows.map((row) => ({ listingId:row.listing_id, listingTitle:row.listing_title, views:row.views, availabilityClicks:row.availability_clicks, favorites:row.favorites })),
    // Телефон в таблице аккаунтов лежит только цифрами: плюс возвращаем, чтобы в
    // разделе он читался и работала ссылка «позвонить».
    registrations:registrationsResult.rows.map((row) => ({ name:row.name, phone:row.phone ? `+${row.phone}` : "", createdAt:row.created_at })),
    recent:recentResult.rows.map((row) => ({ eventName:row.event_name, listingId:row.listing_id, listingTitle:row.listing_title, path:row.path, createdAt:row.created_at })),
  };
}

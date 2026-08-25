import crypto from "node:crypto";
import { pool } from "./db.mjs";
import { readCookie } from "./auth.mjs";

export const ANALYTICS_EVENTS = new Set([
  "page_view",
  "vehicle_view",
  "availability_click",
  "registration_completed",
  "favorite_added",
  "search_saved",
  "custom_search_submitted",
]);

const COOKIE_NAME = "abcars_analytics";
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

// Одно и то же действие иногда приходит дважды подряд: страница из старого кэша
// браузера, повторный рендер, двойной клик. Такой повтор — не второй просмотр,
// поэтому в пределах нескольких секунд одинаковые события не записываем. Проверка
// стоит на сервере, а не только в браузере: у части посетителей загружен старый
// код сайта, и починить их можно только здесь.
export const ANALYTICS_REPEAT_SECONDS = 5;
const INSERT_EVENT_SQL = `INSERT INTO analytics_events (event_id,visitor_id,session_id,event_name,path,listing_id,listing_title,properties)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8
     WHERE NOT EXISTS (
       SELECT 1 FROM analytics_events
       WHERE visitor_id=$2 AND event_name=$4 AND coalesce(listing_id,'')=coalesce($6,'')
         -- У события про машину примета — сама машина: «быстрый просмотр» в каталоге
         -- и открытая следом карточка лежат на разных адресах, но взгляд один.
         AND ($6 IS NOT NULL OR path=$5)
         AND created_at > now() - interval '${ANALYTICS_REPEAT_SECONDS} seconds'
     )
     ON CONFLICT (event_id) DO NOTHING`;

export async function recordAnalyticsEvent(body, { db = pool } = {}) {
  const event = normalizeAnalyticsEvent(body);
  if (event.error) return event;
  const result = await db.query(INSERT_EVENT_SQL,
    [event.eventId,event.visitorId,event.sessionId,event.eventName,event.path,event.listingId,event.listingTitle,JSON.stringify(event.properties)],
  );
  return { ok:true, recorded:result.rowCount > 0 };
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

// Свои собственные аккаунты помечены в базе как служебные: без этого наша
// регистрация, наше избранное и пробные заявки попадают в раздел как интерес
// клиентов. Заявку с сайта опознаём по телефону: форму заполняют без входа
// в кабинет, аккаунт к ней не привязан.
const STAFF_IDS = "SELECT id FROM customer_accounts WHERE staff";
const STAFF_PHONES = "SELECT phone FROM customer_accounts WHERE staff AND phone <> ''";
export const notStaffAccount = (column) => `${column} NOT IN (${STAFF_IDS})`;
export const notStaffContact = (column) => `regexp_replace(${column}, '\\D', '', 'g') NOT IN (${STAFF_PHONES})`;

export function normalizeAnalyticsDays(value) {
  return [7, 30, 90].includes(Number(value)) ? Number(value) : 30;
}

export async function getAnalyticsDashboard(daysValue) {
  const days = normalizeAnalyticsDays(daysValue);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  // Всё, что оставило след в базе — заявки, избранное, регистрации, — считаем по самим
  // таблицам, а не по событиям из браузера: событие может не дойти (блокировщик, старая
  // вкладка, закрытая страница) и его может подделать кто угодно, а строка в таблице
  // появляется только от настоящего действия. Из событий берём лишь то, чего в базе нет:
  // посетителей, заходы и просмотры карточек.
  const [summaryResult,actionsResult,dailyResult,vehiclesResult,registrationsResult,recentResult,accountsResult,actionsDailyResult] = await Promise.all([
    pool.query(`SELECT
      count(DISTINCT visitor_id)::int AS visitors,
      count(DISTINCT session_id)::int AS sessions,
      count(*) FILTER (WHERE event_name='page_view')::int AS page_views,
      count(*) FILTER (WHERE event_name='vehicle_view')::int AS vehicle_views
      FROM analytics_events WHERE created_at >= $1`, [cutoff]),
    pool.query(`SELECT
      (SELECT count(*) FROM customer_orders WHERE created_at >= $1 AND ${notStaffAccount("customer_id")})::int
        + (SELECT count(*) FROM order_drafts WHERE created_at >= $1 AND coalesce(calculation->>'requestType','') <> 'catalog_search' AND ${notStaffContact("contact")})::int AS availability_clicks,
      (SELECT count(*) FROM customer_favorites WHERE created_at >= $1 AND ${notStaffAccount("customer_id")})::int AS favorites,
      (SELECT count(*) FROM order_drafts WHERE created_at >= $1 AND calculation->>'requestType' = 'catalog_search' AND ${notStaffContact("contact")})::int AS custom_searches`, [cutoff]),
    pool.query(`SELECT created_at::date::text AS day,
      count(DISTINCT visitor_id)::int AS visitors,
      count(*) FILTER (WHERE event_name='vehicle_view')::int AS vehicle_views
      FROM analytics_events WHERE created_at >= $1 GROUP BY created_at::date ORDER BY created_at::date`, [cutoff]),
    pool.query(`WITH views AS (
        SELECT listing_id, max(listing_title) AS listing_title,
          count(*) FILTER (WHERE event_name='vehicle_view')::int AS views,
          count(DISTINCT visitor_id) FILTER (WHERE event_name='vehicle_view')::int AS viewers
        FROM analytics_events WHERE created_at >= $1 AND listing_id IS NOT NULL GROUP BY listing_id
      ), asks AS (
        SELECT listing_id, count(*)::int AS n FROM customer_orders WHERE created_at >= $1 AND listing_id IS NOT NULL AND ${notStaffAccount("customer_id")} GROUP BY listing_id
      ), drafts AS (
        SELECT listing_id, count(*)::int AS n FROM order_drafts WHERE created_at >= $1 AND listing_id IS NOT NULL AND ${notStaffContact("contact")} GROUP BY listing_id
      ), favs AS (
        SELECT listing_id, count(*)::int AS n FROM customer_favorites WHERE created_at >= $1 AND ${notStaffAccount("customer_id")} GROUP BY listing_id
      ), ids AS (
        SELECT listing_id FROM views UNION SELECT listing_id FROM asks UNION SELECT listing_id FROM drafts UNION SELECT listing_id FROM favs
      )
      SELECT ids.listing_id,
        COALESCE(views.listing_title, l.title) AS listing_title,
        COALESCE(views.views, 0) AS views,
        COALESCE(views.viewers, 0) AS viewers,
        COALESCE(asks.n, 0) + COALESCE(drafts.n, 0) AS availability_clicks,
        COALESCE(favs.n, 0) AS favorites
      FROM ids
      LEFT JOIN views ON views.listing_id = ids.listing_id
      LEFT JOIN asks ON asks.listing_id = ids.listing_id
      LEFT JOIN drafts ON drafts.listing_id = ids.listing_id
      LEFT JOIN favs ON favs.listing_id = ids.listing_id
      LEFT JOIN listings l ON l.id = ids.listing_id
      ORDER BY availability_clicks DESC, favorites DESC, views DESC LIMIT 30`, [cutoff]),
    // Список регистраций читаем из таблицы аккаунтов, а не из событий: события
    // принимаются без пароля и подделываются, а аккаунт создаётся только настоящей
    // регистрацией. Заодно личные данные остаются в одном месте.
    pool.query(`SELECT name, phone, created_at
      FROM customer_accounts WHERE created_at >= $1 AND NOT staff
      ORDER BY created_at DESC LIMIT 100`, [cutoff]),
    pool.query(`SELECT event_name,listing_id,listing_title,path,created_at
      FROM analytics_events WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 30`, [cutoff]),
    // Регистрации считаем по аккаунтам, а не по событиям — тем же источником, из которого
    // берётся список ниже. Иначе счётчик и список расходятся: событий может не быть вовсе
    // (браузер не отправил, посетитель заблокировал), а аккаунт всё равно создан.
    pool.query(`SELECT created_at::date::text AS day, count(*)::int AS registrations
      FROM customer_accounts WHERE created_at >= $1 AND NOT staff GROUP BY 1`, [cutoff]),
    pool.query(`SELECT day, sum(availability_clicks)::int AS availability_clicks, sum(custom_searches)::int AS custom_searches FROM (
        SELECT created_at::date::text AS day, count(*)::int AS availability_clicks, 0 AS custom_searches
          FROM customer_orders WHERE created_at >= $1 AND ${notStaffAccount("customer_id")} GROUP BY 1
        UNION ALL
        SELECT created_at::date::text AS day,
          count(*) FILTER (WHERE coalesce(calculation->>'requestType','') <> 'catalog_search')::int,
          count(*) FILTER (WHERE calculation->>'requestType' = 'catalog_search')::int
          FROM order_drafts WHERE created_at >= $1 AND ${notStaffContact("contact")} GROUP BY 1
      ) t GROUP BY day`, [cutoff]),
  ]);
  const actionsByDay = new Map(actionsDailyResult.rows.map((row) => [row.day, row]));
  const registrationsByDay = new Map(accountsResult.rows.map((row) => [row.day, row.registrations]));
  const registrations = [...registrationsByDay.values()].reduce((total, value) => total + value, 0);
  // День с регистрацией, но без событий, в выборке событий не появится — добавляем его сами,
  // иначе регистрация исчезла бы из графика.
  const dayAction = (day, key) => Number(actionsByDay.get(day)?.[key]) || 0;
  const daily = dailyResult.rows.map((row) => ({
    ...row,
    availability_clicks:dayAction(row.day, "availability_clicks"),
    custom_searches:dayAction(row.day, "custom_searches"),
    registrations:registrationsByDay.get(row.day) || 0,
  }));
  // День с заявкой или регистрацией, но без событий, в выборке событий не появится —
  // добавляем его сами, иначе действие исчезло бы из графика.
  for (const day of new Set([...registrationsByDay.keys(), ...actionsByDay.keys()])) {
    if (daily.some((row) => row.day === day)) continue;
    daily.push({
      day,
      visitors:0,
      vehicle_views:0,
      availability_clicks:dayAction(day, "availability_clicks"),
      registrations:registrationsByDay.get(day) || 0,
      custom_searches:dayAction(day, "custom_searches"),
    });
  }
  daily.sort((left, right) => left.day.localeCompare(right.day));
  return {
    days,
    generatedAt:new Date().toISOString(),
    summary:{ ...summaryResult.rows[0], ...actionsResult.rows[0], registrations },
    daily,
    vehicles:vehiclesResult.rows.map((row) => ({ listingId:row.listing_id, listingTitle:row.listing_title, views:row.views, viewers:row.viewers, availabilityClicks:row.availability_clicks, favorites:row.favorites })),
    // Телефон в таблице аккаунтов лежит только цифрами: плюс возвращаем, чтобы в
    // разделе он читался и работала ссылка «позвонить».
    registrations:registrationsResult.rows.map((row) => ({ name:row.name, phone:row.phone ? `+${row.phone}` : "", createdAt:row.created_at })),
    recent:recentResult.rows.map((row) => ({ eventName:row.event_name, listingId:row.listing_id, listingTitle:row.listing_title, path:row.path, createdAt:row.created_at })),
  };
}

// Заявки собираются из двух мест сразу: формы на сайте пишут в `order_drafts`, а
// кабинет — в `customer_orders`. Менеджеру важен один список по дате, поэтому обе
// таблицы приводятся к общей форме здесь, а не в браузере.
const LEADS_LIMIT = 200;

const leadCar = (row) => (row.listing_id ? {
  id:row.listing_id,
  title:row.title || row.listing_id,
  brand:row.brand || "",
  model:row.model || "",
  year:row.model_year || null,
  city:row.city || "",
  mileage:Number(row.mileage_km) || 0,
  estimatedTotalUsd:Number(row.estimated_total_usd) || null,
  image:row.image || null,
  // Объявление могли снять с продажи после заявки — тогда join не найдёт строку,
  // но идентификатор всё равно показываем, чтобы заявка не осталась безымянной.
  missing:!row.title,
} : null);

const leadPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
};

const draftKind = (row) => {
  const requestType = String(row.calculation?.requestType || "");
  if (requestType === "catalog_search") return "custom_search";
  if (requestType === "availability_check") return "availability";
  return "listing_draft";
};

export async function getAnalyticsLeads() {
  const [draftsResult, ordersResult] = await Promise.all([
    pool.query(`SELECT d.id,d.listing_id,d.customer_name,d.contact,d.calculation,d.status,d.created_at,
      l.title,l.estimated_total_usd,l.mileage_km,l.city,
      v.brand,v.model,v.model_year,
      (SELECT m.url FROM listing_media m WHERE m.listing_id=d.listing_id ORDER BY m.position LIMIT 1) AS image
      FROM order_drafts d
      LEFT JOIN listings l ON l.id=d.listing_id
      LEFT JOIN vehicles v ON v.id=l.vehicle_id
      WHERE ${notStaffContact("d.contact")}
      ORDER BY d.created_at DESC LIMIT ${LEADS_LIMIT}`),
    pool.query(`SELECT o.id,o.listing_id,o.availability_status,o.availability_comment,o.availability_requested_at,
      o.contact_name,o.contact_phone,o.contact_methods,o.contact_saved_at,
      o.inspection_status,o.contract_status,o.payment_status,o.created_at,o.updated_at,
      a.name AS account_name,a.phone AS account_phone,a.email AS account_email,a.telegram AS account_telegram,
      a.city AS account_city,a.preferred_contact,
      l.title,l.estimated_total_usd,l.mileage_km,l.city,
      v.brand,v.model,v.model_year,
      (SELECT m.url FROM listing_media m WHERE m.listing_id=o.listing_id ORDER BY m.position LIMIT 1) AS image
      FROM customer_orders o
      JOIN customer_accounts a ON a.id=o.customer_id
      LEFT JOIN listings l ON l.id=o.listing_id
      LEFT JOIN vehicles v ON v.id=l.vehicle_id
      WHERE ${notStaffAccount("o.customer_id")}
      ORDER BY o.created_at DESC LIMIT ${LEADS_LIMIT}`),
  ]);
  const drafts = draftsResult.rows.map((row) => ({
    id:`draft-${row.id}`,
    source:"site",
    kind:draftKind(row),
    createdAt:row.created_at,
    car:leadCar(row),
    customer:{
      name:row.customer_name || "",
      phone:leadPhone(row.contact),
      contact:String(row.contact || ""),
      methods:Array.isArray(row.calculation?.contactMethods) ? row.calculation.contactMethods : [],
      email:"",
      telegram:"",
      city:"",
    },
    comment:String(row.calculation?.preferences || "").trim(),
    // Фильтры каталога — единственная подсказка, что человек искал, когда конкретного
    // автомобиля в заявке нет.
    filters:row.calculation?.catalogFilters && typeof row.calculation.catalogFilters === "object" ? row.calculation.catalogFilters : null,
    stages:null,
  }));
  const orders = ordersResult.rows.map((row) => ({
    id:`order-${row.id}`,
    source:"account",
    kind:row.availability_status === "decision" ? "order_started" : "availability",
    orderNumber:`EV-${new Date(row.created_at).getUTCFullYear()}-${String(row.id).padStart(6, "0")}`,
    createdAt:row.availability_requested_at || row.created_at,
    updatedAt:row.updated_at,
    car:leadCar(row),
    customer:{
      name:row.contact_name || row.account_name || "",
      phone:leadPhone(row.contact_phone || row.account_phone),
      contact:row.contact_phone || leadPhone(row.account_phone),
      methods:Array.isArray(row.contact_methods) ? row.contact_methods : [],
      email:row.account_email || "",
      telegram:row.account_telegram || "",
      city:row.account_city || "",
      preferredContact:row.preferred_contact || "phone",
      accountName:row.account_name || "",
    },
    comment:String(row.availability_comment || "").trim(),
    filters:null,
    stages:{
      availability:row.availability_status,
      inspection:row.inspection_status,
      contract:row.contract_status,
      payment:row.payment_status,
    },
  }));
  const leads = [...drafts, ...orders].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)).slice(0, LEADS_LIMIT);
  return { generatedAt:new Date().toISOString(), leads };
}

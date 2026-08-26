const EVENTS = new Set(["page_view", "vehicle_view", "availability_click", "registration_completed", "favorite_added", "custom_search_submitted"]);
const COOKIE_NAME = "abcars_analytics";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const encoder = new TextEncoder();
const clean = (value, max) => String(value || "").trim().slice(0, max);
let schemaPromise;

const json = (payload, status = 200, headers = {}) => Response.json(payload, { status, headers:{ "cache-control":"no-store", ...headers } });
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromBase64url = (value) => Uint8Array.from(atob(String(value).replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
const cookieValue = (header, name) => String(header || "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) || "";

// Те же два фильтра, что на основном хостинге (server/analytics.mjs): событие
// принимаем только со страницы настоящего адреса сайта и только от браузера, который
// не называет себя роботом. Запрос мимо браузера и заход по числовому адресу сервера
// в статистику не идут.
const BOT_AGENT = /bot|claude\/|crawl|spider|slurp|scrape|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|httpclient|http-client|libwww|okhttp|java\/|axios|node-fetch|go-http|lighthouse|pagespeed|pingdom|uptime|monitor|preview|fetcher|archiver|feed/i;
export const workerBotAgent = (agent) => { const value = String(agent || "").trim(); return !value || BOT_AGENT.test(value); };
export const workerOwnPage = (request, env) => {
  let site = "";
  try { site = new URL(String(env?.SITE_URL || "https://abcars.by")).hostname.toLowerCase().replace(/^www\./, ""); } catch { site = ""; }
  if (!site) return false;
  const hosts = [site, `www.${site}`];
  const origin = String(request.headers.get("origin") || "").toLowerCase();
  if (origin) return hosts.some((name) => origin === `https://${name}` || origin === `http://${name}`);
  const referer = String(request.headers.get("referer") || "").toLowerCase();
  return hosts.some((name) => referer === `https://${name}` || referer === `http://${name}`
    || referer.startsWith(`https://${name}/`) || referer.startsWith(`http://${name}/`));
};

export function normalizeWorkerEvent(body = {}) {
  const eventName = clean(body.eventName, 64);
  if (!EVENTS.has(eventName)) return { error:"invalid_event" };
  const eventId = clean(body.eventId, 80);
  const visitorId = clean(body.visitorId, 80);
  const sessionId = clean(body.sessionId, 80);
  if (!eventId || !visitorId || !sessionId) return { error:"invalid_event_identity" };
  const source = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
  // Личные данные в события не принимаем: приём событий открыт без пароля, поэтому имя
  // и телефон здесь были бы вторым, подделываемым экземпляром персональных данных.
  const properties = {};
  if (source.source) properties.source = clean(source.source, 40);
  return {
    eventId,
    visitorId,
    sessionId,
    eventName,
    path:clean(body.path, 400) || "/",
    listingId:clean(body.listingId, 200) || null,
    listingTitle:clean(body.listingTitle, 240) || null,
    properties,
    // Признак живого человека страница ставит сама, когда посетитель себя проявил.
    // Отдельно — было ли настоящее действие: одно лишь время на странице выжидает
    // обходчик, поэтому в посетители раздел берёт только по действию.
    human:body.human === true,
    humanAction:body.humanAction === true,
  };
}

async function ensureSchema(db) {
  if (!schemaPromise) schemaPromise = db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      visitor_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      path TEXT NOT NULL,
      listing_id TEXT,
      listing_title TEXT,
      properties TEXT NOT NULL DEFAULT '{}',
      human INTEGER NOT NULL DEFAULT 0,
      human_action INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created ON analytics_events(event_name, created_at DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_events_listing_created ON analytics_events(listing_id, created_at DESC) WHERE listing_id IS NOT NULL"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_created ON analytics_events(visitor_id, created_at DESC)"),
  ]).catch((error) => { schemaPromise = undefined; throw error; });
  await schemaPromise;
}

async function hash(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(value))));
}
const equalBytes = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);
async function passwordMatches(input, expected) { return equalBytes(await hash(input), await hash(expected)); }

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function createToken(secret, now = Date.now()) {
  const payload = base64url(encoder.encode(JSON.stringify({ iat:now, exp:now + SESSION_TTL_SECONDS * 1000 })));
  return `${payload}.${base64url(await sign(payload, secret))}`;
}

async function validToken(token, secret, now = Date.now()) {
  if (!token || !secret) return false;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature) return false;
  try {
    const expected = await sign(payload, secret);
    if (!equalBytes(fromBase64url(signature), expected)) return false;
    const value = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return Number(value.iat) <= now && Number(value.exp) > now;
  } catch { return false; }
}

const sessionCookie = (token, request, clear = false) => `${COOKIE_NAME}=${clear ? "" : encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_TTL_SECONDS}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
const daysValue = (url) => [7, 30, 90].includes(Number(url.searchParams.get("days"))) ? Number(url.searchParams.get("days")) : 30;

async function dashboard(db, days) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  // Список регистраций с контактами живёт только там, где есть таблица аккаунтов
  // (основной хостинг). Здесь остаётся счётчик регистраций без личных данных.
  const [summary,daily,vehicles,recent] = await Promise.all([
    db.prepare(`SELECT count(DISTINCT visitor_id) AS visitors, count(DISTINCT session_id) AS sessions,
      sum(CASE WHEN event_name='page_view' THEN 1 ELSE 0 END) AS page_views,
      sum(CASE WHEN event_name='vehicle_view' THEN 1 ELSE 0 END) AS vehicle_views,
      sum(CASE WHEN event_name='availability_click' THEN 1 ELSE 0 END) AS availability_clicks,
      sum(CASE WHEN event_name='registration_completed' THEN 1 ELSE 0 END) AS registrations,
      sum(CASE WHEN event_name='custom_search_submitted' THEN 1 ELSE 0 END) AS custom_searches,
      sum(CASE WHEN event_name='favorite_added' THEN 1 ELSE 0 END) AS favorites
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1)`).bind(cutoff, cutoff).first(),
    db.prepare(`SELECT date(created_at) AS day, count(DISTINCT visitor_id) AS visitors,
      sum(CASE WHEN event_name='vehicle_view' THEN 1 ELSE 0 END) AS vehicle_views,
      sum(CASE WHEN event_name='availability_click' THEN 1 ELSE 0 END) AS availability_clicks,
      sum(CASE WHEN event_name='registration_completed' THEN 1 ELSE 0 END) AS registrations,
      sum(CASE WHEN event_name='custom_search_submitted' THEN 1 ELSE 0 END) AS custom_searches
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1)
      GROUP BY date(created_at) ORDER BY date(created_at)`).bind(cutoff, cutoff).all(),
    db.prepare(`SELECT listing_id, max(listing_title) AS listing_title,
      sum(CASE WHEN event_name='vehicle_view' THEN 1 ELSE 0 END) AS views,
      sum(CASE WHEN event_name='availability_click' THEN 1 ELSE 0 END) AS availability_clicks,
      sum(CASE WHEN event_name='favorite_added' THEN 1 ELSE 0 END) AS favorites
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND listing_id IS NOT NULL AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1)
      GROUP BY listing_id ORDER BY availability_clicks DESC, views DESC LIMIT 30`).bind(cutoff, cutoff).all(),
    db.prepare(`SELECT event_name,listing_id,listing_title,path,created_at
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1) ORDER BY created_at DESC LIMIT 30`).bind(cutoff, cutoff).all(),
  ]);
  const safeSummary = Object.fromEntries(Object.entries(summary || {}).map(([key,value]) => [key,Number(value) || 0]));
  return {
    days,
    generatedAt:new Date().toISOString(),
    summary:safeSummary,
    daily:daily.results || [],
    vehicles:(vehicles.results || []).map((row) => ({ listingId:row.listing_id, listingTitle:row.listing_title, views:row.views, availabilityClicks:row.availability_clicks, favorites:row.favorites })),
    registrations:[],
    recent:(recent.results || []).map((row) => ({ eventName:row.event_name, listingId:row.listing_id, listingTitle:row.listing_title, path:row.path, createdAt:row.created_at })),
  };
}

export async function handleAnalyticsRequest(request, env, url) {
  if (!url.pathname.startsWith("/api/analytics/")) return null;
  const password = String(env.ANALYTICS_PASSWORD || "");
  const secret = String(env.ANALYTICS_SESSION_SECRET || password);
  if (request.method === "POST" && url.pathname === "/api/analytics/login") {
    if (!password) return json({ error:"analytics_not_configured" }, 503);
    const body = await request.json().catch(() => ({}));
    if (!(await passwordMatches(String(body.password || ""), password))) return json({ error:"invalid_password" }, 401);
    return json({ ok:true }, 200, { "set-cookie":sessionCookie(await createToken(secret), request) });
  }
  if (request.method === "POST" && url.pathname === "/api/analytics/logout") {
    return json({ ok:true }, 200, { "set-cookie":sessionCookie("", request, true) });
  }
  if (!env.DB) return json({ error:"analytics_storage_unavailable" }, 503);
  await ensureSchema(env.DB);
  if (request.method === "POST" && url.pathname === "/api/analytics/events") {
    // Отвечаем как обычно и молчим о причине: незачем подсказывать, как подделать
    // событие. Страница сайта ответ всё равно не читает.
    if (!workerOwnPage(request, env) || workerBotAgent(request.headers.get("user-agent"))) return json({ ok:true, recorded:false }, 202);
    const event = normalizeWorkerEvent(await request.json().catch(() => ({})));
    if (event.error) return json(event, 400);
    await env.DB.prepare(`INSERT INTO analytics_events (event_id,visitor_id,session_id,event_name,path,listing_id,listing_title,properties,human,human_action)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING`)
      .bind(event.eventId,event.visitorId,event.sessionId,event.eventName,event.path,event.listingId,event.listingTitle,JSON.stringify(event.properties),event.human ? 1 : 0,event.humanAction ? 1 : 0).run();
    return json({ ok:true }, 202);
  }
  // Страница сообщает, что за заходом стоит живой человек: он подвигал мышью,
  // коснулся экрана, прокрутил или нажал клавишу.
  if (request.method === "POST" && url.pathname === "/api/analytics/human") {
    if (!workerOwnPage(request, env) || workerBotAgent(request.headers.get("user-agent"))) return json({ ok:true, confirmed:0 }, 202);
    const body = await request.json().catch(() => ({}));
    const visitorId = clean(body.visitorId, 80);
    const sessionId = clean(body.sessionId, 80);
    if (!visitorId || !sessionId) return json({ error:"invalid_event_identity" }, 400);
    const action = body.action === true ? 1 : 0;
    const result = await env.DB.prepare(`UPDATE analytics_events SET human = 1, human_action = max(human_action, ?)
        WHERE visitor_id = ? AND session_id = ? AND NOT (human = 1 AND (human_action = 1 OR ? = 0))`)
      .bind(action, visitorId, sessionId, action).run();
    return json({ ok:true, confirmed:result?.meta?.changes || 0 }, 202);
  }
  if (request.method === "GET" && url.pathname === "/api/analytics/dashboard") {
    const token = decodeURIComponent(cookieValue(request.headers.get("cookie"), COOKIE_NAME));
    if (!(await validToken(token, secret))) return json({ error:"unauthorized" }, 401);
    return json(await dashboard(env.DB, daysValue(url)));
  }
  // Заявки лежат в таблицах аккаунтов и заказов, а их на этом хостинге нет: отвечаем
  // честным признаком «раздел недоступен», чтобы раздел не выглядел пустым по ошибке.
  if (request.method === "GET" && url.pathname === "/api/analytics/leads") {
    const token = decodeURIComponent(cookieValue(request.headers.get("cookie"), COOKIE_NAME));
    if (!(await validToken(token, secret))) return json({ error:"unauthorized" }, 401);
    return json({ generatedAt:new Date().toISOString(), leads:[], unavailable:true });
  }
  if (request.method === "DELETE" && url.pathname === "/api/analytics/events") {
    const token = decodeURIComponent(cookieValue(request.headers.get("cookie"), COOKIE_NAME));
    if (!(await validToken(token, secret))) return json({ error:"unauthorized" }, 401);
    const result = await env.DB.prepare("DELETE FROM analytics_events").run();
    return json({ ok:true, deleted:Number(result.meta?.changes) || 0 });
  }
  return json({ error:"not_found" }, 404);
}

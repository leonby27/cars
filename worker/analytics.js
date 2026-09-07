const EVENTS = new Set(["page_view", "vehicle_view", "availability_click", "registration_completed", "favorite_added", "custom_search_submitted"]);
const COOKIE_NAME = "abcars_analytics";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const encoder = new TextEncoder();
const clean = (value, max) => String(value || "").trim().slice(0, max);
let schemaPromise;

const workerInternalAnalyticsPath = (value = "") => {
  let pathname = String(value || "");
  try { pathname = new URL(pathname, "https://abcars.invalid").pathname; } catch { pathname = pathname.split(/[?#]/, 1)[0]; }
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  return cleanPath === "/analytics" || cleanPath.startsWith("/analytics/");
};
const workerFromAnalyticsPage = (request) => {
  const referer = request.headers.get("referer") || "";
  if (!referer) return false;
  try { return workerInternalAnalyticsPath(new URL(referer).pathname); } catch { return false; }
};
const PUBLIC_EVENT = "path <> '/analytics' AND path NOT LIKE '/analytics/%' AND path NOT LIKE '/analytics?%'";

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
  const path = clean(body.path, 400) || "/";
  if (workerInternalAnalyticsPath(path)) return { ignored:true };
  if (!eventId || !visitorId || !sessionId) return { error:"invalid_event_identity" };
  const source = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
  // Личные данные в события не принимаем: приём событий открыт без пароля, поэтому имя
  // и телефон здесь были бы вторым, подделываемым экземпляром персональных данных.
  const properties = {};
  if (source.source) properties.source = clean(source.source, 40);
  if (source.entrySource) properties.entrySource = clean(source.entrySource, 160).toLowerCase();
  return {
    eventId,
    visitorId,
    sessionId,
    eventName,
    path,
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
const daysValue = (url) => {
  const value = Number(url.searchParams.get("period") || url.searchParams.get("days"));
  return [7, 30, 90].includes(value) ? value : 30;
};

async function trend(db, days) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const daily = await db.prepare(`SELECT date(created_at) AS day, count(DISTINCT visitor_id) AS visitors
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND ${PUBLIC_EVENT}
        AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1 AND ${PUBLIC_EVENT})
      GROUP BY date(created_at) ORDER BY date(created_at)`).bind(cutoff, cutoff).all();
  return { days, period:String(days), generatedAt:new Date().toISOString(), daily:daily.results || [] };
}

async function dashboard(db, days) {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  // Список регистраций с контактами живёт только там, где есть таблица аккаунтов
  // (основной хостинг). Здесь остаётся счётчик регистраций без личных данных.
  const [summary,daily,vehicles,recent,visits] = await Promise.all([
    db.prepare(`SELECT count(DISTINCT visitor_id) AS visitors, count(DISTINCT session_id) AS sessions,
      sum(CASE WHEN event_name='page_view' THEN 1 ELSE 0 END) AS page_views,
      sum(CASE WHEN event_name='vehicle_view' THEN 1 ELSE 0 END) AS vehicle_views,
      sum(CASE WHEN event_name='availability_click' THEN 1 ELSE 0 END) AS availability_clicks,
      sum(CASE WHEN event_name='registration_completed' THEN 1 ELSE 0 END) AS registrations,
      sum(CASE WHEN event_name='custom_search_submitted' THEN 1 ELSE 0 END) AS custom_searches,
      sum(CASE WHEN event_name='favorite_added' THEN 1 ELSE 0 END) AS favorites
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND ${PUBLIC_EVENT} AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1 AND ${PUBLIC_EVENT})`).bind(cutoff, cutoff).first(),
    db.prepare(`SELECT date(created_at) AS day, count(DISTINCT visitor_id) AS visitors,
      sum(CASE WHEN event_name='vehicle_view' THEN 1 ELSE 0 END) AS vehicle_views,
      sum(CASE WHEN event_name='availability_click' THEN 1 ELSE 0 END) AS availability_clicks,
      sum(CASE WHEN event_name='registration_completed' THEN 1 ELSE 0 END) AS registrations,
      sum(CASE WHEN event_name='custom_search_submitted' THEN 1 ELSE 0 END) AS custom_searches
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND ${PUBLIC_EVENT} AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1 AND ${PUBLIC_EVENT})
      GROUP BY date(created_at) ORDER BY date(created_at)`).bind(cutoff, cutoff).all(),
    db.prepare(`SELECT listing_id, max(listing_title) AS listing_title,
      sum(CASE WHEN event_name='vehicle_view' THEN 1 ELSE 0 END) AS views,
      sum(CASE WHEN event_name='availability_click' THEN 1 ELSE 0 END) AS availability_clicks,
      sum(CASE WHEN event_name='favorite_added' THEN 1 ELSE 0 END) AS favorites
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND listing_id IS NOT NULL AND ${PUBLIC_EVENT} AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1 AND ${PUBLIC_EVENT})
      GROUP BY listing_id ORDER BY availability_clicks DESC, views DESC LIMIT 30`).bind(cutoff, cutoff).all(),
    db.prepare(`SELECT event_name,listing_id,listing_title,path,created_at
      FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND ${PUBLIC_EVENT} AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1 AND ${PUBLIC_EVENT}) ORDER BY created_at DESC LIMIT 30`).bind(cutoff, cutoff).all(),
    db.prepare(`WITH ordered AS (
        SELECT visitor_id, created_at, path, event_name, properties,
          lag(created_at) OVER (PARTITION BY visitor_id ORDER BY datetime(created_at)) AS previous_at
        FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND ${PUBLIC_EVENT}
          AND visitor_id IN (SELECT visitor_id FROM analytics_events WHERE datetime(created_at) >= datetime(?) AND human_action = 1 AND ${PUBLIC_EVENT})
      ), marked AS (
        SELECT *, CASE WHEN previous_at IS NULL OR datetime(created_at) > datetime(previous_at, '+30 minutes') THEN 1 ELSE 0 END AS starts_visit
        FROM ordered
      ), numbered AS (
        SELECT *, sum(starts_visit) OVER (PARTITION BY visitor_id ORDER BY datetime(created_at) ROWS UNBOUNDED PRECEDING) AS visit_number
        FROM marked
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY visitor_id, visit_number ORDER BY datetime(created_at)) AS visit_step
        FROM numbered
      )
      SELECT max(CASE WHEN visit_step=1 THEN path END) AS landing_path,
        max(CASE WHEN visit_step=1 THEN json_extract(properties, '$.entrySource') END) AS entry_source,
        sum(CASE WHEN event_name='page_view' THEN 1 ELSE 0 END) AS page_views,
        min(created_at) AS created_at
      FROM ranked GROUP BY visitor_id, visit_number ORDER BY min(datetime(created_at)) DESC`).bind(cutoff, cutoff).all(),
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
    visits:(visits.results || []).map((row) => ({ source:row.entry_source || "", landingPath:row.landing_path || "/", pageViews:Number(row.page_views) || 0, createdAt:row.created_at })),
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
  if (request.method === "GET" && url.pathname === "/api/analytics/search-traffic") {
    const token = cookieValue(request.headers.get("cookie") || "", COOKIE_NAME);
    if (!(await validToken(token, secret))) return json({ error:"unauthorized" }, 401);
    const period = url.searchParams.get("period");
    return json(await readSearchTraffic(period, env, workerSearchStore(env.DB)));
  }
  if (!env.DB) return json({ error:"analytics_storage_unavailable" }, 503);
  await ensureSchema(env.DB);
  if (request.method === "POST" && url.pathname === "/api/analytics/events") {
    // Отвечаем как обычно и молчим о причине: незачем подсказывать, как подделать
    // событие. Страница сайта ответ всё равно не читает.
    if (!workerOwnPage(request, env) || workerFromAnalyticsPage(request) || workerBotAgent(request.headers.get("user-agent"))) return json({ ok:true, recorded:false }, 202);
    const event = normalizeWorkerEvent(await request.json().catch(() => ({})));
    if (event.ignored) return json({ ok:true, recorded:false }, 202);
    if (event.error) return json(event, 400);
    await env.DB.prepare(`INSERT INTO analytics_events (event_id,visitor_id,session_id,event_name,path,listing_id,listing_title,properties,human,human_action)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING`)
      .bind(event.eventId,event.visitorId,event.sessionId,event.eventName,event.path,event.listingId,event.listingTitle,JSON.stringify(event.properties),event.human ? 1 : 0,event.humanAction ? 1 : 0).run();
    return json({ ok:true }, 202);
  }
  // Страница сообщает, что за заходом стоит живой человек: он подвигал мышью,
  // коснулся экрана, прокрутил или нажал клавишу.
  if (request.method === "POST" && url.pathname === "/api/analytics/human") {
    if (!workerOwnPage(request, env) || workerFromAnalyticsPage(request) || workerBotAgent(request.headers.get("user-agent"))) return json({ ok:true, confirmed:0 }, 202);
    const body = await request.json().catch(() => ({}));
    const visitorId = clean(body.visitorId, 80);
    const sessionId = clean(body.sessionId, 80);
    if (!visitorId || !sessionId) return json({ error:"invalid_event_identity" }, 400);
    const action = body.action === true ? 1 : 0;
    const result = await env.DB.prepare(`UPDATE analytics_events SET human = 1, human_action = max(human_action, ?)
        WHERE visitor_id = ? AND session_id = ? AND NOT (human = 1 AND (human_action = 1 OR ? = 0))
          AND ${PUBLIC_EVENT}`)
      .bind(action, visitorId, sessionId, action).run();
    return json({ ok:true, confirmed:result?.meta?.changes || 0 }, 202);
  }
  if (request.method === "GET" && url.pathname === "/api/analytics/dashboard") {
    const token = decodeURIComponent(cookieValue(request.headers.get("cookie"), COOKIE_NAME));
    if (!(await validToken(token, secret))) return json({ error:"unauthorized" }, 401);
    return json(await dashboard(env.DB, daysValue(url)));
  }
  if (request.method === "GET" && url.pathname === "/api/analytics/trend") {
    const token = decodeURIComponent(cookieValue(request.headers.get("cookie"), COOKIE_NAME));
    if (!(await validToken(token, secret))) return json({ error:"unauthorized" }, 401);
    return json(await trend(env.DB, daysValue(url)));
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

// Search Console / Webmaster daily archive. The Node API imports these pure Web-API helpers.
const SEARCH_DAY = 86400000;
const SEARCH_INTERNAL = '^https?://[^/]+/analytics([/?#]|$)';
const searchNumber = (value) => Math.max(0, Number(value) || 0);
const searchDate = (time) => new Date(time + 10800000).toISOString().slice(0, 10);
const addSearchDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * SEARCH_DAY).toISOString().slice(0, 10);
export function searchTrafficRange(period, now = Date.now()) {
  const endDate = searchDate(now - (period === 'yesterday' ? SEARCH_DAY : 0));
  const days = ['today', 'yesterday'].includes(period) ? 1 : [7, 30, 90].includes(Number(period)) ? Number(period) : 30;
  return { period:days === 1 ? period : String(days), startDate:addSearchDays(endDate, 1 - days), endDate, days };
}
export function searchProperties(env) {
  return {
    google:{ property:env.GOOGLE_SEARCH_CONSOLE_SITE || '', configured:Boolean(env.GOOGLE_SEARCH_CONSOLE_SITE && (env.GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON || (env.GOOGLE_SEARCH_CLIENT_ID && env.GOOGLE_SEARCH_CLIENT_SECRET && env.GOOGLE_SEARCH_REFRESH_TOKEN))) },
    yandex:{ property:env.YANDEX_WEBMASTER_HOST_ID || '', configured:Boolean(env.YANDEX_WEBMASTER_HOST_ID && env.YANDEX_WEBMASTER_TOKEN) },
  };
}
const metrikaSettings = (env) => ({
  counter:String(env.YANDEX_METRIKA_COUNTER_ID || '111868764').trim(),
  token:String(env.YANDEX_METRIKA_TOKEN || '').trim(),
});
const metrikaNumber = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
};
const unavailableMetrikaReport = (range, status = 'pending') => ({
  status, period:range.period, from:range.startDate, to:range.endDate,
  visits:null, users:null,
  google:{ visits:null, users:null }, yandex:{ visits:null, users:null },
});

// Оперативные переходы берём из одного поведенческого источника — Метрики. Так
// общий счётчик и разбивка Google/Яндекс означают визиты, а не смесь кликов двух
// поисковых кабинетов с разной задержкой публикации.
export async function fetchMetrikaSearchTraffic(env, period, { now = Date.now(), fetcher = fetch } = {}) {
  const { counter, token } = metrikaSettings(env);
  if (!counter || !token) return { status:'not_connected' };
  const range = searchTrafficRange(period, now);
  const params = new URLSearchParams({
    ids:counter,
    date1:range.startDate,
    date2:range.endDate,
    dimensions:'ym:s:searchEngine',
    metrics:'ym:s:visits,ym:s:users',
    filters:"ym:s:trafficSource=='organic'",
    accuracy:'full',
    limit:'100',
  });
  try {
    const result = await searchJson(fetcher, `https://api-metrika.yandex.net/stat/v1/data?${params}`, { headers:{ Authorization:`OAuth ${token}` } });
    if (!Array.isArray(result.data) || !Array.isArray(result.totals)) throw new Error('upstream_unavailable');
    const visits = metrikaNumber(result.totals[0]);
    const users = metrikaNumber(result.totals[1]);
    if (visits == null || users == null) return unavailableMetrikaReport(range);
    let complete = true;
    const engines = result.data.reduce((totals, row) => {
      const id = String(row.dimensions?.[0]?.id || '').toLowerCase();
      const engine = id === 'google' || id.startsWith('google_') ? 'google'
        : id === 'yandex' || id.startsWith('yandex_') ? 'yandex' : '';
      if (engine) {
        const engineVisits = metrikaNumber(row.metrics?.[0]);
        const engineUsers = metrikaNumber(row.metrics?.[1]);
        if (engineVisits == null || engineUsers == null) complete = false;
        else {
          totals[engine].visits += engineVisits;
          totals[engine].users += engineUsers;
        }
      }
      return totals;
    }, { google:{ visits:0, users:0 }, yandex:{ visits:0, users:0 } });
    if (!complete) return unavailableMetrikaReport(range);
    return {
      status:'ready', period:range.period, from:range.startDate, to:range.endDate,
      visits, users,
      google:engines.google,
      yandex:engines.yandex,
    };
  } catch (failure) {
    return { status:'error', error:failure.message === 'access_denied' ? 'access_denied' : 'load_failed' };
  }
}
async function searchJson(fetcher, url, options = {}) {
  const response = await fetcher(url, { ...options, signal:AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'access_denied' : 'upstream_unavailable');
  return response.json();
}
const searchSort = (rows) => rows.sort((a, b) => b.count - a.count || (b.impressions || 0) - (a.impressions || 0) || a.value.localeCompare(b.value));

export async function fetchGoogleSearchDays(env, { now = Date.now(), days = 14, fetcher = fetch } = {}) {
  let token;
  if (env.GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON) {
    const account = JSON.parse(env.GOOGLE_SEARCH_SERVICE_ACCOUNT_JSON);
    const encode = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const text = (value) => encode(new TextEncoder().encode(JSON.stringify(value)));
    const issuedAt = Math.floor(now / 1000);
    const unsigned = text({ alg:'RS256', typ:'JWT' }) + '.' + text({ iss:account.client_email,
      scope:'https://www.googleapis.com/auth/webmasters.readonly', aud:'https://oauth2.googleapis.com/token', iat:issuedAt, exp:issuedAt + 3600 });
    const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
      { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign']);
    const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
    token = await searchJson(fetcher, 'https://oauth2.googleapis.com/token', { method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams({
        grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion:unsigned + '.' + encode(signature),
      }) });
  } else {
    token = await searchJson(fetcher, 'https://oauth2.googleapis.com/token', { method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body:new URLSearchParams({
        client_id:env.GOOGLE_SEARCH_CLIENT_ID, client_secret:env.GOOGLE_SEARCH_CLIENT_SECRET,
        refresh_token:env.GOOGLE_SEARCH_REFRESH_TOKEN, grant_type:'refresh_token',
      }) });
  }
  if (!token.access_token) throw new Error('access_denied');
  const endDate = searchDate(now);
  const startDate = addSearchDays(endDate, 1 - days);
  const get = async (dimensions) => {
    const rows = []; let incomplete = null;
    for (let startRow = 0; startRow < 250000; startRow += 25000) {
      const result = await searchJson(fetcher, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GOOGLE_SEARCH_CONSOLE_SITE)}/searchAnalytics/query`, {
        method:'POST', headers:{ Authorization:`Bearer ${token.access_token}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ startDate, endDate, dimensions, type:'web', dataState:'all', rowLimit:25000, startRow,
          dimensionFilterGroups:[{ filters:[{ dimension:'page', operator:'excludingRegex', expression:SEARCH_INTERNAL }] }] }),
      });
      if (result.rows !== undefined && !Array.isArray(result.rows)) throw new Error('upstream_unavailable');
      rows.push(...(result.rows || []));
      incomplete ||= result.metadata?.first_incomplete_date || null;
      if ((result.rows || []).length < 25000) return { rows, incomplete };
    }
    throw new Error('report_too_large'); // Never replace a good snapshot with a partial pagination result.
  };
  const results = await Promise.allSettled([get(['date']), get(['date', 'query']), get(['date', 'page'])]);
  if (results.some((result) => result.status === 'rejected')) throw results.find((result) => result.status === 'rejected').reason;
  const [totals, queries, pages] = results.map((result) => result.value);
  const daily = new Map();
  // A day with zero clicks is omitted by Google. Fill gaps only through an
  // actually returned date; never invent zeros for the not-yet-published tail.
  const latest = totals.rows.map((row) => row.keys[0]).sort().at(-1);
  if (latest) for (let day = startDate; day <= latest; day = addSearchDays(day, 1)) {
    daily.set(day, { day, total:0, metricsVersion:2, queries:[], pages:[], preliminary:Boolean(totals.incomplete && day >= totals.incomplete) });
  }
  for (const row of totals.rows) daily.set(row.keys[0], { day:row.keys[0], total:searchNumber(row.clicks), metricsVersion:2, queries:[], pages:[], preliminary:Boolean(totals.incomplete && row.keys[0] >= totals.incomplete) });
  for (const [kind, report] of [['queries', queries], ['pages', pages]]) for (const row of report.rows) {
    const day = daily.get(row.keys[0]);
    if (day) day[kind].push({ value:row.keys[1], count:searchNumber(row.clicks), impressions:searchNumber(row.impressions), position:searchNumber(row.position) || null });
  }
  return [...daily.values()];
}

export async function fetchYandexSearchDays(env, { fetcher = fetch } = {}) {
  const headers = { Authorization:`OAuth ${env.YANDEX_WEBMASTER_TOKEN}`, 'Content-Type':'application/json' };
  const user = env.YANDEX_WEBMASTER_USER_ID || (await searchJson(fetcher, 'https://api.webmaster.yandex.net/v4/user', { headers })).user_id;
  if (!user) throw new Error('access_denied');
  const base = `https://api.webmaster.yandex.net/v4/user/${encodeURIComponent(user)}/hosts/${encodeURIComponent(env.YANDEX_WEBMASTER_HOST_ID)}`;
  const get = async (type) => {
    const rows = [];
    for (let offset = 0; offset < 50000; offset += 500) {
      const result = await searchJson(fetcher, base + '/query-analytics/list', { method:'POST', headers,
        body:JSON.stringify({ offset, limit:500, device_type_indicator:'ALL', search_location:'WEB_LOCATION', text_indicator:type,
          filters:{ text_filters:[{ text_indicator:'URL', operation:'TEXT_DOES_NOT_CONTAIN', value:'/analytics' }] } }),
      });
      if (!Array.isArray(result.text_indicator_to_statistics) || !Number.isFinite(result.count)) throw new Error('upstream_unavailable');
      rows.push(...result.text_indicator_to_statistics);
      if (rows.length >= result.count) return rows;
      if (!result.text_indicator_to_statistics.length) throw new Error('upstream_unavailable');
    }
    throw new Error('report_too_large');
  };
  const results = await Promise.allSettled([get('QUERY'), get('URL')]);
  if (results.some((result) => result.status === 'rejected')) throw results.find((result) => result.status === 'rejected').reason;
  const daily = new Map();
  for (const [index, kind] of [[1, 'pages'], [0, 'queries']]) for (const row of results[index].value) {
    const value = row.text_indicator?.value;
    if (!value || (kind === 'pages' && workerInternalAnalyticsPath(value))) continue;
    const metrics = new Map();
    for (const stat of row.statistics || []) {
      if (!['CLICKS', 'IMPRESSIONS', 'POSITION'].includes(stat.field) || !/^\d{4}-\d{2}-\d{2}$/.test(stat.date)) continue;
      if (!metrics.has(stat.date)) metrics.set(stat.date, { value, count:0, impressions:0, position:null });
      const item = metrics.get(stat.date);
      if (stat.field === 'CLICKS') item.count = searchNumber(stat.value);
      if (stat.field === 'IMPRESSIONS') item.impressions = searchNumber(stat.value);
      if (stat.field === 'POSITION') item.position = searchNumber(stat.value) || null;
    }
    for (const [date, item] of metrics) {
      if (!daily.has(date)) daily.set(date, { day:date, total:0, metricsVersion:2, queries:[], pages:[], preliminary:true });
      const day = daily.get(date);
      day[kind].push(item);
      // Complete URL pagination includes clicks from hidden queries.
      if (kind === 'pages') day.total += item.count;
    }
  }
  return [...daily.values()];
}

export function aggregateSearchDays(days, range) {
  const selected = days.filter((day) => day.day >= range.startDate && day.day <= range.endDate);
  const aggregate = (kind) => {
    const counts = new Map();
    const legacy = selected.some((day) => day.metricsVersion !== 2);
    for (const day of selected) for (const row of day[kind] || []) {
      if (!counts.has(row.value)) counts.set(row.value, { value:row.value, count:0, impressions:0, weighted:0, weight:0, missingPosition:false });
      const item = counts.get(row.value);
      item.count += searchNumber(row.count);
      const impressions = searchNumber(row.impressions);
      item.impressions += impressions;
      if (impressions > 0 && searchNumber(row.position) > 0) {
        item.weighted += row.position * impressions;
        item.weight += impressions;
      } else if (impressions > 0) item.missingPosition = true;
    }
    return searchSort([...counts.values()].map(({ weighted, weight, missingPosition, ...item }) => ({ ...item,
      impressions:legacy ? null : item.impressions,
      position:!legacy && !missingPosition && weight > 0 ? weighted / weight : null,
    })));
  };
  const dates = selected.map((day) => day.day).sort();
  return { total:selected.length ? selected.reduce((sum, day) => sum + searchNumber(day.total), 0) : null,
    queries:aggregate('queries'), pages:aggregate('pages'), availableDays:new Set(dates).size, expectedDays:range.days,
    availableFrom:dates[0] || null, availableTo:dates.at(-1) || null, partial:new Set(dates).size < range.days,
    metricsComplete:selected.length > 0 && selected.every((day) => day.metricsVersion === 2),
    preliminary:selected.some((day) => day.preliminary) };
}
export async function readSearchTraffic(period, env, store, { now = Date.now() } = {}) {
  const range = searchTrafficRange(period, now);
  const previousRange = { startDate:addSearchDays(range.startDate, -range.days), endDate:addSearchDays(range.startDate, -1), days:range.days };
  const properties = searchProperties(env);
  const pairs = await Promise.all(Object.entries(properties).map(async ([source, settings]) => {
    if (!settings.property) return [source, { status:'not_connected' }];
    try {
      // Кроме двух сравниваемых периодов читаем небольшой хвост назад: если свежий
      // день ещё не опубликован, интерфейс всё равно должен честно назвать дату
      // последнего доступного отчёта, а не оставлять пользователя с голым прочерком.
      const { days, state } = await store.read(source, settings.property, { ...range, startDate:addSearchDays(previousRange.startDate, -14) });
      const current = aggregateSearchDays(days, range);
      // Compare the published prefix with exactly the same days in the previous period.
      // A missing tail is a provider delay; internal gaps or missing history prevent comparison.
      const prefixDays = current.availableTo ? (Date.parse(current.availableTo) - Date.parse(range.startDate)) / SEARCH_DAY + 1 : 0;
      const comparisonRange = { ...previousRange, endDate:addSearchDays(previousRange.startDate, Math.max(1, prefixDays) - 1), days:prefixDays };
      const previous = aggregateSearchDays(days, comparisonRange);
      const comparable = prefixDays > 0 && current.availableDays === prefixDays && !previous.partial && current.metricsComplete && previous.metricsComplete;
      for (const kind of ['queries', 'pages']) {
        const prior = new Map(previous[kind].map((row) => [row.value, row]));
        current[kind] = current[kind].map((row) => {
          const position = prior.get(row.value)?.position;
          return { ...row, previousPosition:position ?? null, positionChange:comparable && row.position != null && position != null ? position - row.position : null };
        });
      }
      const latestAvailableTo = days.map((day) => day.day).filter((day) => day <= range.endDate).sort().at(-1) || null;
      return [source, { status:current.availableDays ? 'ready' : settings.configured ? 'pending' : 'not_connected', connected:settings.configured,
        ...current, latestAvailableTo, comparisonAvailable:comparable, comparisonDays:comparable ? prefixDays : 0, previousRange:comparisonRange, lastSyncAt:state?.lastSuccessAt || null, syncError:state?.error || null }];
    } catch { return [source, { status:'storage_unavailable' }]; }
  }));
  return { ...range, generatedAt:new Date(now).toISOString(), ...Object.fromEntries(pairs) };
}
export async function syncSearchTraffic(env, store, { now = Date.now(), fetcher = fetch } = {}) {
  const results = await Promise.all(Object.entries(searchProperties(env)).map(async ([source, settings]) => {
    if (!settings.configured) return [source, { status:'not_connected' }];
    try {
      const { state } = await store.read(source, settings.property, searchTrafficRange('90', now));
      const days = source === 'google' ? await fetchGoogleSearchDays(env, { now, fetcher, days:state?.metricsVersion === 2 && state?.lastSuccessAt ? Math.min(180, Math.max(14, Math.ceil((now - Date.parse(state.lastSuccessAt)) / SEARCH_DAY) + 14)) : 180 })
        : await fetchYandexSearchDays(env, { fetcher });
      await store.save(source, settings.property, days, { lastSuccessAt:new Date(now).toISOString(), metricsVersion:2, error:null });
      return [source, { status:'ready', days:days.length }];
    } catch (failure) {
      const error = failure.message === 'access_denied' ? 'access_denied' : 'sync_failed';
      await store.fail(source, settings.property, error).catch(() => {});
      return [source, { status:'error', error }];
    }
  }));
  return Object.fromEntries(results);
}

// Sites uses the same archive shape; production runs the PostgreSQL adapter and timer.
function workerSearchStore(db) {
  return {
    async read(source, property, range) {
      if (!db) throw new Error('storage_unavailable');
      const result = await db.prepare('SELECT payload FROM search_traffic_daily WHERE source=? AND property=? AND day>=? AND day<=?').bind(source, property, range.startDate, range.endDate).all();
      const state = await db.prepare('SELECT payload FROM search_traffic_sync WHERE source=? AND property=?').bind(source, property).first();
      return { days:(result.results || []).map((row) => JSON.parse(row.payload)), state:state ? JSON.parse(state.payload) : null };
    },
  };
}

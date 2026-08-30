import crypto from "node:crypto";
import { pool } from "./db.mjs";
import { readCookie } from "./auth.mjs";

export const ANALYTICS_EVENTS = new Set([
  "page_view",
  "vehicle_view",
  "availability_click",
  "availability_request_click",
  "registration_completed",
  "favorite_added",
  "search_saved",
  "custom_search_submitted",
  "search_query",
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
  // Был ли комментарий менеджеру — только «да» или «нет»: сам текст в события не берём.
  if (properties.withComment === "yes" || properties.withComment === "no") safeProperties.withComment = properties.withComment;
  // Строка поиска — единственный свободный текст, который мы принимаем от браузера.
  // Приём событий открыт без пароля, поэтому длину режем и ничего, кроме строки
  // и числа найденных машин, из свойств не берём.
  if (properties.query) safeProperties.query = text(properties.query, 120);
  if (Number.isFinite(Number(properties.found))) safeProperties.found = Math.max(0, Math.min(1_000_000, Math.round(Number(properties.found))));
  return {
    eventId,
    visitorId,
    sessionId,
    eventName,
    path,
    listingId:text(body.listingId, 200) || null,
    listingTitle:text(body.listingTitle, 240) || null,
    properties:safeProperties,
    // Признак живого человека страница ставит сама, когда посетитель себя проявил.
    // На первом событии его обычно нет — он приходит следом, отдельным запросом.
    human:body.human === true,
    // Действие посетителя уже было: следующие страницы того же захода приходят
    // помеченными сразу, отдельного подтверждения на каждую не нужно.
    humanAction:body.humanAction === true,
  };
}

// Одно и то же действие иногда приходит дважды подряд: страница из старого кэша
// браузера, повторный рендер, двойной клик. Такой повтор — не второй просмотр,
// поэтому в пределах нескольких секунд одинаковые события не записываем. Проверка
// стоит на сервере, а не только в браузере: у части посетителей загружен старый
// код сайта, и починить их можно только здесь.
export const ANALYTICS_REPEAT_SECONDS = 5;
const INSERT_EVENT_SQL = `INSERT INTO analytics_events (event_id,visitor_id,session_id,event_name,path,listing_id,listing_title,properties,human,human_action)
     SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
     WHERE NOT EXISTS (
       SELECT 1 FROM analytics_events
       WHERE visitor_id=$2 AND event_name=$4 AND coalesce(listing_id,'')=coalesce($6,'')
         -- У события про машину примета — сама машина: «быстрый просмотр» в каталоге
         -- и открытая следом карточка лежат на разных адресах, но взгляд один.
         AND ($6 IS NOT NULL OR path=$5)
         -- Два разных запроса в строке поиска — два разных события, даже если их
         -- набрали подряд на одной странице.
         AND coalesce(properties->>'query','') = coalesce(($8::jsonb)->>'query','')
         AND created_at > now() - interval '${ANALYTICS_REPEAT_SECONDS} seconds'
     )
     ON CONFLICT (event_id) DO NOTHING`;

// Настоящий адрес сайта — из настроек, а не из запроса. Сервер отвечает и по
// числовому адресу, и по имени: раньше сверялись с тем адресом, по которому пришёл
// запрос, поэтому робот, перебиравший адреса подряд, открыл главную по числовому
// адресу сервера — и его собственная отметка совпала сама с собой. В статистике он
// оказался живым посетителем (25.08.2026).
export const siteHost = (siteUrl = process.env.SITE_URL) => {
  const raw = String(siteUrl || "https://abcars.by").trim();
  try { return new URL(raw.includes("//") ? raw : `https://${raw}`).hostname.toLowerCase(); } catch { return ""; }
};

// Событие со страницы сайта браузер всегда сопровождает отметкой, откуда оно
// отправлено (Origin, а в редких случаях только Referer). Запрос, посланный
// напрямую — командой из терминала, роботом, кем-то посторонним, — такой отметки
// не несёт: наши собственные проверки и чужие подделки в статистику не пойдут.
// Фильтры «свой заход» живут в браузере, и обойти их можно только так.
export const fromOwnPage = (headers = {}, host = siteHost()) => {
  const site = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!site) return false;
  const hosts = [site, `www.${site}`];
  const origin = String(headers.origin || "").toLowerCase();
  if (origin) return hosts.some((name) => origin === `https://${name}` || origin === `http://${name}`);
  const referer = String(headers.referer || "").toLowerCase();
  return hosts.some((name) => referer === `https://${name}` || referer === `http://${name}`
    || referer.startsWith(`https://${name}/`) || referer.startsWith(`http://${name}/`));
};

// Робот, который честно называет себя роботом. Поисковики наш скрипт не выполняют и
// событий не присылают, но сборщики данных для ИИ и проверялки сайтов бывают на
// настоящем браузере — с такой подписью в статистику они не попадут.
//
// `claude/` — это встроенный браузер Claude, которым я сам проверяю правки на сайте.
// Метка «не считать» живёт в localStorage конкретного браузера, а этот запускается
// каждый раз заново и метки не помнит, поэтому 26.08.2026 мои проверки оказались
// в разделе как живые посетители. Здесь он отсекается по подписи и навсегда.
const BOT_AGENT = /bot|claude\/|crawl|spider|slurp|scrape|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|httpclient|http-client|libwww|okhttp|java\/|axios|node-fetch|go-http|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|fetcher|archiver|ia_archiver|yandeximages|feed/i;
export const isBotAgent = (agent = "") => {
  const value = String(agent || "").trim();
  // Браузер всегда представляется. Пустая подпись — это не человек.
  if (!value) return true;
  return BOT_AGENT.test(value);
};

// Адрес арендованного сервера в дата-центре. Робота, который подделал подпись
// браузера и научился изображать поведение человека (подвигать мышью, прокрутить),
// иначе не отличить: 26.08.2026 такие «посетители» с Amazon, Alibaba, DigitalOcean
// и Scaleway составили в разделе большинство. Диапазоны провайдеров лежат в базе,
// их раз в неделю переписывает `npm run ranges`.
const DATACENTER_CACHE_TTL_MS = 10 * 60 * 1000;
const DATACENTER_CACHE_LIMIT = 5000;
const datacenterCache = new Map();

export async function isDatacenterAddress(address, { db = pool, now = Date.now() } = {}) {
  const value = String(address || "").trim();
  if (!value || value === "unknown") return false;
  const cached = datacenterCache.get(value);
  if (cached && now - cached.at < DATACENTER_CACHE_TTL_MS) return cached.hit;
  try {
    const result = await db.query("SELECT 1 FROM datacenter_ranges WHERE network >>= $1 LIMIT 1", [value]);
    const hit = result.rowCount > 0;
    // Адресов за день набегает немного, но кэш всё равно ограничиваем: иначе его
    // раздует тот самый обходчик, от которого мы защищаемся.
    if (datacenterCache.size >= DATACENTER_CACHE_LIMIT) datacenterCache.clear();
    datacenterCache.set(value, { at:now, hit });
    return hit;
  } catch {
    // Таблицы ещё нет, база молчит или адрес пришёл в непонятном виде — пропускаем.
    // Потерять чужого робота не так обидно, как потерять живого посетителя.
    return false;
  }
}

export async function recordAnalyticsEvent(body, { db = pool } = {}) {
  const event = normalizeAnalyticsEvent(body);
  if (event.error) return event;
  const result = await db.query(INSERT_EVENT_SQL,
    [event.eventId,event.visitorId,event.sessionId,event.eventName,event.path,event.listingId,event.listingTitle,JSON.stringify(event.properties),event.human,event.humanAction],
  );
  return { ok:true, recorded:result.rowCount > 0 };
}

// Посетитель себя проявил: отмечаем живым весь его сегодняшний след. Отметка нужна
// именно так, вдогонку, потому что заход записывается сразу — иначе человек, который
// открыл страницу и ушёл, не притронувшись ни к чему, потерялся бы совсем. Теперь он
// в базе есть, просто не попадает в число посетителей, а виден отдельной цифрой.
export async function confirmHumanVisit(body = {}, { db = pool } = {}) {
  const visitorId = text(body.visitorId, 80);
  const sessionId = text(body.sessionId, 80);
  if (!visitorId || !sessionId) return { error:"invalid_event_identity" };
  // Отметок две. Слабая — просто время на открытой странице; её научился получать
  // обходчик, который ждёт свои пятнадцать секунд и уходит. Сильная — настоящее
  // действие; в число посетителей раздел берёт только по ней. Сильная приходит и
  // после слабой, поэтому строку обновляем, пока не проставлено само действие.
  const action = body.action === true;
  const result = await db.query(
    `UPDATE analytics_events SET human = true, human_action = human_action OR $3
       WHERE visitor_id = $1 AND session_id = $2 AND NOT (human AND (human_action OR NOT $3))
         AND created_at > now() - interval '12 hours'`,
    [visitorId, sessionId, action],
  );
  return { ok:true, confirmed:result.rowCount };
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

// Беларусь круглый год живёт по UTC+3 и часы не переводит, поэтому «сегодня»
// и «вчера» отсчитываем от минской полуночи, а не от полуночи по Гринвичу:
// иначе с трёх ночи до трёх утра «сегодня» показывало бы вчерашний день.
const MINSK_OFFSET_MS = 3 * 3_600_000;
export const startOfMinskDay = (daysBack = 0, now = Date.now()) =>
  new Date((Math.floor((now + MINSK_OFFSET_MS) / 86_400_000) - daysBack) * 86_400_000 - MINSK_OFFSET_MS);

export function normalizeAnalyticsDays(value) {
  return [7, 30, 90].includes(Number(value)) ? Number(value) : 30;
}

// Период, за который считается раздел: скользящее окно в днях или конкретные сутки.
// У суток есть и правая граница, поэтому период везде задаётся парой «с» и «по».
export function normalizeAnalyticsRange(value, now = Date.now()) {
  const key = String(value ?? "");
  if (key === "today") return { period:"today", days:1, from:startOfMinskDay(0, now), to:new Date(now) };
  if (key === "yesterday") return { period:"yesterday", days:1, from:startOfMinskDay(1, now), to:startOfMinskDay(0, now) };
  const days = normalizeAnalyticsDays(key);
  return { period:String(days), days, from:new Date(now - days * 86_400_000), to:new Date(now) };
}

// Посетителем считаем того, у кого хотя бы одно событие отмечено действием живого
// человека. Именно «хотя бы одно», а не каждое: отметка приходит вдогонку, отдельным
// запросом, и порядок записи не гарантирован — иначе первый заход человека остался бы
// непризнанным из-за случайной очерёдности двух запросов. Именно действием, а не
// просто отметкой «живой»: одно лишь время на странице подделывает обходчик, который
// ходит через домашние адреса и по адресу не отличается от людей (26.08.2026).
const humanVisitor = (compare = ">=") => `visitor_id IN (SELECT visitor_id FROM analytics_events WHERE created_at ${compare} $1 AND human_action)`;
// В разделе период ограничен с двух сторон, поэтому «живой посетитель» ищется
// внутри тех же границ: иначе вчерашний день подхватывал бы сегодняшние отметки.
const HUMAN_VISITOR = "visitor_id IN (SELECT visitor_id FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND human_action)";

export async function getAnalyticsDashboard(rangeValue) {
  const range = normalizeAnalyticsRange(rangeValue);
  const { days, period } = range;
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  // Всё, что оставило след в базе — заявки, избранное, регистрации, — считаем по самим
  // таблицам, а не по событиям из браузера: событие может не дойти (блокировщик, старая
  // вкладка, закрытая страница) и его может подделать кто угодно, а строка в таблице
  // появляется только от настоящего действия. Из событий берём лишь то, чего в базе нет:
  // посетителей, заходы и просмотры карточек.
  const [summaryResult,visitsResult,actionsResult,dailyResult,vehiclesResult,favoritesResult,registrationsResult,recentResult,accountsResult,searchesResult,actionsDailyResult] = await Promise.all([
    pool.query(`SELECT
      count(DISTINCT visitor_id) FILTER (WHERE ${HUMAN_VISITOR})::int AS visitors,
      count(*) FILTER (WHERE event_name='page_view' AND ${HUMAN_VISITOR})::int AS page_views,
      count(*) FILTER (WHERE event_name='vehicle_view' AND ${HUMAN_VISITOR})::int AS vehicle_views,
      count(*) FILTER (WHERE event_name='availability_request_click' AND ${HUMAN_VISITOR})::int AS availability_requests,
      count(DISTINCT visitor_id) FILTER (WHERE event_name='availability_request_click' AND ${HUMAN_VISITOR})::int AS availability_request_people,
      count(DISTINCT visitor_id) FILTER (WHERE NOT (${HUMAN_VISITOR}))::int AS robot_visits
      FROM analytics_events WHERE created_at >= $1 AND created_at < $2`, [from, to]),
    // «Заход» считаем по паузе, а не по вкладке: страница помнит номер захода, пока
    // вкладка открыта, поэтому три карточки, открытые в трёх вкладках, выглядели бы
    // тремя разными заходами, а вкладка, забытая на сутки, — одним. Новый заход
    // начинается там, где между двумя шагами посетителя прошло больше получаса.
    pool.query(`WITH steps AS (
        SELECT created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at) AS gap
        FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND ${HUMAN_VISITOR}
      )
      SELECT count(*) FILTER (WHERE gap IS NULL OR gap > interval '30 minutes')::int AS visits FROM steps`, [from, to]),
    pool.query(`SELECT
      (SELECT count(*) FROM customer_orders WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")})::int
        + (SELECT count(*) FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND coalesce(calculation->>'requestType','') <> 'catalog_search' AND ${notStaffContact("contact")})::int AS availability_clicks,
      (SELECT count(*) FROM customer_favorites WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")})::int AS favorites,
      (SELECT count(*) FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND calculation->>'requestType' = 'catalog_search' AND ${notStaffContact("contact")})::int AS custom_searches`, [from, to]),
    pool.query(`SELECT created_at::date::text AS day,
      count(DISTINCT visitor_id)::int AS visitors,
      count(*) FILTER (WHERE event_name='vehicle_view')::int AS vehicle_views,
      count(*) FILTER (WHERE event_name='availability_request_click')::int AS availability_requests
      FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND ${HUMAN_VISITOR}
      GROUP BY created_at::date ORDER BY created_at::date`, [from, to]),
    pool.query(`WITH views AS (
        SELECT listing_id, max(listing_title) AS listing_title,
          count(*) FILTER (WHERE event_name='vehicle_view')::int AS views,
          count(DISTINCT visitor_id) FILTER (WHERE event_name='vehicle_view')::int AS viewers,
          max(created_at) FILTER (WHERE event_name='vehicle_view') AS last_viewed,
          count(*) FILTER (WHERE event_name='availability_request_click')::int AS availability_requests
        FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND listing_id IS NOT NULL AND ${HUMAN_VISITOR} GROUP BY listing_id
      ), asks AS (
        SELECT listing_id, count(*)::int AS n FROM customer_orders WHERE created_at >= $1 AND created_at < $2 AND listing_id IS NOT NULL AND ${notStaffAccount("customer_id")} GROUP BY listing_id
      ), drafts AS (
        SELECT listing_id, count(*)::int AS n FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND listing_id IS NOT NULL AND ${notStaffContact("contact")} GROUP BY listing_id
      ), favs AS (
        SELECT listing_id, count(*)::int AS n FROM customer_favorites WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")} GROUP BY listing_id
      ), ids AS (
        SELECT listing_id FROM views UNION SELECT listing_id FROM asks UNION SELECT listing_id FROM drafts UNION SELECT listing_id FROM favs
      )
      SELECT ids.listing_id,
        COALESCE(views.listing_title, l.title) AS listing_title,
        COALESCE(views.views, 0) AS views,
        COALESCE(views.viewers, 0) AS viewers,
        COALESCE(asks.n, 0) + COALESCE(drafts.n, 0) AS availability_clicks,
        COALESCE(views.availability_requests, 0) AS availability_requests,
        COALESCE(favs.n, 0) AS favorites,
        views.last_viewed
      FROM ids
      LEFT JOIN views ON views.listing_id = ids.listing_id
      LEFT JOIN asks ON asks.listing_id = ids.listing_id
      LEFT JOIN drafts ON drafts.listing_id = ids.listing_id
      LEFT JOIN favs ON favs.listing_id = ids.listing_id
      LEFT JOIN listings l ON l.id = ids.listing_id
      ORDER BY views.last_viewed DESC NULLS LAST, availability_clicks DESC, views DESC LIMIT 100`, [from, to]),
    // Что держат в избранном прямо сейчас — это не событие, а состояние: строка живёт,
    // пока сердечко нажато, и период раздела на неё не влияет. Гостей здесь нет —
    // без входа в кабинет избранное остаётся в браузере и до нас не доходит.
    pool.query(`SELECT f.listing_id,
        coalesce(l.title, f.listing_id) AS title,
        l.id IS NULL AS gone,
        coalesce(l.status, '') AS status,
        l.estimated_total_usd,
        count(*)::int AS people,
        max(f.created_at) AS added_at
      FROM customer_favorites f
      LEFT JOIN listings l ON l.id = f.listing_id
      WHERE ${notStaffAccount("f.customer_id")}
      GROUP BY f.listing_id, l.id, l.title, l.status, l.estimated_total_usd
      ORDER BY max(f.created_at) DESC LIMIT 50`),
    // Список регистраций читаем из таблицы аккаунтов, а не из событий: события
    // принимаются без пароля и подделываются, а аккаунт создаётся только настоящей
    // регистрацией. Заодно личные данные остаются в одном месте.
    pool.query(`SELECT name, phone, created_at
      FROM customer_accounts WHERE created_at >= $1 AND created_at < $2 AND NOT staff
      ORDER BY created_at DESC LIMIT 100`, [from, to]),
    pool.query(`SELECT event_name,listing_id,listing_title,path,created_at
      FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND ${HUMAN_VISITOR} ORDER BY created_at DESC LIMIT 30`, [from, to]),
    // Регистрации считаем по аккаунтам, а не по событиям — тем же источником, из которого
    // берётся список ниже. Иначе счётчик и список расходятся: событий может не быть вовсе
    // (браузер не отправил, посетитель заблокировал), а аккаунт всё равно создан.
    pool.query(`SELECT created_at::date::text AS day, count(*)::int AS registrations
      FROM customer_accounts WHERE created_at >= $1 AND created_at < $2 AND NOT staff GROUP BY 1`, [from, to]),
    // Что вводят в строку поиска. Записывается только «отстоявшийся» запрос, но
    // человек мог сделать паузу посреди набора — тогда в одном сеансе окажутся
    // и «джили», и «джили галакси». Показываем самое полное: строку выкидываем,
    // если в том же сеансе рядом есть запрос, который начинается с неё.
    pool.query(`WITH asked AS (
        SELECT session_id, visitor_id, created_at,
          btrim(properties->>'query') AS query,
          nullif(properties->>'found','')::int AS found
        FROM analytics_events
        WHERE event_name='search_query' AND created_at >= $1 AND created_at < $2 AND ${HUMAN_VISITOR}
          AND btrim(coalesce(properties->>'query','')) <> ''
      ), settled AS (
        SELECT * FROM asked a WHERE NOT EXISTS (
          SELECT 1 FROM asked longer
          WHERE longer.session_id = a.session_id
            AND longer.query <> a.query
            AND left(longer.query, length(a.query)) = a.query
            AND longer.created_at BETWEEN a.created_at AND a.created_at + interval '10 minutes'
        )
      )
      SELECT query,
        count(*)::int AS asked,
        count(DISTINCT visitor_id)::int AS people,
        max(found)::int AS found,
        max(created_at) AS last_asked
      FROM settled GROUP BY query ORDER BY asked DESC, last_asked DESC LIMIT 60`, [from, to]),
    pool.query(`SELECT day, sum(availability_clicks)::int AS availability_clicks, sum(custom_searches)::int AS custom_searches FROM (
        SELECT created_at::date::text AS day, count(*)::int AS availability_clicks, 0 AS custom_searches
          FROM customer_orders WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")} GROUP BY 1
        UNION ALL
        SELECT created_at::date::text AS day,
          count(*) FILTER (WHERE coalesce(calculation->>'requestType','') <> 'catalog_search')::int,
          count(*) FILTER (WHERE calculation->>'requestType' = 'catalog_search')::int
          FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND ${notStaffContact("contact")} GROUP BY 1
      ) t GROUP BY day`, [from, to]),
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
      availability_requests:0,
      availability_clicks:dayAction(day, "availability_clicks"),
      registrations:registrationsByDay.get(day) || 0,
      custom_searches:dayAction(day, "custom_searches"),
    });
  }
  daily.sort((left, right) => left.day.localeCompare(right.day));
  return {
    days,
    period,
    from,
    to,
    generatedAt:new Date().toISOString(),
    summary:{ ...summaryResult.rows[0], ...visitsResult.rows[0], ...actionsResult.rows[0], registrations },
    daily,
    vehicles:vehiclesResult.rows.map((row) => ({ listingId:row.listing_id, listingTitle:row.listing_title, views:row.views, viewers:row.viewers, availabilityClicks:row.availability_clicks, availabilityRequests:row.availability_requests, favorites:row.favorites, lastViewedAt:row.last_viewed })),
    favorites:favoritesResult.rows.map((row) => ({ listingId:row.listing_id, listingTitle:row.title, people:row.people, addedAt:row.added_at, gone:row.gone, status:row.status, priceUsd:row.estimated_total_usd })),
    // Телефон в таблице аккаунтов лежит только цифрами: плюс возвращаем, чтобы в
    // разделе он читался и работала ссылка «позвонить».
    registrations:registrationsResult.rows.map((row) => ({ name:row.name, phone:row.phone ? `+${row.phone}` : "", createdAt:row.created_at })),
    recent:recentResult.rows.map((row) => ({ eventName:row.event_name, listingId:row.listing_id, listingTitle:row.listing_title, path:row.path, createdAt:row.created_at })),
    searches:searchesResult.rows.map((row) => ({ query:row.query, asked:row.asked, people:row.people, found:row.found, lastAskedAt:row.last_asked })),
  };
}

// Красные счётчики у пунктов раздела: сколько нового появилось с тех пор, как
// сотрудник в последний раз открывал этот пункт. Моменты последнего просмотра
// лежат в базе, а не в браузере: вход в раздел один на всех, и посмотренное с
// телефона должно гаснуть и на компьютере. Дата, которой в базе нет (или она
// испорчена), считается «только что»: показывать всю историю как новинку хуже,
// чем не показать ничего.
export const ANALYTICS_SECTIONS = ["overview", "leads", "vehicles", "searches", "customers"];

export const seenMoment = (value, now = Date.now()) => {
  const moment = new Date(String(value || ""));
  if (Number.isNaN(moment.getTime()) || moment.getTime() > now) return new Date(now).toISOString();
  // Дальше месяца назад не заглядываем: раздел и так показывает период,
  // а огромное число на ярлыке ни о чём не говорит.
  return new Date(Math.max(moment.getTime(), now - 30 * 86_400_000)).toISOString();
};

// Пункт, открытый прямо сейчас, считается просмотренным на всё время, пока он
// открыт, — как непрочитанные сообщения в чате. Пункт, в который не заходили ни
// разу, начинает отсчёт от этой минуты: вываливать всю прошлую историю как
// непрочитанное — только пугать цифрой.
export async function readAnalyticsSeen(viewing = "") {
  await pool.query(
    `INSERT INTO analytics_seen(section, seen_at) SELECT unnest($1::text[]), now() ON CONFLICT (section) DO NOTHING`,
    [ANALYTICS_SECTIONS],
  );
  if (ANALYTICS_SECTIONS.includes(viewing)) {
    await pool.query("UPDATE analytics_seen SET seen_at=now() WHERE section=$1", [viewing]);
  }
  const stored = await pool.query("SELECT section, seen_at FROM analytics_seen");
  return Object.fromEntries(stored.rows.map((row) => [row.section, row.seen_at?.toISOString?.() || row.seen_at]));
}

export async function getAnalyticsUpdates({ viewing = "" } = {}, { now = Date.now() } = {}) {
  const seenBySection = await readAnalyticsSeen(viewing);
  const since = Object.fromEntries(ANALYTICS_SECTIONS.map((name) => [name, seenMoment(seenBySection[name], now)]));
  const [overview, vehicles, searches, leads, customers] = await Promise.all([
    // Ярлык «новое с прошлого раза» тоже считает только живых людей, иначе он
    // зажигался бы от заходов роботов.
    pool.query(`SELECT count(DISTINCT visitor_id)::int AS n FROM analytics_events WHERE created_at > $1 AND ${humanVisitor(">")}`, [since.overview]),
    pool.query(`SELECT count(*)::int AS n FROM analytics_events WHERE event_name='vehicle_view' AND created_at > $1 AND ${humanVisitor(">")}`, [since.vehicles]),
    pool.query(`SELECT count(DISTINCT btrim(properties->>'query'))::int AS n FROM analytics_events WHERE event_name='search_query' AND created_at > $1 AND ${humanVisitor(">")} AND btrim(coalesce(properties->>'query','')) <> ''`, [since.searches]),
    pool.query(`SELECT (SELECT count(*) FROM order_drafts WHERE created_at > $1 AND ${notStaffContact("contact")})::int
      + (SELECT count(*) FROM customer_orders WHERE created_at > $1 AND ${notStaffAccount("customer_id")})::int AS n`, [since.leads]),
    pool.query("SELECT count(*)::int AS n FROM customer_accounts WHERE created_at > $1 AND NOT staff", [since.customers]),
  ]);
  return {
    overview:overview.rows[0].n,
    vehicles:vehicles.rows[0].n,
    searches:searches.rows[0].n,
    leads:leads.rows[0].n,
    customers:customers.rows[0].n,
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

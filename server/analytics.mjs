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
  // Рекламная врезка в статьях журнала: попала на экран и по ней нажали.
  "article_promo_shown",
  "article_promo_click",
  "contact_phone_reveal",
  "contact_telegram_click",
  "contact_viber_click",
  "contact_instagram_click",
  "contact_threads_click",
  "service_contact_question_click",
  "service_contact_sales_click",
  "service_contact_telegram_click",
  "service_contact_email_click",
  "app_download_qr_click",
  "app_download_app_store_click",
  "app_download_google_play_click",
  "app_download_qr_modal_open",
  "app_download_qr_deeplink_modal_open",
  "app_download_app_store_modal_open",
  "app_download_google_play_modal_open",
  "newsletter_subscribe_click",
  "newsletter_subscribe_modal_open",
]);

const COOKIE_NAME = "abcars_analytics";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const text = (value, max) => String(value || "").trim().slice(0, max);

// `/analytics` — внутренняя CRM. Фильтр стоит и перед записью, и во всех отчётах:
// второй слой сразу прячет старые строки, записанные браузерами с прошлой сборкой.
export const isInternalAnalyticsPath = (value = "") => {
  let pathname = String(value || "");
  try { pathname = new URL(pathname, "https://abcars.invalid").pathname; } catch { pathname = pathname.split(/[?#]/, 1)[0]; }
  const clean = pathname.replace(/\/+$/, "") || "/";
  return clean === "/analytics" || clean.startsWith("/analytics/");
};

// `nocount=1` — только наша служебная метка. Она может остаться в старых событиях,
// записанных до клиентского фильтра, поэтому проверяем её и при приёме, и во всех
// отчётах. Одного `utm_source=chatgpt` недостаточно: настоящий переход из ChatGPT
// должен продолжать считаться.
export const hasNoCountMarker = (value = "") => {
  try {
    const url = new URL(String(value || ""), "https://abcars.invalid");
    return [...url.searchParams].some(([key, item]) => key.toLowerCase() === "nocount" && item === "1");
  } catch { return /(?:^|[?&])nocount=1(?:&|$)/i.test(String(value || "")); }
};

export const fromAnalyticsPage = (headers = {}) => {
  const referer = String(headers.referer || "");
  if (!referer) return false;
  try { return isInternalAnalyticsPath(new URL(referer).pathname); } catch { return false; }
};

// Телефон или компьютер. Признак берём из заголовков самого запроса, а не из того,
// что прислала страница: приём событий открыт без пароля, и присланному в теле верить
// нельзя. Сначала спрашиваем браузер напрямую (Chrome и Edge отвечают «я мобильный»
// заголовком sec-ch-ua-mobile), иначе смотрим подпись браузера. Планшет считаем
// мобильным: отдельная третья иконка в таблице заходов ничего бы не решала.
const MOBILE_AGENT = /android|iphone|ipad|ipod|iemobile|opera mini|opera mobi|windows phone|blackberry|bb10|webos|kindle|silk|mobile safari|\bmobile\b/i;
export const deviceKindFromHeaders = (headers = {}) => {
  const hint = String(headers["sec-ch-ua-mobile"] || "").trim();
  if (hint === "?1") return "mobile";
  if (hint === "?0") return "desktop";
  const agent = String(headers["user-agent"] || "");
  if (!agent) return "";
  return MOBILE_AGENT.test(agent) ? "mobile" : "desktop";
};

// Система устройства — для подсказки в таблице заходов: Android, iOS, Windows, macOS.
// Источник тот же и по той же причине: заголовок запроса, а не тело события. Chrome и
// Edge называют систему сами (sec-ch-ua-platform), Safari — нет, поэтому есть разбор
// подписи браузера. Порядок проверок важен: у планшета на Android в подписи стоит и
// «Android», и «Linux», а у iPad — «Mac OS X».
const PLATFORM_HINTS = new Map([
  ["android", "android"],
  ["ios", "ios"],
  ["windows", "windows"],
  ["macos", "macos"],
  ["mac os x", "macos"],
  ["chrome os", "chromeos"],
  ["chromium os", "chromeos"],
  ["linux", "linux"],
]);
const AGENT_PLATFORMS = [
  [/android/i, "android"],
  [/iphone|ipad|ipod|\bios\b/i, "ios"],
  [/windows/i, "windows"],
  [/cros/i, "chromeos"],
  [/mac os x|macintosh/i, "macos"],
  [/linux|x11|ubuntu|fedora/i, "linux"],
];
export const devicePlatformFromHeaders = (headers = {}) => {
  // Заголовок приходит в кавычках: sec-ch-ua-platform: "macOS".
  const hint = String(headers["sec-ch-ua-platform"] || "").trim().replace(/^"|"$/g, "").toLowerCase();
  if (PLATFORM_HINTS.has(hint)) return PLATFORM_HINTS.get(hint);
  const agent = String(headers["user-agent"] || "");
  if (!agent) return "";
  return AGENT_PLATFORMS.find(([pattern]) => pattern.test(agent))?.[1] || "";
};
export const DEVICE_PLATFORMS = new Set(["android", "ios", "windows", "macos", "chromeos", "linux"]);

export function normalizeAnalyticsEvent(body = {}, { device = "", platform = "" } = {}) {
  const eventName = text(body.eventName, 64);
  if (!ANALYTICS_EVENTS.has(eventName)) return { error:"invalid_event" };
  const eventId = text(body.eventId, 80);
  const visitorId = text(body.visitorId, 80);
  const sessionId = text(body.sessionId, 80);
  const path = text(body.path, 400) || "/";
  if (isInternalAnalyticsPath(path) || hasNoCountMarker(path)) return { ignored:true };
  if (!eventId || !visitorId || !sessionId) return { error:"invalid_event_identity" };
  const properties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
  // Личные данные в события не принимаем вообще, даже если их пришлёт браузер: приём
  // событий открыт без пароля, поэтому любой мог бы набить таблицу чужими именами и
  // телефонами. Имя и телефон берутся из таблицы аккаунтов, где они уже есть.
  const safeProperties = {};
  if (properties.source) safeProperties.source = text(properties.source, 40);
  // Источник входа — только домен либо одна из служебных меток браузера. Полный
  // адрес реферера не принимаем, чтобы не хранить поисковые запросы и параметры.
  if (properties.entrySource) safeProperties.entrySource = text(properties.entrySource, 160).toLowerCase();
  // Был ли комментарий менеджеру — только «да» или «нет»: сам текст в события не берём.
  if (properties.withComment === "yes" || properties.withComment === "no") safeProperties.withComment = properties.withComment;
  // Строка поиска — единственный свободный текст, который мы принимаем от браузера.
  // Приём событий открыт без пароля, поэтому длину режем и ничего, кроме строки
  // и числа найденных машин, из свойств не берём.
  if (properties.query) safeProperties.query = text(properties.query, 120);
  if (Number.isFinite(Number(properties.found))) safeProperties.found = Math.max(0, Math.min(1_000_000, Math.round(Number(properties.found))));
  // Тип устройства и систему ставим сами, из заголовков запроса; из тела события они
  // не берутся — приём событий открыт без пароля, и присланному в теле верить нельзя.
  if (device === "mobile" || device === "desktop") safeProperties.device = device;
  if (DEVICE_PLATFORMS.has(platform)) safeProperties.platform = platform;
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
// Кто за последнее время правда открывал сайт.
//
// Зачем: счётчик посещений принимает от страницы короткое сообщение «такой-то
// посетитель открыл такую-то страницу», и до 18.09.2026 верил ему без проверки. Этим
// пользовались: около дюжины адресов в день слали такие сообщения, ни разу не
// запросив ни страницы, ни картинки — просто дописывали себе просмотры карточек.
// Шли они с бытовых прокси во Вьетнаме, Бразилии, Аргентине и Чили, то есть под
// список дата-центров не попадали.
//
// Проверка нарочно мягкая — «заходил ли этот адрес на сайт вообще», а не «запрашивал
// ли он именно эту страницу». Строгая сломала бы живых людей: сайт перерисовывает
// себя сам, и при переходе из каталога в карточку никакого запроса страницы к серверу
// нет; возврат кнопкой «назад» браузер берёт из своей памяти; на телефоне адрес
// меняется при переходе с вайфая в мобильную сеть. А боту хватает и мягкой: он не
// запрашивает ничего.
//
// Годится любое обращение, которое дошло до нас, — в том числе `/api/auth/me`, его
// страница делает при каждой загрузке, и кэш его не перехватывает (no-store).
// Полчаса — с запасом на долгое чтение одной страницы.
const SITE_VISIT_TTL_MS = 30 * 60 * 1000;
const SITE_VISIT_LIMIT = 20_000;
const siteVisits = new Map();

/** Запомнить, что с этого адреса к нам обратились. */
export const noteSiteRequest = (address, now = Date.now()) => {
  const value = String(address || "").trim();
  if (!value || value === "unknown") return;
  // Карту чистим по размеру, а не по таймеру: лишняя работа каждую минуту ни к чему,
  // а разрастись ей не даёт этот же предел.
  if (siteVisits.size >= SITE_VISIT_LIMIT) {
    for (const [key, at] of siteVisits) if (now - at > SITE_VISIT_TTL_MS) siteVisits.delete(key);
    if (siteVisits.size >= SITE_VISIT_LIMIT) siteVisits.clear();
  }
  siteVisits.set(value, now);
};

/**
 * Открывали ли с этого адреса сайт за последние полчаса.
 *
 * Адрес неизвестен — отвечаем «да»: потерять живого посетителя обиднее, чем пропустить
 * чужое сообщение. По той же причине «да» отвечаем и сразу после перезапуска сайта:
 * память о заходах живёт в процессе, и после выкладки она пуста, а люди на сайте
 * остаются. Первые полчаса после запуска проверка не работает и никого не режет.
 */
const startedAt = Date.now();
export const hasRecentSiteRequest = (address, now = Date.now()) => {
  const value = String(address || "").trim();
  if (!value || value === "unknown") return true;
  if (now - startedAt < SITE_VISIT_TTL_MS) return true;
  const at = siteVisits.get(value);
  return at !== undefined && now - at < SITE_VISIT_TTL_MS;
};

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

export async function recordAnalyticsEvent(body, { db = pool, headers = null } = {}) {
  const event = normalizeAnalyticsEvent(body, {
    device:headers ? deviceKindFromHeaders(headers) : "",
    platform:headers ? devicePlatformFromHeaders(headers) : "",
  });
  if (event.ignored) return { ok:true, recorded:false };
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
         AND path <> '/analytics' AND path NOT LIKE '/analytics/%' AND path NOT LIKE '/analytics?%'
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

const PUBLIC_EVENT = "path <> '/analytics' AND path NOT LIKE '/analytics/%' AND path NOT LIKE '/analytics?%' AND path !~* '(^|[?&])nocount=1(&|$)'";
// Признак живого человека не ограничен периодом: он у посетителя один на всю историю.
// Раньше отметку искали внутри выбранного окна, и один и тот же день давал разные
// цифры в карточках (окно — сутки) и на графике (окно — 90 дней): человек, который
// сегодня только читал, а мышью двигал на прошлой неделе, попадал в график и не
// попадал в карточку. Отметка приходит вдогонку отдельным запросом и порядок записи
// не гарантирован, поэтому достаточно одного такого события, а не каждого. Именно
// действием, а не просто отметкой «живой»: одно лишь время на странице выжидает
// обходчик, который ходит через домашние адреса и по адресу неотличим от людей.
const LIVE_VISITOR = `visitor_id IN (SELECT visitor_id FROM analytics_events WHERE human_action AND ${PUBLIC_EVENT})`;
// Сутки везде минские: Беларусь круглый год живёт по UTC+3, а база хранит время
// по Гринвичу — без перевода события с полуночи до трёх ночи попадали бы во вчера.
const MINSK_DAY = "(created_at AT TIME ZONE 'Europe/Minsk')::date";
// Новый заход начинается там, где между двумя шагами посетителя прошло больше
// получаса либо сменились сутки. Граница суток нужна, чтобы дневная цифра графика
// сходилась с карточкой «Заходы» за тот же день: карточка считает от минской полуночи.
const VISIT_STARTS = "gap IS NULL OR gap > interval '30 minutes' OR previous_day IS DISTINCT FROM day";

// График обзора живёт на своём периоде, независимо от среза карточек и таблиц.
// Для него не запускаем весь тяжёлый отчёт: достаточно одной дневной выборки.
// Считаем ровно то же, что карточка «Заходы»: заход, а не уникального посетителя, —
// иначе за один и тот же день карточка и точка графика показывали бы разные числа.
// Источник у захода один — тот, с которого он начался: внутри захода человек ходит
// по сайту, и ссылка поисковика есть только у первого шага.
// Рядом с заходами день отдаёт и просмотры карточек: график умеет показывать обе
// величины, а считать их вторым запросом смысла нет. Заходы — это только первые шаги
// захода, поэтому они отбираются условием в самом счётчике, а не в WHERE: иначе
// просмотры внутри захода выпали бы из выборки вместе с остальными шагами.
export async function getAnalyticsTrend(rangeValue, { db = pool, now = Date.now() } = {}) {
  const range = normalizeAnalyticsRange(rangeValue);
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  // Рядом с итогом дня подсказка показывает, сколько набралось к текущему часу —
  // полные вчерашние сутки не сравнить с сегодняшним недожитым днём. Отсечка одна
  // на весь график: сколько секунд прошло с минской полуночи прямо сейчас.
  const secondOfDay = Math.floor(((now + MINSK_OFFSET_MS) % 86_400_000) / 1000);
  const result = await db.query(`WITH steps AS (
      SELECT ${MINSK_DAY} AS day, path, event_name, lower(coalesce(properties->>'entrySource','')) AS entry_source,
        extract(epoch FROM (created_at AT TIME ZONE 'Europe/Minsk')::time) AS second_of_day,
        created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at) AS gap,
        lag(${MINSK_DAY}) OVER (PARTITION BY visitor_id ORDER BY created_at) AS previous_day
      FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
    )
    SELECT day::text AS day,
      count(*) FILTER (WHERE ${VISIT_STARTS})::int AS visits,
      count(*) FILTER (
        WHERE (${VISIT_STARTS}) AND (path ~* '(^|[?&])ysclid=' OR entry_source ~ '(^|\\.)yandex\\.')
      )::int AS yandex,
      count(*) FILTER (
        WHERE (${VISIT_STARTS}) AND entry_source ~ '(^|\\.)google\\.'
      )::int AS google,
      count(*) FILTER (WHERE event_name = 'vehicle_view')::int AS views,
      count(*) FILTER (WHERE (${VISIT_STARTS}) AND second_of_day < $3)::int AS visits_to_now,
      count(*) FILTER (WHERE event_name = 'vehicle_view' AND second_of_day < $3)::int AS views_to_now
    FROM steps
    GROUP BY day ORDER BY day`, [from, to, secondOfDay]);
  return {
    days:range.days,
    period:range.period,
    from,
    to,
    generatedAt:new Date().toISOString(),
    daily:result.rows,
  };
}

// Сорок заходов — это много или мало, видно только рядом с обычным днём, поэтому
// под цифрой «Заходы» показываем тот же отрезок суток вчера и среднее за неделю до
// этого. Сравниваем именно отрезок: в полдень сегодняшние сорок заходов сопоставимы
// с вчерашними к полудню, а не с полными вчерашними сутками, — иначе до самого
// вечера сегодняшний день всегда выглядел бы провальным. Заход считается теми же
// словами, что и в карточке и на графике, чтобы числа сходились между собой.
const VISITS_BENCHMARK_DAYS = 7;

export async function getVisitsBenchmark(rangeValue, { db = pool, now = Date.now() } = {}) {
  const range = typeof rangeValue === "string" ? normalizeAnalyticsRange(rangeValue, now) : rangeValue;
  // У многодневных срезов «в это время» смысла не имеет: там карточка показывает
  // среднее за день внутри самого периода, и сравнивать не с чем.
  if (range.days !== 1) return { visits_previous:null, visits_average:null, visits_benchmark_days:0 };
  const seconds = Math.max(1, Math.min(86_400, Math.round((range.to.getTime() - range.from.getTime()) / 1000)));
  const windowFrom = new Date(range.from.getTime() - VISITS_BENCHMARK_DAYS * 86_400_000);
  const result = await db.query(`WITH steps AS (
      SELECT ${MINSK_DAY} AS day,
        extract(epoch FROM (created_at AT TIME ZONE 'Europe/Minsk')::time) AS second_of_day,
        created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at) AS gap,
        lag(${MINSK_DAY}) OVER (PARTITION BY visitor_id ORDER BY created_at) AS previous_day
      FROM analytics_events
      WHERE created_at >= $1 AND created_at < $2 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
    )
    SELECT day::text AS day, count(*)::int AS visits
    FROM steps WHERE (${VISIT_STARTS}) AND second_of_day < $3
    GROUP BY day`, [windowFrom.toISOString(), range.from.toISOString(), seconds]);
  const byDay = new Map(result.rows.map((row) => [row.day, Number(row.visits) || 0]));
  // День без единого события в выборку не попадёт, но в среднем должен считаться
  // нулём, а не выпадать: иначе неделя простоя подняла бы «в среднем» вместо того,
  // чтобы опустить.
  const dayKey = (back) => new Date(range.from.getTime() - back * 86_400_000 + MINSK_OFFSET_MS).toISOString().slice(0, 10);
  const sample = Array.from({ length:VISITS_BENCHMARK_DAYS }, (_, index) => byDay.get(dayKey(index + 1)) || 0);
  return {
    visits_previous:sample[0],
    visits_average:Math.round(sample.reduce((total, value) => total + value, 0) / sample.length),
    visits_benchmark_days:VISITS_BENCHMARK_DAYS,
  };
}

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
  const [summaryResult,visitsResult,benchmark,actionsResult,dailyResult,catalogPagesResult,vehiclesResult,favoritesResult,registrationsResult,accountsResult,searchesResult,actionsDailyResult,visitDetailsResult] = await Promise.all([
    pool.query(`SELECT
      count(DISTINCT visitor_id) FILTER (WHERE ${LIVE_VISITOR})::int AS visitors,
      count(*) FILTER (WHERE event_name='page_view' AND ${LIVE_VISITOR})::int AS page_views,
      count(*) FILTER (WHERE event_name='vehicle_view' AND ${LIVE_VISITOR})::int AS vehicle_views,
      count(*) FILTER (WHERE event_name='availability_request_click' AND ${LIVE_VISITOR})::int AS availability_requests,
      count(DISTINCT visitor_id) FILTER (WHERE event_name='availability_request_click' AND ${LIVE_VISITOR})::int AS availability_request_people,
      count(*) FILTER (WHERE event_name='article_promo_shown' AND ${LIVE_VISITOR})::int AS promo_shown,
      count(*) FILTER (WHERE event_name='article_promo_click' AND ${LIVE_VISITOR})::int AS promo_clicks,
      count(DISTINCT visitor_id) FILTER (WHERE event_name='article_promo_click' AND ${LIVE_VISITOR})::int AS promo_click_people,
      count(*) FILTER (WHERE event_name='contact_phone_reveal' AND ${LIVE_VISITOR})::int AS contact_phone_views,
      count(*) FILTER (WHERE event_name='contact_telegram_click' AND ${LIVE_VISITOR})::int AS contact_telegram_clicks,
      count(*) FILTER (WHERE event_name='contact_viber_click' AND ${LIVE_VISITOR})::int AS contact_viber_clicks,
      count(*) FILTER (WHERE event_name='contact_instagram_click' AND ${LIVE_VISITOR})::int AS contact_instagram_clicks,
      count(*) FILTER (WHERE event_name='contact_threads_click' AND ${LIVE_VISITOR})::int AS contact_threads_clicks,
      count(*) FILTER (WHERE event_name='service_contact_question_click' AND ${LIVE_VISITOR})::int AS service_contact_question_clicks,
      count(*) FILTER (WHERE event_name='service_contact_sales_click' AND ${LIVE_VISITOR})::int AS service_contact_sales_clicks,
      count(*) FILTER (WHERE event_name='service_contact_telegram_click' AND ${LIVE_VISITOR})::int AS service_contact_telegram_clicks,
      count(*) FILTER (WHERE event_name='service_contact_email_click' AND ${LIVE_VISITOR})::int AS service_contact_email_clicks,
      count(*) FILTER (WHERE event_name IN ('app_download_qr_modal_open','app_download_qr_deeplink_modal_open') AND ${LIVE_VISITOR})::int AS app_download_qr_modal_opens,
      count(*) FILTER (WHERE event_name='app_download_app_store_modal_open' AND ${LIVE_VISITOR})::int AS app_download_app_store_modal_opens,
      count(*) FILTER (WHERE event_name='app_download_google_play_modal_open' AND ${LIVE_VISITOR})::int AS app_download_google_play_modal_opens,
      count(*) FILTER (WHERE event_name='newsletter_subscribe_modal_open' AND ${LIVE_VISITOR})::int AS newsletter_subscribe_modal_opens,
      count(*) FILTER (WHERE event_name='page_view' AND split_part(path, '?', 1) IN ('/contacts', '/contacts/') AND ${LIVE_VISITOR})::int AS contact_page_views,
      count(*) FILTER (WHERE event_name='page_view' AND split_part(path, '?', 1) IN ('/how-it-works', '/how-it-works/') AND ${LIVE_VISITOR})::int AS about_page_views,
      count(DISTINCT visitor_id) FILTER (WHERE NOT (${LIVE_VISITOR}))::int AS robot_visits
      FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND ${PUBLIC_EVENT}`, [from, to]),
    // «Заход» считаем по паузе, а не по вкладке: страница помнит номер захода, пока
    // вкладка открыта, поэтому три карточки, открытые в трёх вкладках, выглядели бы
    // тремя разными заходами, а вкладка, забытая на сутки, — одним. Новый заход
    // начинается там, где между двумя шагами посетителя прошло больше получаса либо
    // сменились минские сутки — теми же словами заход описан на графике, поэтому
    // цифра карточки и точка графика за один и тот же день совпадают.
    pool.query(`WITH steps AS (
        SELECT ${MINSK_DAY} AS day,
          created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at) AS gap,
          lag(${MINSK_DAY}) OVER (PARTITION BY visitor_id ORDER BY created_at) AS previous_day
        FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
      )
      SELECT count(*) FILTER (WHERE ${VISIT_STARTS})::int AS visits FROM steps`, [from, to]),
    getVisitsBenchmark(range),
    pool.query(`SELECT
      (SELECT count(*) FROM customer_orders WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")})::int
        + (SELECT count(*) FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND coalesce(calculation->>'requestType','') <> 'catalog_search' AND ${notStaffContact("contact")})::int AS availability_clicks,
      -- Машины, добавленные в кабинет: заказ заводится кнопкой «Уточнить актуальность»
      -- в карточке. Отдельно от строки выше, где к ним прибавлены заявки с форм.
      (SELECT count(*) FROM customer_orders WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")})::int AS cabinet_orders,
      (SELECT count(*) FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND coalesce(calculation->>'requestType','') <> 'catalog_search' AND ${notStaffContact("contact")})::int AS form_requests,
      (SELECT count(*) FROM customer_favorites WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")})::int AS favorites,
      (SELECT count(*) FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND calculation->>'requestType' = 'catalog_search' AND ${notStaffContact("contact")})::int AS custom_searches`, [from, to]),
    pool.query(`SELECT ${MINSK_DAY}::text AS day,
      count(DISTINCT visitor_id)::int AS visitors,
      count(*) FILTER (WHERE event_name='vehicle_view')::int AS vehicle_views,
      count(*) FILTER (WHERE event_name='availability_request_click')::int AS availability_requests
      FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
      GROUP BY ${MINSK_DAY} ORDER BY ${MINSK_DAY}`, [from, to]),
    pool.query(`SELECT path,
        count(*)::int AS views,
        count(DISTINCT visitor_id)::int AS viewers,
        max(created_at) AS last_viewed
      FROM analytics_events
      WHERE event_name='page_view' AND created_at >= $1 AND created_at < $2
        AND (split_part(path, '?', 1) = '/catalog' OR split_part(path, '?', 1) LIKE '/catalog/%')
        AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
      GROUP BY path
      ORDER BY max(created_at) DESC, count(*) DESC
      LIMIT 100`, [from, to]),
    pool.query(`WITH views AS (
        SELECT listing_id, max(listing_title) AS listing_title,
          count(*) FILTER (WHERE event_name='vehicle_view')::int AS views,
          count(DISTINCT visitor_id) FILTER (WHERE event_name='vehicle_view')::int AS viewers,
          max(created_at) FILTER (WHERE event_name='vehicle_view') AS last_viewed,
          count(*) FILTER (WHERE event_name='availability_request_click')::int AS availability_requests
        FROM analytics_events WHERE created_at >= $1 AND created_at < $2 AND listing_id IS NOT NULL AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR} GROUP BY listing_id
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
        COALESCE(
          array_agg(DISTINCT btrim(a.name) ORDER BY btrim(a.name))
            FILTER (WHERE btrim(coalesce(a.name, '')) <> ''),
          ARRAY[]::text[]
        ) AS owners,
        max(f.created_at) AS added_at
      FROM customer_favorites f
      JOIN customer_accounts a ON a.id = f.customer_id
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
    // Регистрации считаем по аккаунтам, а не по событиям — тем же источником, из которого
    // берётся список ниже. Иначе счётчик и список расходятся: событий может не быть вовсе
    // (браузер не отправил, посетитель заблокировал), а аккаунт всё равно создан.
    pool.query(`SELECT ${MINSK_DAY}::text AS day, count(*)::int AS registrations
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
        WHERE event_name='search_query' AND created_at >= $1 AND created_at < $2 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
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
        SELECT ${MINSK_DAY}::text AS day, count(*)::int AS availability_clicks, 0 AS custom_searches
          FROM customer_orders WHERE created_at >= $1 AND created_at < $2 AND ${notStaffAccount("customer_id")} GROUP BY 1
        UNION ALL
        SELECT ${MINSK_DAY}::text AS day,
          count(*) FILTER (WHERE coalesce(calculation->>'requestType','') <> 'catalog_search')::int,
          count(*) FILTER (WHERE calculation->>'requestType' = 'catalog_search')::int
          FROM order_drafts WHERE created_at >= $1 AND created_at < $2 AND ${notStaffContact("contact")} GROUP BY 1
      ) t GROUP BY day`, [from, to]),
    // Та же граница в 30 минут, что у верхнего счётчика «Заходы». Для каждого
    // захода показываем первый открытый адрес, источник и число просмотренных страниц.
    pool.query(`WITH ordered AS (
        SELECT visitor_id, created_at, path, event_name, properties, ${MINSK_DAY} AS day,
          created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at) AS gap,
          lag(${MINSK_DAY}) OVER (PARTITION BY visitor_id ORDER BY created_at) AS previous_day
        FROM analytics_events
        WHERE created_at >= $1 AND created_at < $2 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
      ), marked AS (
        SELECT *, CASE WHEN ${VISIT_STARTS} THEN 1 ELSE 0 END AS starts_visit
        FROM ordered
      ), numbered AS (
        SELECT *, sum(starts_visit) OVER (PARTITION BY visitor_id ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS visit_number
        FROM marked
      )
      SELECT
        (array_agg(path ORDER BY created_at))[1] AS landing_path,
        (array_agg(nullif(properties->>'entrySource','') ORDER BY created_at) FILTER (WHERE nullif(properties->>'entrySource','') IS NOT NULL))[1] AS entry_source,
        (array_agg(nullif(properties->>'device','') ORDER BY created_at) FILTER (WHERE nullif(properties->>'device','') IS NOT NULL))[1] AS device,
        (array_agg(nullif(properties->>'platform','') ORDER BY created_at) FILTER (WHERE nullif(properties->>'platform','') IS NOT NULL))[1] AS platform,
        count(*) FILTER (WHERE event_name='page_view')::int AS page_views,
        min(created_at) AS created_at
      FROM numbered
      GROUP BY visitor_id, visit_number
      ORDER BY min(created_at) DESC`, [from, to]),
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
    summary:{ ...summaryResult.rows[0], ...visitsResult.rows[0], ...benchmark, ...actionsResult.rows[0], registrations },
    daily,
    catalogPages:catalogPagesResult.rows.map((row) => ({ path:row.path, views:row.views, viewers:row.viewers, lastViewedAt:row.last_viewed })),
    vehicles:vehiclesResult.rows.map((row) => ({ listingId:row.listing_id, listingTitle:row.listing_title, views:row.views, viewers:row.viewers, availabilityClicks:row.availability_clicks, availabilityRequests:row.availability_requests, favorites:row.favorites, lastViewedAt:row.last_viewed })),
    favorites:favoritesResult.rows.map((row) => ({ listingId:row.listing_id, listingTitle:row.title, owners:row.owners || [], addedAt:row.added_at, gone:row.gone, status:row.status, priceUsd:row.estimated_total_usd })),
    // Телефон в таблице аккаунтов лежит только цифрами: плюс возвращаем, чтобы в
    // разделе он читался и работала ссылка «позвонить».
    registrations:registrationsResult.rows.map((row) => ({ name:row.name, phone:row.phone ? `+${row.phone}` : "", createdAt:row.created_at })),
    searches:searchesResult.rows.map((row) => ({ query:row.query, asked:row.asked, people:row.people, found:row.found, lastAskedAt:row.last_asked })),
    visits:visitDetailsResult.rows.map((row) => ({ source:row.entry_source || "", device:row.device || "", platform:row.platform || "", landingPath:row.landing_path || "/", pageViews:row.page_views, createdAt:row.created_at })),
  };
}

// Красные счётчики у пунктов раздела: сколько нового появилось с тех пор, как
// сотрудник в последний раз открывал этот пункт. Моменты последнего просмотра
// лежат в базе, а не в браузере: вход в раздел один на всех, и посмотренное с
// телефона должно гаснуть и на компьютере. Дата, которой в базе нет (или она
// испорчена), считается «только что»: показывать всю историю как новинку хуже,
// чем не показать ничего.
export const ANALYTICS_SECTIONS = ["overview", "leads", "vehicles", "vehicle_cars", "vehicle_favorites", "searches", "customers", "contact_interest"];

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
  const viewingSections = ANALYTICS_SECTIONS.includes(viewing) ? [viewing] : [];
  if (viewingSections.length) {
    await pool.query("UPDATE analytics_seen SET seen_at=now() WHERE section = ANY($1::text[])", [viewingSections]);
  }
  const stored = await pool.query("SELECT section, seen_at FROM analytics_seen");
  return Object.fromEntries(stored.rows.map((row) => [row.section, row.seen_at?.toISOString?.() || row.seen_at]));
}

export async function getAnalyticsUpdates({ viewing = "" } = {}, { now = Date.now() } = {}) {
  const seenBySection = await readAnalyticsSeen(viewing);
  const since = Object.fromEntries(ANALYTICS_SECTIONS.map((name) => [name, seenMoment(seenBySection[name], now)]));
  const [overview, vehicles, vehicleCars, vehicleFavorites, searches, leads, cabinetOrders, customers, contactInterest] = await Promise.all([
    // Ярлык и красные номера считают именно заходы по той же 30-минутной границе,
    // что верхняя карточка. Иначе два новых захода одного человека давали бы одну
    // плашку, а таблица и счётчик расходились бы.
    pool.query(`WITH steps AS (
        SELECT created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at) AS gap
        FROM analytics_events WHERE created_at > $1 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}
      ) SELECT count(*) FILTER (WHERE gap IS NULL OR gap > interval '30 minutes')::int AS n FROM steps`, [since.overview]),
    pool.query(`SELECT count(*)::int AS n FROM analytics_events
      WHERE event_name='page_view' AND created_at > $1
        AND (split_part(path, '?', 1) = '/catalog' OR split_part(path, '?', 1) LIKE '/catalog/%')
        AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}`, [since.vehicles]),
    pool.query(`SELECT count(*)::int AS n FROM analytics_events WHERE event_name='vehicle_view' AND created_at > $1 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}`, [since.vehicle_cars]),
    pool.query(`SELECT count(*)::int AS n FROM analytics_events WHERE event_name='favorite_added' AND created_at > $1 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}`, [since.vehicle_favorites]),
    pool.query(`SELECT count(DISTINCT btrim(properties->>'query'))::int AS n FROM analytics_events WHERE event_name='search_query' AND created_at > $1 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR} AND btrim(coalesce(properties->>'query','')) <> ''`, [since.searches]),
    pool.query(`SELECT (SELECT count(*) FROM order_drafts WHERE created_at > $1 AND ${notStaffContact("contact")})::int
      + (SELECT count(*) FROM customer_orders WHERE created_at > $1 AND ${notStaffAccount("customer_id")})::int AS n`, [since.leads]),
    pool.query(`SELECT count(*)::int AS n FROM customer_orders WHERE created_at > $1 AND ${notStaffAccount("customer_id")}`, [since.leads]),
    pool.query("SELECT count(*)::int AS n FROM customer_accounts WHERE created_at > $1 AND NOT staff", [since.customers]),
    pool.query(`SELECT
      count(*) FILTER (WHERE event_name='contact_phone_reveal')::int AS contact_phone_views,
      count(*) FILTER (WHERE event_name='contact_telegram_click')::int AS contact_telegram_clicks,
      count(*) FILTER (WHERE event_name='contact_viber_click')::int AS contact_viber_clicks,
      count(*) FILTER (WHERE event_name='contact_instagram_click')::int AS contact_instagram_clicks,
      count(*) FILTER (WHERE event_name='contact_threads_click')::int AS contact_threads_clicks,
      count(*) FILTER (WHERE event_name='service_contact_question_click')::int AS service_contact_question_clicks,
      count(*) FILTER (WHERE event_name='service_contact_sales_click')::int AS service_contact_sales_clicks,
      count(*) FILTER (WHERE event_name='service_contact_telegram_click')::int AS service_contact_telegram_clicks,
      count(*) FILTER (WHERE event_name='service_contact_email_click')::int AS service_contact_email_clicks,
      count(*) FILTER (WHERE event_name IN ('app_download_qr_modal_open','app_download_qr_deeplink_modal_open'))::int AS app_download_qr_modal_opens,
      count(*) FILTER (WHERE event_name='app_download_app_store_modal_open')::int AS app_download_app_store_modal_opens,
      count(*) FILTER (WHERE event_name='app_download_google_play_modal_open')::int AS app_download_google_play_modal_opens,
      count(*) FILTER (WHERE event_name='newsletter_subscribe_modal_open')::int AS newsletter_subscribe_modal_opens,
      count(*) FILTER (WHERE event_name='page_view' AND split_part(path, '?', 1) IN ('/contacts','/contacts/'))::int AS contact_page_views,
      count(*) FILTER (WHERE event_name='page_view' AND split_part(path, '?', 1) IN ('/how-it-works','/how-it-works/'))::int AS about_page_views
      FROM analytics_events WHERE created_at > $1 AND ${PUBLIC_EVENT} AND ${LIVE_VISITOR}`, [since.contact_interest]),
  ]);
  const contactInterestDetails = contactInterest.rows[0];
  return {
    overview:overview.rows[0].n,
    vehicles:vehicles.rows[0].n,
    vehicle_cars:vehicleCars.rows[0].n,
    vehicle_favorites:vehicleFavorites.rows[0].n,
    searches:searches.rows[0].n,
    leads:leads.rows[0].n,
    cabinet_orders:cabinetOrders.rows[0].n,
    customers:customers.rows[0].n,
    contact_interest:Object.values(contactInterestDetails).reduce((sum, value) => sum + (Number(value) || 0), 0),
    contact_interest_details:contactInterestDetails,
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

// В общем списке ID несёт источник: draft-123 — форма сайта, order-123 — заказ
// из личного кабинета. Таблицу никогда не принимаем от клиента напрямую: она
// выбирается только из этого закрытого соответствия.
export function parseAnalyticsLeadId(value) {
  const match = String(value || "").match(/^(draft|order)-([1-9]\d*)$/);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id)) return null;
  return { source:match[1], id };
}

export async function deleteAnalyticsLead(value) {
  const lead = parseAnalyticsLeadId(value);
  if (!lead) return { error:"invalid_lead_id" };
  const table = lead.source === "draft" ? "order_drafts" : "customer_orders";
  const result = await pool.query(`DELETE FROM ${table} WHERE id=$1 RETURNING id`, [lead.id]);
  if (!result.rowCount) return { error:"lead_not_found" };
  return { ok:true, id:`${lead.source}-${result.rows[0].id}` };
}

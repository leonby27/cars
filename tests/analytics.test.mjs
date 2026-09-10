import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ANALYTICS_SECTIONS, confirmHumanVisit, deviceKindFromHeaders, devicePlatformFromHeaders, createAnalyticsToken, fromAnalyticsPage, fromOwnPage, getAnalyticsTrend, hasNoCountMarker, isBotAgent, isDatacenterAddress, isInternalAnalyticsPath, normalizeAnalyticsDays, normalizeAnalyticsEvent, normalizeAnalyticsRange, notStaffAccount, notStaffContact, recordAnalyticsEvent, seenMoment, siteHost, verifyAnalyticsToken } from "../server/analytics.mjs";
import { analyticsEntrySource, hasYandexClickId, HUMAN_DWELL_MS, HUMAN_SIGNALS, isAnalyticsPath, isLocalVisit, isRepeatEvent, isSkippedVisit, postHumanConfirm, withoutYandexClickId } from "../src/analytics.js";
import { formatVisitDate } from "../src/analytics-format.js";
import { analyticsNoCountHref } from "../src/analytics-links.js";
import { analyticsUpdatesUrl } from "../src/analytics-updates.js";

test("ссылки из аналитики переносят запрет учёта даже в инкогнито", () => {
  assert.equal(analyticsNoCountHref("/blog/test"), "/blog/test?nocount=1");
  assert.equal(analyticsNoCountHref("/catalog?q=zeekr#cars"), "/catalog?q=zeekr&nocount=1#cars");
  assert.equal(analyticsNoCountHref("https://abcars.by/models/lynk-co-900"), "https://abcars.by/models/lynk-co-900?nocount=1");
  assert.equal(analyticsNoCountHref("tel:+375291234567"), "tel:+375291234567");
});

test("nocount исключает служебный переход, но не обычный трафик из ChatGPT", () => {
  assert.equal(hasNoCountMarker("/models/byd-qin-l?utm_source=chatgpt.com"), false);
  assert.equal(hasNoCountMarker("/models/byd-qin-l?utm_source=chatgpt.com&nocount=1"), true);
  assert.equal(hasNoCountMarker("https://abcars.by/blog/test?NOCOUNT=1&utm_source=chatgpt.com"), true);

  const ordinaryChatGptVisit = normalizeAnalyticsEvent({
    eventId:"gpt-visit",
    visitorId:"visitor-1",
    sessionId:"session-1",
    eventName:"page_view",
    path:"/models/byd-qin-l?utm_source=chatgpt.com",
  });
  assert.equal(ordinaryChatGptVisit.eventName, "page_view");
  assert.deepEqual(normalizeAnalyticsEvent({
    eventId:"staff-visit",
    visitorId:"visitor-2",
    sessionId:"session-2",
    eventName:"page_view",
    path:"/models/byd-qin-l?utm_source=chatgpt.com&nocount=1",
  }), { ignored:true });
});

test("таблица заходов показывает источники и фильтр Google/Яндекс", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(source, /\[\["all", "Все"\], \["yandex", "Яндекс"\], \["google", "Google"\]\]/);
  assert.match(source, /sourceFilter !== "all" && <span className="analytics-visits-filter-count"/);
  assert.match(source, /analytics-source-logo is-\$\{sourceKey\}/);
  assert.match(styles, /\.analytics-source-logo\.is-yandex/);
  assert.match(styles, /\.analytics-source-logo\.is-google/);
});

test("автоматически открытый обзор не гасит счётчик новых посещений", () => {
  assert.equal(analyticsUpdatesUrl(), "/api/analytics/updates");
  assert.equal(analyticsUpdatesUrl("overview"), "/api/analytics/updates?viewing=overview");
  assert.equal(analyticsUpdatesUrl("vehicle_favorites"), "/api/analytics/updates?viewing=vehicle_favorites");
});

test("таблицы автомобилей по умолчанию сортируются по последнему просмотру", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.match(source, /useState\(\{ column:"lastViewed", desc:true \}\)/);
  assert.match(source, /setSort\(\{ column:"lastViewed", desc:true \}\)/);
});

test("график и заходы постоянные, а баннер при каждом входе свёрнут", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.match(source, /\[open, setOpen\] = useState\(false\)/);
  assert.doesNotMatch(source, /trendOpen|Свернуть график посещений|Свернуть заходы/);
  assert.doesNotMatch(source, /analytics:(?:trend|promo)-open/);
});

test("детализация заходов стоит после баннера и всегда открыта", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.match(source, /<PromoSection summary=\{summary\} \/>\s*<VisitsSection visits=\{data\.visits \|\| \[\]\} total=\{summary\.visits\} unread=\{updates\.overview\} \/>/);
  assert.match(source, /function VisitsSection[\s\S]*?<section className="analytics-panel analytics-visits-panel">/);
  for (const heading of ["Номер", "Источник", "Страница входа", "Просмотров", "Дата"]) assert.match(source, new RegExp(`<th>${heading}<\\/th>`));
  assert.doesNotMatch(source, /<th>Источник входа<\/th>/);
  assert.doesNotMatch(source, /<th>Кол-во просмотров<\/th>/);
  assert.match(source, /newestNumber - index/);
  assert.match(source, /index < Number\(unread \|\| 0\)/);
});

test("источники графика выключены по умолчанию и запоминаются", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  const chart = await readFile(new URL("../src/analytics-visits-chart.jsx", import.meta.url), "utf8");
  assert.match(source, /analytics:trend-yandex", \["0", "1"\], "0"/);
  assert.match(source, /analytics:trend-google", \["0", "1"\], "0"/);
  assert.match(source, /type="checkbox" checked=\{showYandex === "1"\}/);
  assert.match(source, /type="checkbox" checked=\{showGoogle === "1"\}/);
  assert.match(chart, /analytics-chart-source is-\$\{source\.id\}/);
});

test("аналитика переключается без очистки уже показанных данных", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setReport\(null\)/);
  assert.match(source, /dashboardCache = useRef\(new Map\(\)\)/);
  assert.match(source, /trendCache = useRef\(new Map\(\)\)/);
  assert.match(source, /<SearchTrafficSection period=\{period\} \/>/);
});

test("названия и состав разделов аналитики соответствуют экрану", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.match(source, /label:"Запросы и позиции"/);
  assert.doesNotMatch(source, />Визиты из поисковых систем</);
  assert.doesNotMatch(source, />Последние действия</);
  assert.match(source, /\$\{formatNumber\(summary\.visitors\)\} уник\./);
  assert.match(source, /item\.lastViewedAt \? formatVisitDate\(item\.lastViewedAt\)/);
});

test("сегодняшние заходы показывают, сколько времени прошло", () => {
  const now = "2026-09-07T15:00:00+03:00";
  assert.equal(formatVisitDate("2026-09-07T14:59:40+03:00", now), "Только что");
  assert.equal(formatVisitDate("2026-09-07T14:55:00+03:00", now), "5 минут назад");
  assert.equal(formatVisitDate("2026-09-07T13:00:00+03:00", now), "2 часа назад");
});

test("страница входа остаётся в одну строку и обрезается многоточием", async () => {
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(styles, /analytics-visits-table th:nth-child\(4\)[^}]*width:280px/);
  assert.match(styles, /analytics-visits-table td:nth-child\(4\) a \{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
});

test("все крупные блоки аналитики имеют один радиус", async () => {
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(styles, /\.analytics-page, \.analytics-login \{ --analytics-block-radius:24px; \}/);
  assert.match(styles, /\.analytics-kpis article, \.analytics-panel, \.analytics-login-card \{[^}]*border-radius:var\(--analytics-block-radius\)/);
  assert.match(styles, /\.analytics-sidebar \{[^}]*border-radius:var\(--analytics-block-radius\)/);
  assert.match(styles, /\.lead-card \{[^}]*border-radius:var\(--analytics-block-radius\)/);
});

test("у раскрытого баннера есть отступ между заголовком и показателями", async () => {
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(styles, /\.analytics-collapse-trigger \+ \.analytics-figures \{ margin-top:16px; \}/);
});

test("на мобильном контролы графика и заходов стоят отдельной строкой", async () => {
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(styles, /\.analytics-trend-heading h2 \{ width:100%;[^}]*\}/);
  assert.match(styles, /\.analytics-trend-controls \{ width:100%;[^}]*flex-wrap:nowrap;[^}]*gap:14px;[^}]*\}/);
  assert.match(styles, /\.analytics-trend-period \{ margin-right:auto; \}/);
  assert.match(styles, /\.analytics-visits-heading \{[^}]*flex-direction:column;[^}]*\}/);
  assert.match(styles, /\.analytics-visits-toolbar \{ width:100%; \}/);
  assert.match(styles, /\.analytics-visits-filter-count \{ margin-left:auto; \}/);
});

test("мобильная навигация использует два кастомных селекта и хранит служебные действия в меню", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(source, /className="analytics-mobile-navigation"/);
  assert.match(source, /className="analytics-mobile-section-trigger"[^>]*aria-haspopup="menu"/);
  assert.match(source, /function MobileAnalyticsPeriodSelect[\s\S]*?className="analytics-mobile-period-trigger"[^>]*aria-haspopup="listbox"/);
  assert.match(source, /className="analytics-mobile-period-menu" role="listbox"/);
  assert.doesNotMatch(source, /analytics-mobile-period-select[\s\S]{0,200}<select/);
  assert.match(source, /analytics-mobile-section-menu[\s\S]*?Обнулить аналитику[\s\S]*?Выйти/);
  assert.doesNotMatch(source, /sectionTotals|totals\[item\.id\]/);
  assert.match(source, /className="analytics-navigation-fresh"/);
  assert.match(styles, /\.analytics-actions, \.analytics-side-rail \{ display:none; \}/);
  assert.match(styles, /\.analytics-mobile-navigation \{[^}]*display:flex;[^}]*justify-content:space-between/);
});

test("счётчики отделяют просмотренное от нового", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/analytics.mjs", import.meta.url), "utf8");
  assert.match(source, /function AnalyticsSplitCount[\s\S]*?previousAmount = amount - newAmount/);
  assert.match(source, /analytics-split-count\$\{newAmount \? " has-fresh"/);
  assert.match(source, /\["Заходы"[^\n]*updates\.overview\]/);
  assert.match(source, /\["Просмотры авто"[^\n]*updates\.vehicles\]/);
  assert.match(source, /\["Машины в кабинете"[^\n]*updates\.cabinet_orders\]/);
  assert.match(source, /\["Регистрации"[^\n]*updates\.customers\]/);
  assert.match(server, /cabinet_orders:cabinetOrders\.rows\[0\]\.n/);
});

test("analytics events are allowlisted and drop personal data", () => {
  const event = normalizeAnalyticsEvent({
    eventId:"event-1",
    visitorId:"visitor-1",
    sessionId:"session-1",
    eventName:"registration_completed",
    path:"/register",
    properties:{ name:"  Анна  ", phone:" +375 29 123-45-67 ", ignored:"secret", source:" server " },
  });
  // Приём событий открыт без пароля, поэтому имя и телефон отбрасываются даже когда их
  // прислали: контакты берутся только из таблицы аккаунтов.
  assert.deepEqual(event.properties, { source:"server" });
  assert.equal(normalizeAnalyticsEvent({ eventName:"arbitrary" }).error, "invalid_event");
  for (const eventName of ["page_view","vehicle_view","availability_click","availability_request_click","registration_completed","favorite_added","custom_search_submitted","contact_phone_reveal","contact_telegram_click","contact_viber_click","contact_instagram_click","app_download_qr_click","app_download_app_store_click","app_download_google_play_click","app_download_qr_modal_open","app_download_qr_deeplink_modal_open","app_download_app_store_modal_open","app_download_google_play_modal_open","newsletter_subscribe_click","newsletter_subscribe_modal_open"]) {
    assert.equal(normalizeAnalyticsEvent({ eventId:`event-${eventName}`, visitorId:"visitor", sessionId:"session", eventName, path:"/" }).eventName, eventName);
  }
});

test("источник захода хранится без полного адреса реферера", () => {
  assert.equal(analyticsEntrySource("", "abcars.by"), "direct");
  assert.equal(analyticsEntrySource("", "abcars.by", "/blog/ev-quota-2027?ysclid=secret"), "yandex.ru");
  assert.equal(analyticsEntrySource("https://abcars.by/catalog?q=zeekr", "abcars.by"), "internal");
  assert.equal(analyticsEntrySource("https://www.google.com/search?q=электромобиль", "abcars.by"), "google.com");
  assert.equal(analyticsEntrySource("not a url", "abcars.by"), "unknown");
  const event = normalizeAnalyticsEvent({
    eventId:"entry-1", visitorId:"v1", sessionId:"s1", eventName:"page_view", path:"/catalog",
    properties:{ entrySource:" Google.COM ", referrer:"https://google.com/search?q=private" },
  });
  assert.deepEqual(event.properties, { entrySource:"google.com" });
});

test("ysclid определяет Яндекс и не показывается в странице входа", () => {
  assert.equal(hasYandexClickId("/cars/58377594?ysclid=mtr7vm1tsa228069170"), true);
  assert.equal(hasYandexClickId("/catalog?brand=Zeekr"), false);
  assert.equal(withoutYandexClickId("/blog/ev-quota-2027?ysclid=secret"), "/blog/ev-quota-2027");
  assert.equal(withoutYandexClickId("/catalog?brand=Zeekr&ysclid=secret&year=2025#cars"), "/catalog?brand=Zeekr&year=2025#cars");
  assert.equal(withoutYandexClickId("/?YSCLID=secret"), "/");
});

test("внутренняя CRM нигде не считается страницей сайта", async () => {
  for (const path of ["/analytics", "/analytics/", "/analytics/customers?period=30", "https://abcars.by/analytics#leads"]) {
    assert.equal(isAnalyticsPath(path), true, path);
    assert.equal(isInternalAnalyticsPath(path), true, path);
    assert.equal(normalizeAnalyticsEvent({ eventId:"crm", visitorId:"staff", sessionId:"crm", eventName:"page_view", path }).ignored, true);
  }
  assert.equal(isAnalyticsPath("/catalog?from=analytics"), false);
  assert.equal(isSkippedVisit({ hostname:"abcars.by", nocount:null, automated:false, agent:"Mozilla/5.0", path:"/analytics" }), true);
  assert.equal(fromAnalyticsPage({ referer:"https://abcars.by/analytics?period=7" }), true);
  assert.equal(fromAnalyticsPage({ referer:"https://abcars.by/catalog" }), false);

  let writes = 0;
  const result = await recordAnalyticsEvent({ eventId:"crm", visitorId:"staff", sessionId:"crm", eventName:"page_view", path:"/analytics" }, { db:{ query:async () => { writes += 1; } } });
  assert.deepEqual(result, { ok:true, recorded:false });
  assert.equal(writes, 0, "CRM-событие дошло до базы");
});

test("нажатие кнопки проверки объявления считается без текста комментария", () => {
  const event = normalizeAnalyticsEvent({
    eventId:"e-check", visitorId:"v1", sessionId:"s1", eventName:"availability_request_click", path:"/account",
    listingId:"che168-1", listingTitle:"Zeekr 001 2024",
    properties:{ withComment:"yes", comment:"позвоните вечером", orderNumber:"000048" },
  });
  assert.equal(event.eventName, "availability_request_click");
  assert.equal(event.listingId, "che168-1");
  // Сам комментарий менеджеру в статистику не уходит — только признак, что он был.
  assert.deepEqual(event.properties, { withComment:"yes" });
});

test("analytics date range is restricted to dashboard presets", () => {
  assert.equal(normalizeAnalyticsDays("7"), 7);
  assert.equal(normalizeAnalyticsDays("365"), 30);
});

test("«сегодня» и «вчера» считаются по минским суткам", () => {
  // 27.08.2026, 00:30 по Минску — это 26.08 21:30 UTC: «сегодня» должно начинаться
  // с минской полуночи, иначе полчаса после полуночи показывали бы вчерашний день.
  const now = Date.parse("2026-08-26T21:30:00Z");
  const today = normalizeAnalyticsRange("today", now);
  assert.equal(today.from.toISOString(), "2026-08-26T21:00:00.000Z");
  assert.equal(today.to.toISOString(), new Date(now).toISOString());
  const yesterday = normalizeAnalyticsRange("yesterday", now);
  assert.equal(yesterday.from.toISOString(), "2026-08-25T21:00:00.000Z");
  assert.equal(yesterday.to.toISOString(), "2026-08-26T21:00:00.000Z");
  // Всё остальное — скользящее окно в днях, чужое значение не пропускаем.
  assert.equal(normalizeAnalyticsRange("7", now).days, 7);
  assert.equal(normalizeAnalyticsRange("365", now).days, 30);
  assert.equal(normalizeAnalyticsRange("365", now).from.toISOString(), new Date(now - 30 * 86_400_000).toISOString());
});

test("график обзора получает отдельный разрешённый период", async () => {
  const calls = [];
  const db = { query:async (sql, values) => { calls.push({ sql, values }); return { rows:[{ day:"2026-09-07", visitors:3 }] }; } };
  const trend = await getAnalyticsTrend("90", { db });
  assert.equal(trend.period, "90");
  assert.equal(trend.days, 90);
  assert.deepEqual(trend.daily, [{ day:"2026-09-07", visitors:3 }]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /created_at >= \$1 AND created_at < \$2/);
  assert.match(calls[0].sql, /nocount=1/, "старые служебные переходы должны исчезнуть из отчётов");
  assert.match(calls[0].sql, /AS yandex/);
  assert.match(calls[0].sql, /AS google/);
});

test("analytics tokens expire and reject tampering", () => {
  const previousPassword = process.env.ANALYTICS_PASSWORD;
  process.env.ANALYTICS_PASSWORD = "test-password";
  try {
    const now = Date.now();
    const token = createAnalyticsToken(now);
    assert.equal(verifyAnalyticsToken(token, now + 1000), true);
    assert.equal(verifyAnalyticsToken(`${token}x`, now + 1000), false);
    assert.equal(verifyAnalyticsToken(token, now + 13 * 60 * 60 * 1000), false);
  } finally {
    if (previousPassword === undefined) delete process.env.ANALYTICS_PASSWORD;
    else process.env.ANALYTICS_PASSWORD = previousPassword;
  }
});

test("одно и то же событие не записывается дважды подряд", async () => {
  const calls = [];
  const db = { query: async (sql, values) => { calls.push({ sql, values }); return { rowCount: 1 }; } };
  const event = { eventId:"e1", visitorId:"v1", sessionId:"s1", eventName:"vehicle_view", path:"/cars/1", listingId:"che168-1" };
  const result = await recordAnalyticsEvent(event, { db });
  assert.equal(result.ok, true);
  // Запись идёт только если такого же события от этого посетителя не было пару секунд назад.
  assert.match(calls[0].sql, /WHERE NOT EXISTS/);
  assert.match(calls[0].sql, /created_at > now\(\) - interval '5 seconds'/);
  assert.match(calls[0].sql, /visitor_id=\$2 AND event_name=\$4/);
  // Отброшенный повтор виден в ответе: rowCount 0 — значит не записали.
  const quiet = { query: async () => ({ rowCount: 0 }) };
  assert.deepEqual(await recordAnalyticsEvent(event, { db: quiet }), { ok:true, recorded:false });
});

test("браузер не шлёт повтор события в течение пяти секунд", () => {
  const key = "vehicle_view|che168-1|/cars/1";
  assert.equal(isRepeatEvent(key, 1_000), false);
  assert.equal(isRepeatEvent(key, 2_000), true);
  assert.equal(isRepeatEvent(key, 7_500), false);
  // Разные машины считаются отдельно.
  assert.equal(isRepeatEvent("vehicle_view|che168-2|/cars/2", 7_500), false);
});

test("заходы с рабочего компьютера в аналитику не попадают", () => {
  for (const host of ["localhost", "127.0.0.1", "192.168.1.9", "10.14.0.2", "mac.local"]) {
    assert.equal(isLocalVisit(host), true, host);
  }
  for (const host of ["abcars.by", "chinacar-mvp.vercel.app", "www.abcars.by"]) {
    assert.equal(isLocalVisit(host), false, host);
  }
});

test("быстрый просмотр и открытая следом карточка — один взгляд", () => {
  // Ключ повтора у события про машину строится по машине, а не по адресу страницы.
  assert.equal(isRepeatEvent("vehicle_view|che168-77", 1_000), false);
  assert.equal(isRepeatEvent("vehicle_view|che168-77", 3_000), true);
});

// Своя статистика молчит там же, где и Метрика: помеченный браузер (?nocount=1),
// автоматический браузер и запуск сайта на рабочем компьютере.
test("свои заходы не попадают в собственную статистику", () => {
  const live = { hostname:"abcars.by", nocount:null, automated:false };
  assert.equal(isSkippedVisit(live), false);
  assert.equal(isSkippedVisit({ ...live, nocount:"1" }), true, "метка ?nocount=1 не сработала");
  assert.equal(isSkippedVisit({ ...live, automated:true }), true, "автоматический браузер считается");
  assert.equal(isSkippedVisit({ ...live, hostname:"localhost" }), true, "рабочий компьютер считается");
  assert.equal(isSkippedVisit({ ...live, agent:"Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)" }), true, "робот с честной подписью считается");
  assert.equal(isSkippedVisit({ ...live, agent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36" }), false, "обычный браузер считать нужно");
  // Снятая метка возвращает учёт: ?nocount=0 стирает её, и остаётся пустое значение.
  assert.equal(isSkippedVisit({ ...live, nocount:"0" }), false, "снятая метка всё ещё выключает учёт");
});

// Свои регистрации, избранное и пробные заявки в раздел не идут: аккаунт помечен
// служебным, а заявку с сайта опознаём по телефону — она заводится без входа в кабинет.
test("служебные аккаунты вырезаются из подсчёта", () => {
  assert.equal(notStaffAccount("customer_id"), "customer_id NOT IN (SELECT id FROM customer_accounts WHERE staff)");
  // Телефон в заявке приходит как придётся (+375, скобки, пробелы), а в аккаунте
  // лежит одними цифрами — сравнивать можно только после очистки.
  assert.match(notStaffContact("contact"), /regexp_replace\(contact, '\\D', '', 'g'\) NOT IN/);
  assert.match(notStaffContact("d.contact"), /SELECT phone FROM customer_accounts WHERE staff AND phone <> ''/);
});

// Строку поиска в событии принимаем, всё остальное из свойств выкидываем:
// приём событий открыт без пароля, туда нельзя пускать произвольные данные.
test("событие поиска несёт запрос и число найденных машин", () => {
  const event = normalizeAnalyticsEvent({
    eventId:"e1", visitorId:"v1", sessionId:"s1", eventName:"search_query", path:"/",
    properties:{ query:"  джили галакси  ", found:"37", phone:"+375291234567" },
  });
  assert.equal(event.error, undefined);
  assert.equal(event.properties.query, "джили галакси");
  assert.equal(event.properties.found, 37);
  assert.equal(event.properties.phone, undefined, "лишние свойства должны отсекаться");
});

test("слишком длинный запрос обрезается", () => {
  const event = normalizeAnalyticsEvent({
    eventId:"e2", visitorId:"v1", sessionId:"s1", eventName:"search_query", path:"/",
    properties:{ query:"а".repeat(500) },
  });
  assert.equal(event.properties.query.length, 120);
});

// Красные счётчики считают новое с прошлого захода. Дата приходит из браузера,
// поэтому ей нельзя верить на слово.
test("момент последнего захода приводится к разумному", () => {
  const now = Date.parse("2026-08-25T09:00:00Z");
  const hourAgo = "2026-08-25T08:00:00Z";
  assert.equal(seenMoment(hourAgo, now), new Date(hourAgo).toISOString(), "нормальная дата остаётся как есть");
  // Пусто, мусор и дата из будущего — считаем, что видели всё только что.
  for (const bad of ["", null, "вчера", "2027-01-01T00:00:00Z"]) {
    assert.equal(seenMoment(bad, now), new Date(now).toISOString(), String(bad));
  }
  // Дальше месяца назад не заглядываем: цифра на ярлыке должна оставаться понятной.
  assert.equal(seenMoment("2020-01-01T00:00:00Z", now), new Date(now - 30 * 86_400_000).toISOString());
  assert.deepEqual(ANALYTICS_SECTIONS, ["overview", "leads", "vehicles", "vehicle_cars", "vehicle_favorites", "searches", "customers", "contact_interest"]);
});

test("интерес к контактам собран в отдельном разделе с контактами, приложением и подпиской", async () => {
  const page = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const server = await readFile(new URL("../server/analytics.mjs", import.meta.url), "utf8");
  assert.match(page, /label:"Клиенты"[\s\S]{0,120}label:"Интерес к контактам"/);
  for (const label of ["Просмотр телефона", "Клик по TG", "Клик по Viber", "Клик по Instagram", "Интерес к приложению — QR", "Интерес к App Store", "Интерес к Google Play", "Интерес к подписке", "Открытие страницы «Контакты»", "Открытие страницы «О сервисе»"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(app, /trackEvent\("contact_phone_reveal"\)/);
  assert.match(app, /trackEvent\(`contact_\$\{network\}_click`\)/);
  assert.match(server, /split_part\(path, '\?', 1\) IN \('\/contacts', '\/contacts\/'\)/);
  assert.match(server, /split_part\(path, '\?', 1\) IN \('\/how-it-works', '\/how-it-works\/'\)/);
});

// Приём событий открыт без пароля, поэтому записываем только то, что прислала
// страница сайта: фильтры «не считать свой заход» живут в браузере, и запрос,
// посланный мимо браузера, обошёл бы их все.
test("событие принимается только со страницы сайта", () => {
  const site = "abcars.by";
  assert.equal(fromOwnPage({ origin:"https://abcars.by" }, site), true);
  assert.equal(fromOwnPage({ referer:"https://abcars.by/catalog" }, site), true, "браузер без Origin, но с Referer");
  // Запрос из терминала или от робота: отметки нет вовсе.
  assert.equal(fromOwnPage({}, site), false);
  // Чужой сайт и похожий домен — не мы.
  assert.equal(fromOwnPage({ origin:"https://abcars.by.evil.com" }, site), false);
  assert.equal(fromOwnPage({ referer:"https://evil.com/abcars.by/" }, site), false);
  assert.equal(fromOwnPage({ origin:"https://abcars.by" }, ""), false, "без известного адреса сайта ничего не принимаем");
  // Адрес сайта берём из настроек, а не из запроса: сервер отвечает и по числовому
  // адресу, и робот, который перебирает адреса подряд, открывал по нему главную —
  // его собственная отметка совпадала сама с собой, и он попадал в статистику.
  assert.equal(fromOwnPage({ origin:"https://5.23.48.128" }, site), false, "заход по числовому адресу сервера — не своя страница");
  assert.equal(fromOwnPage({ referer:"https://5.23.48.128/" }, site), false);
  assert.equal(fromOwnPage({ origin:"https://www.abcars.by" }, site), true, "адрес с www — тот же сайт");
  assert.equal(siteHost("https://abcars.by"), "abcars.by");
  assert.equal(siteHost("abcars.by"), "abcars.by", "адрес в настройках может быть без протокола");
  assert.equal(fromOwnPage({ origin:"https://abcars.by" }), true, "без второго аргумента адрес берётся из настроек");
});

// Часть роботов работает на настоящем браузере и наш скрипт выполняет: сборщики
// данных для ИИ, проверялки скорости, обходчики каталогов. В статистике «посетителей»
// им не место. На выдачу поисковиков это не влияет — фильтр стоит только на приёме
// событий, страницы отдаются всем.
test("робот в число посетителей не попадает", () => {
  const people = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 YaBrowser/25.8.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0",
  ];
  for (const agent of people) assert.equal(isBotAgent(agent), false, agent);
  const robots = [
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    "curl/8.7.1",
    "python-requests/2.32.3",
    "",
  ];
  for (const agent of robots) assert.equal(isBotAgent(agent), true, agent || "пустая подпись");
});

// Встроенный браузер Claude, которым проверяют правки на боевом сайте. Метку
// «не считать» он не помнит — она живёт в хранилище браузера, а он каждый раз
// чистый, — поэтому свои проверки попадали в раздел как живые посетители.
test("проверки из браузера Claude в статистику не попадают", () => {
  const claude = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.37937.1 Chrome/148.0.7778.280 Safari/537.36";
  assert.equal(isBotAgent(claude), true);
  assert.equal(isSkippedVisit({ hostname:"abcars.by", nocount:null, automated:false, agent:claude }), true);
});

// Робота с арендованного сервера не выдаёт ни подпись, ни поведение: он и то и другое
// подделывает. Выдаёт адрес — диапазоны дата-центров провайдеры публикуют сами.
test("события с адресов дата-центров не записываются", async () => {
  const asked = [];
  const db = { query: async (sql, values) => { asked.push({ sql, values }); return { rowCount: values[0] === "3.5.140.7" ? 1 : 0 }; } };
  const now = Date.now();
  assert.equal(await isDatacenterAddress("3.5.140.7", { db, now }), true);
  assert.equal(await isDatacenterAddress("37.215.1.174", { db, now }), false, "домашний адрес живого посетителя");
  assert.match(asked[0].sql, /datacenter_ranges WHERE network >>= \$1/);

  // Повторный вопрос про тот же адрес идёт из памяти, а не в базу.
  const before = asked.length;
  assert.equal(await isDatacenterAddress("3.5.140.7", { db, now: now + 1000 }), true);
  assert.equal(asked.length, before, "ответ взят из кэша");
  assert.equal(await isDatacenterAddress("3.5.140.7", { db, now: now + 11 * 60 * 1000 }), true);
  assert.equal(asked.length, before + 1, "через десять минут спрашиваем заново");

  // Без адреса и при недоступной базе посетителя не теряем: пропускаем.
  assert.equal(await isDatacenterAddress("unknown", { db }), false);
  assert.equal(await isDatacenterAddress("", { db }), false);
  const broken = { query: async () => { throw new Error("relation does not exist"); } };
  assert.equal(await isDatacenterAddress("1.2.3.4", { db: broken }), false);
});

// Робота, который подделал подпись под обычный Chrome, выдаёт поведение: он снимает
// страницу и уходит, ни к чему не притронувшись. Заход записываем сразу — иначе
// потерялся бы и человек, закрывший страницу через пару секунд, — а «живым» он
// становится отдельной отметкой, когда посетитель себя проявит.
test("живого человека отмечает поведение, а не сама запись захода", async () => {
  // Признаки: движение и нажатие мыши, касание экрана, клавиша, колесо, прокрутка.
  for (const signal of ["pointermove", "pointerdown", "touchstart", "keydown", "wheel", "scroll"]) {
    assert.ok(HUMAN_SIGNALS.includes(signal), signal);
  }
  // Человек, который просто читает страницу и ничего не трогает, тоже человек —
  // но ждать его дольше нельзя, иначе в людях окажутся роботы.
  assert.equal(HUMAN_DWELL_MS, 15_000);

  // Первое событие приходит без отметки, и это нормально.
  const first = normalizeAnalyticsEvent({ eventId:"e1", visitorId:"v1", sessionId:"s1", eventName:"page_view", path:"/" });
  assert.equal(first.human, false);
  const later = normalizeAnalyticsEvent({ eventId:"e2", visitorId:"v1", sessionId:"s1", eventName:"vehicle_view", path:"/cars/1", human:true });
  assert.equal(later.human, true);
  // Признак доезжает до записи в базу отдельным значением, а не свойством события.
  const calls = [];
  const db = { query: async (sql, values) => { calls.push({ sql, values }); return { rowCount:1 }; } };
  await recordAnalyticsEvent({ ...later }, { db });
  assert.equal(calls[0].values.at(-2), true);
  assert.match(calls[0].sql, /listing_title,properties,human,human_action/);

  // Отметка ставится вдогонку на весь след этого посетителя в этом сеансе.
  const updates = [];
  const updateDb = { query: async (sql, values) => { updates.push({ sql, values }); return { rowCount:3 }; } };
  const confirmed = await confirmHumanVisit({ visitorId:"v1", sessionId:"s1", action:true }, { db:updateDb });
  assert.deepEqual(confirmed, { ok:true, confirmed:3 });
  assert.match(updates[0].sql, /UPDATE analytics_events SET human = true/);
  assert.deepEqual(updates[0].values, ["v1", "s1", true]);
  // Без опознания посетителя отмечать нечего.
  assert.equal((await confirmHumanVisit({ visitorId:"v1" }, { db:updateDb })).error, "invalid_event_identity");
});

// 26.08.2026: обходчик, который ходит через домашние адреса живых людей, брал страницу,
// выжидал те самые пятнадцать секунд и уходил — и попадал в посетителей. Поэтому время
// на странице и настоящее действие теперь разные отметки, а посетителем считается
// только второе.
test("время на странице человеком не делает — только действие", async () => {
  const updates = [];
  const db = { query: async (sql, values) => { updates.push({ sql, values }); return { rowCount:1 }; } };
  // Отметка по времени приходит без признака действия.
  await confirmHumanVisit({ visitorId:"v1", sessionId:"s1" }, { db });
  assert.deepEqual(updates[0].values, ["v1", "s1", false]);
  assert.match(updates[0].sql, /human_action = human_action OR \$3/);
  // Действие после отстоянного времени всё равно доезжает: строка обновляется, пока
  // само действие не проставлено.
  await confirmHumanVisit({ visitorId:"v1", sessionId:"s1", action:true }, { db });
  assert.deepEqual(updates[1].values, ["v1", "s1", true]);
  // Посетителей раздел считает по действию, а не по одной лишь отметке «живой».
  const dashboardSql = await readFile(new URL("../server/analytics.mjs", import.meta.url), "utf8");
  assert.match(dashboardSql, /created_at \$\{compare\} \$1 AND human_action/);
  assert.equal(/created_at \$\{compare\} \$1 AND human\)/.test(dashboardSql), false);
  // Событие несёт признак действия с собой: вторая страница того же захода приходит
  // помеченной сразу, отдельного подтверждения на каждую не нужно.
  assert.equal(normalizeAnalyticsEvent({ eventId:"e3", visitorId:"v1", sessionId:"s1", eventName:"page_view", path:"/", human:true, humanAction:true }).humanAction, true);
  assert.equal(normalizeAnalyticsEvent({ eventId:"e4", visitorId:"v1", sessionId:"s1", eventName:"page_view", path:"/", human:true }).humanAction, false);
});

// 04.09.2026: отметка «живой человек» обгоняла сам заход. Браузер отправляет заход и
// отметку почти одновременно, и если посетитель шевельнул страницу в первые
// миллисекунды, отметка приходила к серверу раньше записи — обновлять было нечего,
// и живой человек оставался в «заходах без действия»: так за сутки потерялись двое
// из шестнадцати. Сервер отвечает числом отмеченных строк, браузер повторяет отметку.
test("отметка живого посетителя повторяется, если заход ещё не записан", async () => {
  const calls = [];
  const timers = [];
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = { setTimeout:(fn) => { timers.push(fn); return timers.length; } };
  globalThis.fetch = async (path, options) => {
    calls.push({ path, body:JSON.parse(options.body) });
    return { json: async () => ({ ok:true, confirmed:calls.length < 3 ? 0 : 1 }) };
  };
  try {
    await postHumanConfirm({ visitorId:"v1", sessionId:"s1", action:true });
    assert.equal(calls.length, 1);
    // Ответ «ни одной строки» ставит повтор в очередь; отметка та же самая.
    assert.equal(timers.length, 1);
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    timers[0]();
    await flush();
    timers[1]();
    await flush();
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2].body, { visitorId:"v1", sessionId:"s1", action:true });
    assert.equal(calls[2].path, "/api/analytics/human");
    // Как только строка отмечена, повторы прекращаются.
    assert.equal(timers.length, 2);
  } finally {
    globalThis.window = previousWindow;
    globalThis.fetch = previousFetch;
  }
});

test("тип устройства берётся из заголовков запроса, а не из тела события", () => {
  assert.equal(deviceKindFromHeaders({ "sec-ch-ua-mobile":"?1", "user-agent":"Mozilla/5.0 (Windows NT 10.0)" }), "mobile");
  assert.equal(deviceKindFromHeaders({ "sec-ch-ua-mobile":"?0", "user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" }), "desktop");
  assert.equal(deviceKindFromHeaders({ "user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" }), "mobile");
  assert.equal(deviceKindFromHeaders({ "user-agent":"Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36" }), "mobile");
  assert.equal(deviceKindFromHeaders({ "user-agent":"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" }), "mobile");
  assert.equal(deviceKindFromHeaders({ "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36" }), "desktop");
  assert.equal(deviceKindFromHeaders({ "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" }), "desktop");
  assert.equal(deviceKindFromHeaders({}), "");
});

test("подделать тип устройства через тело события нельзя", () => {
  const body = {
    eventId:"e1", visitorId:"v1", sessionId:"s1", eventName:"page_view", path:"/catalog",
    properties:{ device:"mobile" },
  };
  assert.equal(normalizeAnalyticsEvent(body).properties.device, undefined);
  assert.equal(normalizeAnalyticsEvent(body, { device:"desktop" }).properties.device, "desktop");
  assert.equal(normalizeAnalyticsEvent(body, { device:"телефон" }).properties.device, undefined);
});

test("запись события кладёт тип устройства в свойства", async () => {
  const calls = [];
  const db = { query:async (sql, params) => { calls.push({ sql, params }); return { rowCount:1 }; } };
  await recordAnalyticsEvent(
    { eventId:"e2", visitorId:"v2", sessionId:"s2", eventName:"page_view", path:"/" },
    { db, headers:{ "user-agent":"Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36" } },
  );
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].params[7]).device, "mobile");
  assert.equal(JSON.parse(calls[0].params[7]).platform, "android");
});

test("система устройства узнаётся по заголовку, иначе по подписи браузера", () => {
  assert.equal(devicePlatformFromHeaders({ "sec-ch-ua-platform":'"macOS"' }), "macos");
  assert.equal(devicePlatformFromHeaders({ "sec-ch-ua-platform":'"Android"', "user-agent":"Mozilla/5.0 (Windows NT 10.0)" }), "android");
  assert.equal(devicePlatformFromHeaders({ "user-agent":"Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36" }), "android");
  assert.equal(devicePlatformFromHeaders({ "user-agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" }), "ios");
  assert.equal(devicePlatformFromHeaders({ "user-agent":"Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" }), "ios");
  assert.equal(devicePlatformFromHeaders({ "user-agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" }), "macos");
  assert.equal(devicePlatformFromHeaders({ "user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36" }), "windows");
  assert.equal(devicePlatformFromHeaders({ "user-agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36" }), "linux");
  assert.equal(devicePlatformFromHeaders({ "user-agent":"Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/126 Safari/537.36" }), "chromeos");
  assert.equal(devicePlatformFromHeaders({}), "");
});

test("подделать систему через тело события нельзя", () => {
  const body = {
    eventId:"e3", visitorId:"v3", sessionId:"s3", eventName:"page_view", path:"/",
    properties:{ platform:"android" },
  };
  assert.equal(normalizeAnalyticsEvent(body).properties.platform, undefined);
  assert.equal(normalizeAnalyticsEvent(body, { platform:"macos" }).properties.platform, "macos");
  assert.equal(normalizeAnalyticsEvent(body, { platform:"symbian" }).properties.platform, undefined);
});

test("подсказка у иконки называет систему, а иконка стоит на строке текста", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.match(source, /android:"Android"/);
  assert.match(source, /macos:"macOS"/);
  assert.match(source, /Система не записана/);
  assert.match(source, /role="tooltip"/);
  assert.match(source, /open && createPortal/);
  const styles = await readFile(new URL("../src/analytics.css", import.meta.url), "utf8");
  assert.match(styles, /\.analytics-visit-device \{[^}]*place-items:center[^}]*height:1lh/);
});

test("в таблице заходов есть колонка типа устройства после источника", async () => {
  const source = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.match(source, /<th>Источник<\/th><th>Тип<\/th><th>Страница входа<\/th>/);
  assert.match(source, /<td><VisitDevice device=\{visit\.device\} platform=\{visit\.platform\} \/><\/td>/);
  assert.match(source, /colSpan="6"/);
  const server = await readFile(new URL("../server/analytics.mjs", import.meta.url), "utf8");
  assert.match(server, /properties->>'device'/);
  assert.match(server, /device:row\.device \|\| "", platform:row\.platform \|\| ""/);
  assert.match(server, /properties->>'platform'/);
});

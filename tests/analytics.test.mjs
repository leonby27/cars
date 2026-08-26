import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ANALYTICS_SECTIONS, confirmHumanVisit, createAnalyticsToken, fromOwnPage, isBotAgent, isDatacenterAddress, normalizeAnalyticsDays, normalizeAnalyticsEvent, notStaffAccount, notStaffContact, recordAnalyticsEvent, seenMoment, siteHost, verifyAnalyticsToken } from "../server/analytics.mjs";
import { HUMAN_DWELL_MS, HUMAN_SIGNALS, isLocalVisit, isRepeatEvent, isSkippedVisit } from "../src/analytics.js";

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
  for (const eventName of ["page_view","vehicle_view","availability_click","registration_completed","favorite_added","custom_search_submitted"]) {
    assert.equal(normalizeAnalyticsEvent({ eventId:`event-${eventName}`, visitorId:"visitor", sessionId:"session", eventName, path:"/" }).eventName, eventName);
  }
});

test("analytics date range is restricted to dashboard presets", () => {
  assert.equal(normalizeAnalyticsDays("7"), 7);
  assert.equal(normalizeAnalyticsDays("365"), 30);
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
  assert.deepEqual(ANALYTICS_SECTIONS, ["overview", "leads", "vehicles", "searches", "customers"]);
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


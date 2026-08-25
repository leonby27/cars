import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyticsToken, normalizeAnalyticsDays, normalizeAnalyticsEvent, notStaffAccount, notStaffContact, recordAnalyticsEvent, verifyAnalyticsToken } from "../server/analytics.mjs";
import { isLocalVisit, isRepeatEvent, isSkippedVisit } from "../src/analytics.js";

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


import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyticsToken, normalizeAnalyticsDays, normalizeAnalyticsEvent, recordAnalyticsEvent, verifyAnalyticsToken } from "../server/analytics.mjs";
import { isLocalVisit, isRepeatEvent } from "../src/analytics.js";

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

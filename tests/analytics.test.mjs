import test from "node:test";
import assert from "node:assert/strict";
import { createAnalyticsToken, normalizeAnalyticsDays, normalizeAnalyticsEvent, verifyAnalyticsToken } from "../server/analytics.mjs";

test("analytics events are allowlisted and trim personal data", () => {
  const event = normalizeAnalyticsEvent({
    eventId:"event-1",
    visitorId:"visitor-1",
    sessionId:"session-1",
    eventName:"registration_completed",
    path:"/register",
    properties:{ name:"  Анна  ", phone:" +375 29 123-45-67 ", ignored:"secret" },
  });
  assert.deepEqual(event.properties, { name:"Анна", phone:"+375 29 123-45-67" });
  assert.equal(normalizeAnalyticsEvent({ eventName:"arbitrary" }).error, "invalid_event");
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

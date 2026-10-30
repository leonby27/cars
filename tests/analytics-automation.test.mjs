import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { hasAnalyticsAutomation, isKnownAnalyticsBotHints } from "../src/analytics-bots.js";
import { isHumanInteraction } from "../src/analytics-interaction.js";
import { REVIEWED_AUTOMATION_EVENT_IDS, REVIEWED_AUTOMATION_SQL } from "../server/analytics-reviewed-automation.mjs";
import { getAnalyticsTrend, getVisitsBenchmark, getAnalyticsDashboard, getAnalyticsUpdates, ANALYTICS_SECTIONS } from "../server/analytics.mjs";
import { pool } from "../server/db.mjs";
import { deploymentPlan } from "../scripts/lib/deploy-plan.mjs";

test("automation needs an explicit marker; privacy settings and ordinary Chrome survive", () => {
  assert.equal(hasAnalyticsAutomation({ webdriver:true }), true);
  assert.equal(hasAnalyticsAutomation({ webdriver:false, userAgentData:{ brands:[{ brand:"HeadlessChrome", version:"145" }] } }), true);
  assert.equal(isKnownAnalyticsBotHints('"Not;A=Brand";v="99", "HeadlessChrome";v="145"'), true);
  for (const hints of [undefined, '', '"Chromium";v="145", "Google Chrome";v="145"', '"Not A Brand";v="99"', '"My HeadlessChrome Browser";v="145"']) {
    assert.equal(isKnownAnalyticsBotHints(hints), false);
  }
  for (const navigator of [undefined, {}, { webdriver:false }, { userAgentData:{ brands:[] } }, { userAgentData:{ brands:[{ brand:"Google Chrome", version:"145" }] } },
    { get webdriver() { throw Error("privacy"); }, get userAgentData() { throw Error("privacy"); } }]) {
    assert.equal(hasAnalyticsAutomation(navigator), false);
  }
});

test("only browser input confirms actions; synthetic input and programmatic scroll do not", () => {
  for (const type of ["pointermove", "pointerdown", "touchstart", "keydown", "wheel", "click"]) {
    assert.equal(isHumanInteraction({ type, isTrusted:true }), true, type);
    assert.equal(isHumanInteraction({ type, isTrusted:false }), false, type);
    assert.equal(isHumanInteraction({ type, isTrusted:true }, "hidden"), false, type);
  }
  for (const event of [undefined, {}, { type:"scroll", isTrusted:true }, { type:"focus", isTrusted:true }, { type:"click" }]) {
    assert.equal(isHumanInteraction(event), false);
  }
});

test("reviewed exclusions remove only two events, preserving the same URLs and visitor's later actions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE analytics_events (event_id TEXT, visitor_id TEXT, path TEXT, human_action INTEGER)");
    const add = db.prepare("INSERT INTO analytics_events VALUES (?, ?, ?, ?)");
    const paths = ["/catalog/mg/hs?body=Кабриолет&body=Лифтбек&body=Седан&fuel=Бензин&type=Бензин", "/catalog/porsche/panamera-phev?body=Купе&body=Универсал&fuel=Дизель&priceTo=20000&type=Бензин"];
    REVIEWED_AUTOMATION_EVENT_IDS.forEach((id, i) => add.run(id, `reviewed-${i}`, paths[i], 1));
    paths.forEach((path, i) => add.run(`person-${i}`, `person-${i}`, path, 0));
    add.run("later-person", "reviewed-0", "/cars/real-car", 1);
    const rows = db.prepare(`SELECT event_id FROM analytics_events WHERE ${REVIEWED_AUTOMATION_SQL}`).all();
    assert.deepEqual(rows.map((row) => row.event_id), ["person-0", "person-1", "later-person"]);
    assert.equal(db.prepare("SELECT count(*) AS n FROM analytics_events").get().n, 5, "raw events are untouched");
    const active = db.prepare(`SELECT DISTINCT visitor_id FROM analytics_events WHERE human_action AND ${REVIEWED_AUTOMATION_SQL}`).all();
    assert.deepEqual(active.map((row) => row.visitor_id), ["reviewed-0"]);
  } finally { db.close(); }
});

test("dashboard, trends, benchmarks and unread counts share the reviewed-event exclusion", async () => {
  const calls = [];
  const db = { query:async (sql) => { calls.push(sql); return { rows:[] }; } };
  const options = { db, now:Date.parse("2026-10-30T08:00:00Z"), activity:"actions" };
  await getAnalyticsDashboard("today", options);
  await getAnalyticsTrend("7", options);
  await getVisitsBenchmark("today", options);
  const original = pool.query;
  pool.query = async (sql) => {
    calls.push(sql);
    if (sql === "SELECT section, seen_at FROM analytics_seen") return { rows:ANALYTICS_SECTIONS.map((section) => ({ section, seen_at:"2026-10-29T00:00:00Z" })) };
    return { rows:[{ n:0, page_views:0 }] };
  };
  try { await getAnalyticsUpdates({ activity:"actions" }, { now:options.now }); }
  finally { pool.query = original; }
  const events = calls.filter((sql) => /FROM (analytics_events|traffic_events)/.test(sql));
  assert.ok(events.length > 15);
  for (const sql of events) for (const id of REVIEWED_AUTOMATION_EVENT_IDS) assert.ok(sql.includes(id));
  const visits = events.find((sql) => sql.includes("AS came_back"));
  assert.match(visits, /first_seen.event_id NOT IN/);
});

test("analytics filtering does not trigger catalog maintenance at deployment", () => {
  const plan = deploymentPlan(["src/analytics.js", "src/analytics-bots.js", "src/analytics-interaction.js", "server/analytics-reviewed-automation.mjs", "server/analytics.mjs", "server/handler.mjs"]);
  assert.equal(plan.reuseCatalog, true);
  assert.equal(plan.reuseFeed, true);
  assert.equal(plan.recalculatePrices, false);
  assert.equal(plan.migrate, false);
  assert.equal(plan.restartBot, false);
});

// Request-level verification against local PostgreSQL, using only a temporary
// event table inside a rolled-back transaction. No persistent records change.
import "../config/load-env.mjs";
import assert from "node:assert/strict";
import { pool } from "../server/db.mjs";
import { getAnalyticsDashboard, getAnalyticsTrend, getVisitsBenchmark } from "../server/analytics.mjs";

const client = await pool.connect();
let queued = Promise.resolve();
const db = { query:(sql, params) => {
  const result = queued.then(() => client.query(sql, params));
  queued = result.catch(() => {});
  return result;
} };
const now = Date.parse("2026-10-02T12:00:00Z");
let id = 0;
const add = async (visitor, at, path, event = "page_view", device = "desktop", human = true, properties = {}) => {
  id += 1;
  await client.query(`INSERT INTO analytics_events
    (id,event_id,visitor_id,session_id,event_name,path,listing_id,properties,created_at,human_action)
    VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9)`,
    [id, `traffic-test-${id}`, visitor, event, path, event === "vehicle_view" ? "traffic-test-car" : null,
      JSON.stringify({ device, ...properties }), at, human]);
};
try {
  await client.query("BEGIN");
  await client.query("CREATE TEMP TABLE analytics_events (LIKE public.analytics_events INCLUDING DEFAULTS) ON COMMIT DROP");
  await add("a", "2026-10-02T06:00:00Z", "/blog/ev-quota-2027?ysclid=1", "page_view", "mobile");
  await add("a", "2026-10-02T06:05:00Z", "/catalog");
  await add("a", "2026-10-02T06:10:00Z", "/cars/1", "vehicle_view");
  await add("a", "2026-10-02T06:50:00Z", "/catalog", "page_view", "desktop", false);
  await add("a", "2026-10-02T06:55:00Z", "/cars/2", "vehicle_view", "desktop", false);
  await add("a", "2026-10-02T06:56:00Z", "/cars/2", "availability_click");
  await add("a", "2026-10-02T06:57:00Z", "/cars/2", "availability_click");
  await add("b", "2026-10-02T06:03:00Z", "/blog/ev-quota-end");
  await add("b", "2026-10-02T06:20:00Z", "/contacts", "contact_phone_reveal");
  await add("c", "2026-10-02T07:00:00Z", "/catalog", "page_view", "mobile");
  await add("c", "2026-10-02T07:04:00Z", "/blog/ev-quota-extra-2026", "page_view", "mobile");
  await add("c", "2026-10-02T07:05:00Z", "/cars/3", "vehicle_view", "mobile");
  await add("c", "2026-10-02T07:06:00Z", "/", "search_query", "mobile", true, { query:"target", found:10 });
  await add("c", "2026-10-02T07:07:00Z", "/contacts", "contact_phone_reveal", "mobile");
  await add("d", "2026-10-02T08:00:00Z", "/blog/ev-quota-extra-2026");
  await add("d", "2026-10-02T08:08:00Z", "/", "search_query", "desktop", true, { query:"quota", found:10 });
  // Minsk midnight starts a new visit even when less than half an hour passed.
  await add("g", "2026-10-01T20:55:00Z", "/EV-QUOTA/?foo=1");
  await add("g", "2026-10-01T21:05:00Z", "/catalog");
  await add("g", "2026-10-01T21:06:00Z", "/cars/4", "vehicle_view");
  // A human signal in an excluded visit still confirms this visitor globally.
  await add("live", "2026-10-01T06:00:00Z", "/ev-quota");
  await add("live", "2026-10-02T08:30:00Z", "/catalog", "page_view", "desktop", false);
  await add("live", "2026-10-02T08:31:00Z", "/cars/5", "vehicle_view", "desktop", false);
  await add("robot", "2026-10-02T09:00:00Z", "/catalog", "page_view", "desktop", false);
  // Landing before the rolling period must classify its continuation after it.
  await add("boundary", "2026-09-25T11:50:00Z", "/blog/ev-quota-2027");
  await add("boundary", "2026-09-25T12:05:00Z", "/cars/6", "vehicle_view");
  await add("benchmark", "2026-10-01T06:00:00Z", "/catalog");

  const options = { db, now, traffic:"without-quota" };
  const filtered = await getAnalyticsDashboard("today", options);
  const all = await getAnalyticsDashboard("today", { db, now });
  assert.equal(filtered.summary.visits, 4);
  assert.equal(filtered.summary.vehicle_views, 4);
  assert.equal(filtered.summary.contact_phone_views, 1);
  assert.equal(filtered.summary.availability_modal_opens, 1);
  assert.equal(filtered.summary.availability_modal_open_events, 2);
  assert.deepEqual(filtered.searches.map((row) => row.query), ["target"]);
  assert.equal(filtered.visits.length, 4);
  assert.ok(filtered.visits.every((row) => row.landingPath === "/catalog"));
  assert.equal(all.summary.visits, 7);
  assert.equal(all.summary.vehicle_views, 5);
  assert.equal(filtered.summary.lead_submissions, all.summary.lead_submissions);

  const trend = await getAnalyticsTrend("7", options);
  const today = trend.daily.find((row) => row.day === "2026-10-02");
  assert.equal(today.visits, filtered.summary.visits);
  assert.equal(today.views, filtered.summary.vehicle_views);
  assert.ok(!trend.daily.some((row) => row.day === "2026-09-25"), "продолжение квотного захода до начала периода не становится целевым");
  const desktop = await getAnalyticsDashboard("today", { ...options, device:"desktop" });
  assert.equal(desktop.summary.vehicle_views, 3, "фильтр устройства не меняет страницу входа");
  const benchmark = await getVisitsBenchmark("today", options);
  assert.equal(benchmark.visits_previous, 1);

  // Независимый рекламный срез: метки остаются только у первого шага.
  const rsya = "/catalog?utm_source=yandex&utm_medium=cpc&utm_source_type=context";
  await add("rsya-1", "2026-10-02T06:00:00Z", rsya, "page_view", "mobile");
  await add("rsya-1", "2026-10-02T06:05:00Z", "/cars/rsya", "vehicle_view");
  await add("rsya-1", "2026-10-02T06:06:00Z", "/cars/rsya", "availability_click");
  // Новый заход через 30 минут уже органический.
  await add("rsya-1", "2026-10-02T06:50:00Z", "/catalog");
  await add("rsya-quota", "2026-10-02T07:00:00Z", "/ev-quota?utm_source=rsya", "page_view", "mobile", false);
  await add("rsya-quota", "2026-10-02T07:05:00Z", "/cars/quota", "vehicle_view");
  await add("rsya-long", "2026-10-02T08:00:00Z", "/catalog?utm_campaign=" + "x".repeat(370), "page_view", "desktop", true, { acquisition:"rsya" });
  await add("organic-yandex", "2026-10-02T08:30:00Z", "/catalog?ysclid=123");
  await add("paid-search", "2026-10-02T09:00:00Z", "/catalog?yclid=123&utm_source_type=search");
  await add("rsya-midnight", "2026-10-01T20:55:00Z", rsya);
  await add("rsya-midnight", "2026-10-01T21:05:00Z", "/catalog");
  await add("rsya-benchmark", "2026-10-01T06:00:00Z", rsya);
  await add("rsya-boundary", "2026-09-25T11:50:00Z", rsya);
  await add("rsya-boundary", "2026-09-25T12:05:00Z", "/cars/rsya-boundary", "vehicle_view");
  const adOptions = { db, now, acquisition:"rsya" };
  const ads = await getAnalyticsDashboard("today", adOptions);
  assert.equal(ads.summary.visits, 3);
  assert.equal(ads.summary.vehicle_views, 2);
  assert.equal(ads.summary.availability_modal_opens, 1);
  assert.equal(ads.visits.length, 3);
  const adsWithoutQuota = await getAnalyticsDashboard("today", { ...adOptions, traffic:"without-quota" });
  assert.equal(adsWithoutQuota.summary.visits, 2);
  assert.equal(adsWithoutQuota.summary.vehicle_views, 1);
  const desktopAds = await getAnalyticsDashboard("today", { ...adOptions, device:"desktop" });
  assert.equal(desktopAds.summary.vehicle_views, 2, "мобильная страница входа не теряет категорию у действий с компьютера");
  const organic = await getAnalyticsDashboard("today", { db, now, acquisition:"organic" });
  assert.ok(organic.visits.some((row) => row.landingPath.includes("ysclid")));
  assert.ok(organic.visits.every((row) => !/yclid|utm_source=rsya|utm_source_type=context/.test(row.landingPath)));
  const allWithAds = await getAnalyticsDashboard("today", { db, now });
  assert.equal(allWithAds.summary.visits, organic.summary.visits + ads.summary.visits + 1, "поисковая реклама видна во «Все», но не в РСЯ или органике");
  assert.equal(ads.summary.lead_submissions, allWithAds.summary.lead_submissions);
  const adTrend = await getAnalyticsTrend("7", adOptions);
  assert.equal(adTrend.daily.find((row) => row.day === "2026-10-02").visits, ads.summary.visits);
  assert.equal(adTrend.daily.find((row) => row.day === "2026-09-25").views, 1, "источник входа найден до границы скользящего периода");
  const adBenchmark = await getVisitsBenchmark("today", adOptions);
  assert.equal(adBenchmark.visits_previous, 1);
  console.log("Landing filter verified: all quota articles, complete visits, return visits, midnight, rolling-period boundary, devices, graph, benchmark, search and contacts.");
  console.log("Acquisition filter verified: RSYA, organic search, paid search, untagged continuation, quota/device combination, long landing URL, midnight, rolling boundary, graph and benchmark.");
} finally {
  await client.query("ROLLBACK");
  client.release();
  await pool.end();
}

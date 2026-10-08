import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLeadAttribution, leadSourceReport } from "../src/lead-attribution.js";
import { countLeadPeople } from "../server/analytics-lead-people.mjs";
import { getAnalyticsLeadSources, normalizeAnalyticsRange } from "../server/analytics.mjs";

const entry = (source = "yandex.ru", landingPath = "/catalog/china") => ({ source, landingPath, submittedPath:"/cars/123" });
const rows = [
  { id:"draft-2", phone:"375291234567", kind:"custom_search", origin:"site", created_at:"2026-10-08T10:01:00Z", attribution:entry("google.com") },
  { id:"order-1", customer_id:"account-1", phone:"+375 (29) 123-45-67", kind:"car", origin:"account", created_at:"2026-10-08T10:00:00Z", attribution:entry("yandex.by") },
  { id:"draft-3", phone:"375291234568", kind:"car", origin:"site", created_at:"2026-10-08T10:02:00Z", attribution:null },
];

test("sources use recorded entry and normalize campaign tags without trusting acquisition", () => {
  assert.deepEqual(normalizeLeadAttribution({ ...entry(" WWW.GOOGLE.COM "), acquisition:"paid" }), { ...entry("google.com"), acquisition:"organic" });
  const paid = normalizeLeadAttribution(entry("direct", "/catalog?utm_source=yandex&utm_medium=cpc&utm_campaign=autumn"));
  assert.equal(paid.source, "yandex-direct");
  assert.equal(paid.acquisition, "paid");
  assert.match(paid.landingPath, /utm_campaign=autumn/);
});

test("invalid, external and service paths cannot become entry links", () => {
  for (const path of ["https://other.test", "//other.test", "/\\other.test", "/analytics", "/analytics/secret", "/../analytics", "/cars\n123"]) assert.equal(normalizeLeadAttribution(entry("direct", path)), null, path);
  assert.equal(normalizeLeadAttribution(null), null);
  assert.equal(normalizeLeadAttribution(entry("<script>")), null);
  assert.equal(normalizeLeadAttribution({ ...entry(), submittedPath:"https://other.test" }).submittedPath, "");
});

test("unique sources match KPI people and keep first submission source", () => {
  const report = leadSourceReport(rows);
  assert.equal(report.total, countLeadPeople(rows).lead_people);
  assert.equal(report.submissions, 3);
  assert.deepEqual(report.groups, [{ source:"yandex.ru", count:1 }, { source:"", count:1 }]);
  assert.deepEqual(report.leads.map((lead) => lead.id), ["draft-3", "order-1"]);
  assert.equal(report.leads[0].attribution, null);
  assert.doesNotMatch(JSON.stringify(report), /375291|account-1|customer_id|phone/);
  assert.equal(rows[0].id, "draft-2", "report must not reorder input");
});

test("repeat mode retains every submission and unknown source, including empty reports", () => {
  const report = leadSourceReport(rows, "all");
  assert.equal(report.total, 3);
  assert.equal(report.groups.reduce((sum, group) => sum + group.count, 0), 3);
  assert.equal(leadSourceReport([], "all").total, 0);
  assert.equal(leadSourceReport(rows, "invalid").mode, "unique");
});

test("source report uses KPI Minsk period, excludes staff and has no CRM row limit", async () => {
  const now = Date.parse("2026-10-07T22:00:00Z");
  const range = normalizeAnalyticsRange("today", now);
  const report = await getAnalyticsLeadSources("today", "all", { now, db:{ query:async (sql, params) => {
    assert.deepEqual(params, [range.from, range.to]);
    assert.match(sql, /SELECT phone FROM customer_accounts WHERE staff/);
    assert.match(sql, /SELECT id FROM customer_accounts WHERE staff/);
    assert.match(sql, /calculation->'attribution'/);
    assert.match(sql, /o.lead_attribution/);
    assert.doesNotMatch(sql, /LIMIT|device/);
    return { rows:Array.from({ length:251 }, (_, i) => ({ ...rows[0], id:`draft-${i}` })) };
  } } });
  assert.equal(report.total, 251);
  assert.equal(report.period, "today");
});

test("new leads retain first landing through navigation, then restart after visit expiry", async () => {
  const previousWindow = globalThis.window;
  const previousNow = Date.now;
  let now = Date.parse("2026-10-08T10:00:00Z");
  const values = new Map();
  globalThis.window = { location:{ hostname:"localhost", pathname:"/catalog/china", search:"?utm_source=yandex&utm_medium=cpc" }, document:{ referrer:"https://yandex.ru/search" }, sessionStorage:{ getItem:(key) => values.get(key), setItem:(key, value) => values.set(key, value) } };
  Date.now = () => now;
  try {
    const { leadAttribution } = await import(`../src/analytics.js?attribution-test=${now}`);
    const first = leadAttribution();
    window.location.pathname = "/cars/123"; window.location.search = "";
    now += 60_000;
    assert.deepEqual(leadAttribution(), { ...first, submittedPath:"/cars/123" });
    now += 1_800_001;
    window.document.referrer = "";
    assert.equal(leadAttribution().landingPath, "/cars/123");
    assert.equal(leadAttribution().source, "direct");
    window.location.pathname = "/analytics";
    assert.equal(leadAttribution(), null);
  } finally { globalThis.window = previousWindow; Date.now = previousNow; }
});

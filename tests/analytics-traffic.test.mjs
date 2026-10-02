import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { analyticsTrafficKind, analyticsTrafficSource } from "../server/analytics-traffic.mjs";
import { analyticsUpdatesUrl } from "../src/analytics-updates.js";
import { getAnalyticsTrend, getVisitsBenchmark } from "../server/analytics.mjs";
import { BLOG_POSTS } from "../src/blog-posts.js";
import { isQuotaLandingPath } from "../src/analytics-quota-pages.js";

test("все существующие статьи о квоте и раздел попадают под одно правило", () => {
  const quotaPosts = BLOG_POSTS.filter((post) => /quota/.test(post.slug));
  assert.ok(quotaPosts.length >= 3);
  for (const post of quotaPosts) {
    assert.equal(isQuotaLandingPath(`/blog/${post.slug}?ysclid=abc`), true, post.slug);
  }
  assert.equal(isQuotaLandingPath("/blog/ev-quota-new-2028#faq"), true);
  assert.equal(isQuotaLandingPath("/EV-QUOTA/?utm_source=google"), true);
  assert.equal(isQuotaLandingPath("/catalog?q=quota"), false);
});

test("режим из запроса допускает только два значения, общий режим не меняет запросы", async () => {
  assert.equal(analyticsTrafficKind("without-quota"), "without-quota");
  assert.equal(analyticsTrafficKind("all"), "all");
  assert.equal(analyticsTrafficKind("without-quota'; DROP TABLE analytics_events; --"), "all");
  const calls = [];
  const db = { query:async (...args) => { calls.push(args); return { rows:[] }; } };
  const all = analyticsTrafficSource(db, "all", "true");
  assert.equal(all.db, db);
  assert.equal(all.events, "analytics_events");
  const filtered = analyticsTrafficSource(db, "without-quota", "true");
  await filtered.db.query("SELECT * FROM customer_accounts");
  assert.deepEqual(calls, [["SELECT * FROM customer_accounts", undefined]], "запросы без событий не получают лишних параметров и CTE");
});

test("график и сравнение с прошлой неделей применяют фильтр целого захода до среза устройств", async () => {
  const calls = [];
  const db = { query:async (sql, params) => { calls.push({ sql, params }); return { rows:[] }; } };
  const now = Date.parse("2026-10-02T12:00:00Z");
  await getAnalyticsTrend("7", { db, now, traffic:"without-quota", device:"desktop" });
  await getVisitsBenchmark("today", { db, now, traffic:"without-quota" });
  for (const { sql } of calls) {
    assert.match(sql, /first_value\(path\) OVER \(PARTITION BY visitor_id, traffic_visit/);
    assert.match(sql, /traffic_previous_day IS DISTINCT FROM traffic_day/);
    assert.match(sql, /FROM traffic_events/);
    assert.match(sql, /human_action AND path <> '\/analytics'/);
    const ordered = sql.slice(0, sql.indexOf("traffic_numbered AS"));
    assert.doesNotMatch(ordered, /properties->>'device'|human_action/);
    assert.match(ordered, /date_trunc\('day'/, "начало захода ищем с полуночи, включая события до скользящего периода");
  }
  assert.equal(calls[0].params[0], "2026-09-25T12:00:00.000Z");
  assert.match(calls[0].sql, /FROM traffic_events[\s\S]*?properties->>'device' = 'desktop'/);
});

test("фильтр передаётся в счётчики, запросы и оба кэша; заголовок без даты обновления", async () => {
  assert.equal(analyticsUpdatesUrl("", "without-quota"), "/api/analytics/updates?traffic=without-quota");
  assert.equal(analyticsUpdatesUrl(["overview", "vehicles"], "without-quota"), "/api/analytics/updates?viewing=overview%2Cvehicles&traffic=without-quota");
  const page = await readFile(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
  assert.match(page, /<h1>Аналитика<\/h1>/);
  assert.doesNotMatch(page, /Срез обновлён|Аналитика и заявки/);
  assert.match(page, /\$\{trendPeriod\}\|\$\{device\}\|\$\{traffic\}/);
  assert.match(page, /\$\{targetPeriod\}\|\$\{targetDevice\}\|\$\{targetTraffic\}/);
  assert.match(page, /trafficRef.current === targetTraffic/);
  assert.equal((page.match(/<AnalyticsTrafficSwitch value=\{traffic\}/g) || []).length, 2, "desktop и mobile");
  const handler = await readFile(new URL("../server/handler.mjs", import.meta.url), "utf8");
  assert.equal((handler.match(/traffic:url.searchParams.get\("traffic"\)/g) || []).length, 3, "dashboard, trend и updates");
});

test("переключатель показывает выбранный режим, а смешанные данные воронки помечены", async () => {
  const vite = await createServer({ configFile:false, plugins:[react()], server:{ middlewareMode:true }, appType:"custom" });
  try {
    const { AnalyticsTrafficSwitch, LeadFunnelCard } = await vite.ssrLoadModule("/src/analytics-page.jsx");
    const html = renderToStaticMarkup(createElement(AnalyticsTrafficSwitch, { value:"without-quota", onChange:() => {} }));
    assert.match(html, /aria-pressed="true">Без квоты<\/button>/);
    assert.match(html, /aria-pressed="false">Все<\/button>/);
    const card = renderToStaticMarkup(createElement(LeadFunnelCard, { traffic:"without-quota", summary:{ lead_people:2, availability_modal_opens:3 } }));
    assert.match(card, /Открытия — без квоты, заявки — все/);
    assert.match(card, /Заявки показаны все/);
  } finally { await vite.close(); }
});

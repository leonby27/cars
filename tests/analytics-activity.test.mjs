import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyticsActivityKind } from '../src/analytics-activity.js';
import { analyticsUpdatesUrl, navigationViewedSections, watchAnalyticsExit } from '../src/analytics-updates.js';
import { ANALYTICS_SECTIONS, getAnalyticsTrend, getVisitsBenchmark, getAnalyticsUpdates, readAnalyticsSeen } from '../server/analytics.mjs';
import { pool } from '../server/db.mjs';

test('активность по умолчанию включает все записанные заходы, неизвестные значения безопасны', () => {
  assert.equal(analyticsActivityKind('actions'), 'actions');
  for (const value of [undefined, null, '', 'all', 'human', "actions' OR 1=1 --"]) assert.equal(analyticsActivityKind(value), 'all');
});

test('график и сравнение одинаково переключают все заходы и действия, независимо от рекламного среза', async () => {
  const calls = [];
  const db = { query:async (sql) => { calls.push(sql); return { rows:[] }; } };
  const now = Date.parse('2026-10-06T08:00:00Z');
  for (const activity of [undefined, 'all', 'actions', 'bad']) {
    const options = { db, now, acquisition:'paid', traffic:'without-quota', device:'mobile', activity };
    const trend = await getAnalyticsTrend('7', options);
    await getVisitsBenchmark('today', options);
    assert.equal(trend.activity, analyticsActivityKind(activity));
    for (const sql of calls.splice(0)) {
      assert.equal(sql.includes('WHERE human_action AND'), activity === 'actions');
      assert.match(sql, /IN \('paid', 'rsya'\)/);
      const landing = sql.slice(0, sql.indexOf('traffic_numbered AS'));
      assert.doesNotMatch(landing, /human_action|properties->>'device'/);
      assert.match(sql, /properties->>'device' = 'mobile'/);
    }
  }
});

test('непрочитанные счётчики применяют режим действий ко всем событиям, сохраняя заявки и аккаунты', async () => {
  const original = pool.query;
  const calls = [];
  pool.query = async (sql) => {
    calls.push(sql);
    if (sql === 'SELECT section, seen_at FROM analytics_seen') return { rows:ANALYTICS_SECTIONS.map((section) => ({ section, seen_at:'2026-10-05T00:00:00Z' })) };
    return { rows:[{ n:0, page_views:7 }] };
  };
  try {
    for (const activity of ['all', 'actions']) {
      const updates = await getAnalyticsUpdates({ activity, acquisition:'paid' }, { now:Date.parse('2026-10-06T08:00:00Z') });
      assert.equal(updates.page_views, 7);
      assert.equal(updates.overview, 0);
      const queries = calls.splice(0);
      const events = queries.filter((sql) => sql.includes('FROM traffic_events'));
      assert.equal(events.length, 6);
      assert.match(events[0], /created_at > \$1 AND event_name='page_view'\)::int AS page_views/);
      assert.ok(events.every((sql) => sql.includes('WHERE human_action AND') === (activity === 'actions')));
      const saved = queries.filter((sql) => /FROM (order_drafts|customer_orders|customer_accounts)/.test(sql));
      assert.ok(saved.length >= 3);
      assert.ok(saved.every((sql) => !sql.includes('human_action')));
    }
  } finally { pool.query = original; }
});

test('повторный обзор сохраняет отметки всех разделов, кроме заявок, одним запросом', async () => {
  const original = pool.query;
  const sections = navigationViewedSections('overview', 'overview');
  assert.deepEqual([...sections].sort(), ANALYTICS_SECTIONS.filter((section) => section !== 'leads').sort());
  const updates = [];
  const seen = Object.fromEntries(ANALYTICS_SECTIONS.map((section) => [section, '2026-10-05T00:00:00Z']));
  pool.query = async (sql, values) => {
    if (sql.startsWith('UPDATE analytics_seen')) {
      updates.push(values[0]);
      for (const section of values[0]) seen[section] = '2026-10-06T08:00:00Z';
    }
    return { rows:sql === 'SELECT section, seen_at FROM analytics_seen' ? Object.entries(seen).map(([section, seen_at]) => ({ section, seen_at })) : [] };
  };
  try {
    const stored = await readAnalyticsSeen(sections.join(','));
    assert.deepEqual(updates, [sections]);
    for (const section of sections) assert.equal(stored[section], '2026-10-06T08:00:00Z');
    assert.equal(stored.leads, '2026-10-05T00:00:00Z');
  } finally { pool.query = original; }
});

test('выбранный режим передаётся в обновления, в том числе при закрытии страницы', async () => {
  assert.equal(analyticsUpdatesUrl('', 'all', 'paid', 'actions'), '/api/analytics/updates?acquisition=paid&activity=actions');
  assert.equal(analyticsUpdatesUrl('overview', 'without-quota', 'organic', 'all'), '/api/analytics/updates?viewing=overview&traffic=without-quota&acquisition=organic');
  let onHide;
  const calls = [];
  const target = { addEventListener:(_, callback) => { onHide = callback; }, removeEventListener:() => {} };
  const stop = watchAnalyticsExit(() => ['overview'], target, async (url, options) => { calls.push({ url, options }); }, () => ({ traffic:'without-quota', acquisition:'paid', activity:'actions' }));
  onHide();
  stop();
  assert.equal(calls[0].url, '/api/analytics/updates?viewing=overview&traffic=without-quota&acquisition=paid&activity=actions');
  assert.equal(calls[0].options.keepalive, true);
});

test('активность участвует в запросах, кэшах и защите от старых ответов; выход расположен под меню', async () => {
  const page = await readFile(new URL('../src/analytics-page.jsx', import.meta.url), 'utf8');
  const handler = await readFile(new URL('../server/handler.mjs', import.meta.url), 'utf8');
  assert.match(page, /const \[activity, setActivity\] = useState\("actions"\)/);
  assert.match(page, /\$\{acquisition\}\|\$\{activity\}/);
  assert.match(page, /\$\{targetAcquisition\}\|\$\{targetActivity\}/);
  assert.match(page, /activityRef.current === targetActivity/);
  assert.match(page, /if \(controller.signal.aborted\) return;/);
  assert.equal((handler.match(/activity:url.searchParams.get\("activity"\)/g) || []).length, 3);
  assert.equal((page.match(/<AnalyticsActivitySelect value=\{activity\}/g) || []).length, 2);
  const heading = page.slice(page.indexOf('<header className="analytics-heading">'), page.indexOf('</header>', page.indexOf('<header className="analytics-heading">')));
  assert.doesNotMatch(heading, /SignOut|Выйти/);
  assert.match(page, /analytics-sidebar-extra[\s\S]*?analytics-sidebar-social[\s\S]*?analytics-sidebar-logout[\s\S]*?Выйти/);
});

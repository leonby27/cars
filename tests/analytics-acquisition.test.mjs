import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestServer as createServer } from './vite-test-server.mjs';
import react from '@vitejs/plugin-react';
import { analyticsAcquisition, analyticsAcquisitionKind } from '../src/analytics-acquisition.js';
import { analyticsEntrySource } from '../src/analytics.js';
import { analyticsUpdatesUrl } from '../src/analytics-updates.js';
import { normalizeAnalyticsEvent, getAnalyticsTrend, getVisitsBenchmark } from '../server/analytics.mjs';
import { analyticsTrafficSource } from '../server/analytics-traffic.mjs';

test('РСЯ требует метку сети, органический ysclid и рекламный yclid различаются', () => {
  for (const path of [
    '/?utm_source=rsya', '/?UTM_SOURCE=RSYA', '/?utm_source=%D1%80%D1%81%D1%8F',
    '/?utm_source=yandex&utm_medium=cpc&utm_source_type=context',
    '/?yclid=123&source_type=context',
  ]) assert.equal(analyticsAcquisition(path), 'rsya', path);
  for (const path of ['/', '/?ysclid=123', '/?utm_source=chatgpt.com', '/?utm_source=yandex', '/?fbclid=123']) {
    assert.equal(analyticsAcquisition(path), 'organic', path);
  }
  for (const path of ['/?yclid=123', '/?gclid=123', '/?utm_source=yandex&utm_medium=cpc&utm_source_type=search']) {
    assert.equal(analyticsAcquisition(path), 'paid', path);
  }
  assert.equal(analyticsAcquisition('/?utm_content=x%26utm_source%3Drsya'), 'organic');
  assert.equal(analyticsAcquisitionKind("rsya'; DROP TABLE analytics_events; --"), 'all');
  assert.equal(analyticsEntrySource('', 'abcars.by', '/?utm_source=yandex&utm_medium=cpc&utm_source_type=context'), 'rsya');
});

test('категория сохраняется до сокращения длинного адреса и не берётся из тела события', () => {
  const identity = { eventId:'e', visitorId:'v', sessionId:'s', eventName:'page_view' };
  const event = normalizeAnalyticsEvent({ ...identity, path:`/?utm_campaign=${'x'.repeat(450)}&utm_source=rsya`, properties:{ acquisition:'organic' } });
  assert.equal(event.path.length, 400);
  assert.equal(event.properties.acquisition, 'rsya');
  assert.equal(normalizeAnalyticsEvent({ ...identity, path:'/', properties:{ acquisition:'rsya' } }).properties.acquisition, undefined);
});

test('источник применяется ко всему визиту до устройства и к обоим сравнениям', async () => {
  const calls = [];
  const db = { query:async (sql, params) => { calls.push({ sql, params }); return { rows:[] }; } };
  const now = Date.parse('2026-10-05T12:00:00Z');
  const trend = await getAnalyticsTrend('7', { db, now, acquisition:'rsya', device:'desktop', traffic:'without-quota' });
  await getVisitsBenchmark('today', { db, now, acquisition:'organic' });
  assert.equal(trend.acquisition, 'rsya');
  for (const { sql } of calls) {
    assert.match(sql, /first_value\(properties->>'acquisition'\)/);
    assert.match(sql, /traffic_previous_day IS DISTINCT FROM traffic_day/);
    assert.match(sql, /FROM traffic_events/);
    assert.doesNotMatch(sql.slice(0, sql.indexOf('traffic_numbered AS')), /properties->>'device'|human_action/);
  }
  assert.match(calls[0].sql, /!~.*quota/);
  assert.match(calls[0].sql, /END\) = 'rsya'/);
  assert.match(calls[1].sql, /END\) = 'organic'/);
  assert.equal(analyticsTrafficSource(db, 'all', 'true', { acquisition:'invalid' }).db, db);
});

test('счётчики и кэши учитывают независимые фильтры, периоды сокращены', async () => {
  assert.equal(analyticsUpdatesUrl('', 'all', 'rsya'), '/api/analytics/updates?acquisition=rsya');
  assert.equal(analyticsUpdatesUrl(['overview', 'vehicles'], 'without-quota', 'organic'), '/api/analytics/updates?viewing=overview%2Cvehicles&traffic=without-quota&acquisition=organic');
  const page = await readFile(new URL('../src/analytics-page.jsx', import.meta.url), 'utf8');
  assert.match(page, /\$\{trendPeriod\}\|\$\{device\}\|\$\{traffic\}\|\$\{acquisition\}/);
  assert.match(page, /\$\{targetPeriod\}\|\$\{targetDevice\}\|\$\{targetTraffic\}\|\$\{targetAcquisition\}/);
  assert.match(page, /acquisitionRef.current === targetAcquisition/);
  assert.equal((page.match(/<AnalyticsAcquisitionSwitch value=\{acquisition\}/g) || []).length, 2);
  for (const days of ['7', '30', '90']) assert.match(page, new RegExp(`id:"${days}", label:"${days}"`));
  const handler = await readFile(new URL('../server/handler.mjs', import.meta.url), 'utf8');
  assert.equal((handler.match(/acquisition:url.searchParams.get\("acquisition"\)/g) || []).length, 3);
});

test('переключатель показывает три режима, заявки без источника явно помечены', async () => {
  const vite = await createServer({ configFile:false, plugins:[react()], server:{ middlewareMode:true, hmr:false }, appType:'custom' });
  try {
    const { AnalyticsAcquisitionSwitch, LeadFunnelCard } = await vite.ssrLoadModule('/src/analytics-page.jsx');
    const html = renderToStaticMarkup(createElement(AnalyticsAcquisitionSwitch, { value:'rsya', onChange:() => {} }));
    assert.match(html, /aria-pressed="true"[^>]*>РСЯ<\/button>/);
    assert.match(html, />Органик<\/button>/);
    assert.match(html, />Все<\/button>/);
    const card = renderToStaticMarkup(createElement(LeadFunnelCard, { acquisition:'rsya', summary:{ lead_people:2, availability_modal_opens:3 } }));
    assert.match(card, /Открытия — РСЯ, заявки — все/);
    assert.match(card, /Фильтр источника действует на открытия окна/);
  } finally { await vite.close(); }
});

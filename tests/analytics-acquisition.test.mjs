import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestServer as createServer } from './vite-test-server.mjs';
import react from '@vitejs/plugin-react';
import { analyticsAdvertisingSource, analyticsAcquisition, analyticsAcquisitionKind } from '../src/analytics-acquisition.js';
import { analyticsEntrySource } from '../src/analytics.js';
import { analyticsUpdatesUrl } from '../src/analytics-updates.js';
import { normalizeAnalyticsEvent, getAnalyticsTrend, getVisitsBenchmark } from '../server/analytics.mjs';
import { analyticsTrafficSource } from '../server/analytics-traffic.mjs';
import { deploymentPlan } from '../scripts/lib/deploy-plan.mjs';

test('платный срез и селект периода не требуют подготовки каталога и пересчёта цен', () => {
  const plan = deploymentPlan(['src/analytics-acquisition.js', 'src/analytics-activity.js', 'src/analytics.js', 'src/analytics-page.jsx',
    'src/analytics.css', 'server/analytics-traffic.mjs', 'server/analytics.mjs', 'server/handler.mjs', 'scripts/lib/deploy-impact.mjs']);
  assert.equal(plan.reuseCatalog, true);
  assert.equal(plan.reuseFeed, true);
  assert.equal(plan.recalculatePrices, false);
  assert.equal(plan.migrate, false);
  assert.equal(plan.checkDuplicates, false);
  assert.equal(plan.restartBot, false);
});

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
  assert.equal(analyticsAcquisitionKind('rsya'), 'paid');
  assert.equal(analyticsAcquisitionKind('paid'), 'paid');
  assert.equal(analyticsEntrySource('', 'abcars.by', '/?utm_source=yandex&utm_medium=cpc&utm_source_type=context'), 'rsya');
});

test('Директ без метки сети не становится прямым заходом или органическим Яндексом', () => {
  for (const path of [
    '/?yclid=123', '/?YCLID=123', '/?yclid=123&ysclid=456',
    '/?utm_source=yandex&utm_medium=cpc&utm_source_type=search',
  ]) {
    assert.equal(analyticsAdvertisingSource(path), 'yandex-direct', path);
    assert.equal(analyticsEntrySource('', 'abcars.by', path), 'yandex-direct', path);
    assert.equal(analyticsEntrySource('https://yandex.by/search', 'abcars.by', path), 'yandex-direct', path);
    assert.equal(analyticsAcquisition(path), 'paid', 'подпись не подменяет неизвестную сеть на РСЯ');
  }
  for (const path of ['/?ysclid=123', '/?yclid=', '/?gclid=123', '/?utm_content=x%26yclid%3D123', '/?utm_source=yandex']) {
    assert.equal(analyticsAdvertisingSource(path), '', path);
  }
  assert.equal(analyticsAdvertisingSource('/?yclid=123&utm_source_type=context'), 'rsya');
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
  const trend = await getAnalyticsTrend('7', { db, now, acquisition:'paid', device:'desktop', traffic:'without-quota' });
  await getVisitsBenchmark('today', { db, now, acquisition:'organic' });
  assert.equal(trend.acquisition, 'paid');
  for (const { sql } of calls) {
    assert.match(sql, /first_value\(properties->>'acquisition'\)/);
    assert.match(sql, /traffic_previous_day IS DISTINCT FROM traffic_day/);
    assert.match(sql, /FROM traffic_events/);
    assert.doesNotMatch(sql.slice(0, sql.indexOf('traffic_numbered AS')), /properties->>'device'|human_action/);
  }
  assert.match(calls[0].sql, /!~.*quota/);
  assert.match(calls[0].sql, /END\) IN \('paid', 'rsya'\)/);
  assert.match(calls[1].sql, /END\) = 'organic'/);
  assert.equal(analyticsTrafficSource(db, 'all', 'true', { acquisition:'invalid' }).db, db);
});

test('счётчики и кэши учитывают независимые фильтры, периоды названы полностью', async () => {
  assert.equal(analyticsUpdatesUrl('', 'all', 'paid'), '/api/analytics/updates?acquisition=paid');
  assert.equal(analyticsUpdatesUrl('', 'all', 'rsya'), '/api/analytics/updates?acquisition=paid');
  assert.equal(analyticsUpdatesUrl(['overview', 'vehicles'], 'without-quota', 'organic'), '/api/analytics/updates?viewing=overview%2Cvehicles&traffic=without-quota&acquisition=organic');
  const page = await readFile(new URL('../src/analytics-page.jsx', import.meta.url), 'utf8');
  assert.match(page, /\$\{trendPeriod\}\|\$\{device\}\|\$\{traffic\}\|\$\{acquisition\}/);
  assert.match(page, /\$\{targetPeriod\}\|\$\{targetDevice\}\|\$\{targetTraffic\}\|\$\{targetAcquisition\}/);
  assert.match(page, /acquisitionRef.current === targetAcquisition/);
  assert.match(page, /const \[acquisition, setAcquisition\] = useState\("organic"\)/);
  assert.match(page, /const stored = normalize\(window.localStorage.getItem\(key\)\)/);
  assert.equal((page.match(/<AnalyticsAcquisitionSwitch value=\{acquisition\}/g) || []).length, 2);
  for (const days of ['7', '30', '90']) assert.match(page, new RegExp(`id:"${days}", label:"${days} дней"`));
  const handler = await readFile(new URL('../server/handler.mjs', import.meta.url), 'utf8');
  assert.equal((handler.match(/acquisition:url.searchParams.get\("acquisition"\)/g) || []).length, 3);
});

test('переключатель показывает три режима, заявки без источника явно помечены', async () => {
  const vite = await createServer({ configFile:false, plugins:[react()], server:{ middlewareMode:true, hmr:false }, appType:'custom' });
  try {
    const { AnalyticsAcquisitionSwitch, LeadFunnelCard, VisitSource } = await vite.ssrLoadModule('/src/analytics-page.jsx');
    const html = renderToStaticMarkup(createElement(AnalyticsAcquisitionSwitch, { value:'paid', onChange:() => {} }));
    assert.match(html, /aria-label="Источник трафика: Платные"/);
    assert.match(html, /aria-haspopup="listbox"[^>]*aria-expanded="false"/);
    assert.match(html, />Платные<\/span>/);
    assert.doesNotMatch(html, /aria-pressed|role="option"/);
    for (const [value, label] of [['all', 'Все'], ['organic', 'Бесплатные']]) {
      assert.ok(renderToStaticMarkup(createElement(AnalyticsAcquisitionSwitch, { value, onChange:() => {} })).includes(`Источник трафика: ${label}`));
    }
    const card = renderToStaticMarkup(createElement(LeadFunnelCard, { acquisition:'paid', summary:{ lead_people:2, availability_modal_opens:3 } }));
    assert.match(card, /Открытия — платные переходы, заявки — все/);
    assert.match(card, /Фильтр источника действует на открытия окна/);
    for (const source of ['direct', 'yandex.by', 'unknown', '']) {
      const saved = renderToStaticMarkup(createElement(VisitSource, { visit:{ source, landingPath:'/?yclid=123' } }));
      assert.match(saved, /Яндекс\.Директ/);
      assert.doesNotMatch(saved, /Прямой заход|Не определён|>РСЯ</);
    }
    const organic = renderToStaticMarkup(createElement(VisitSource, { visit:{ source:'direct', landingPath:'/?ysclid=123' } }));
    assert.match(organic, />Яндекс</);
  } finally { await vite.close(); }
});

test('в заходах реклама объединяет платные источники и не смешивается с поиском, возвратами и остальным', async () => {
  const vite = await createServer({ configFile:false, plugins:[react()], server:{ middlewareMode:true, hmr:false }, appType:'custom' });
  try {
    const { visitBucket, VisitsSection, VisitSource } = await vite.ssrLoadModule('/src/analytics-page.jsx');
    const ads = [
      { source:'direct', landingPath:'/?yclid=123', returning:true },
      { source:'yandex.by', landingPath:'/?utm_source=yandex&utm_medium=cpc&utm_source_type=search' },
      { source:'rsya', landingPath:'/' },
      { source:'google.com', landingPath:'/?gclid=789' },
      { source:'chatgpt.com', landingPath:'/?utm_medium=paid_social' },
      { source:'direct', landingPath:'/cars/123', acquisition:'paid', returning:true },
      { source:'direct', landingPath:'/?utm_campaign=' + 'x'.repeat(370), acquisition:'rsya' },
    ];
    assert.ok(ads.every(visit => visitBucket(visit) === 'paid'));
    const savedAd=renderToStaticMarkup(createElement(VisitSource,{visit:ads[5]}));
    assert.match(savedAd, />Реклама<\/span>/);
    assert.doesNotMatch(savedAd, /Прямой заход/);
    const free = [
      { source:'direct', landingPath:'/?ysclid=organic' },
      { source:'google.com', landingPath:'/' },
      { source:'chatgpt.com', landingPath:'/' },
      { source:'direct', landingPath:'/', returning:true },
      { source:'direct', landingPath:'/' },
      { source:'example.com', landingPath:'/?utm_campaign=yclid%3Dfake' },
    ];
    assert.deepEqual(free.map(visitBucket), ['yandex','google','chatgpt','returning','rest','rest']);
    const visits=[...ads,...free].map((visit,index)=>({...visit,pageViews:1,createdAt:`2026-10-06T06:${String(index).padStart(2,'0')}:00Z`}));
    const html=renderToStaticMarkup(createElement(VisitsSection,{visits,total:visits.length,unread:0}));
    assert.match(html, />Все<b>13<\/b>/);
    assert.match(html, />Реклама<b>7<\/b>/);
    assert.match(html, />Яндекс<b>1<\/b>/);
    assert.match(html, />Google<b>1<\/b>/);
    assert.match(html, />ChatGPT<b>1<\/b>/);
    assert.match(html, />Вернулись<b>1<\/b>/);
    assert.match(html, />Остальное<b>2<\/b>/);
    assert.ok(html.indexOf('>Реклама<b>') < html.indexOf('>Яндекс<b>'));
  } finally { await vite.close(); }
});

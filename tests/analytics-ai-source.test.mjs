import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createTestServer } from './vite-test-server.mjs';
import { analyticsAiSource } from '../src/analytics-ai-source.js';
import { analyticsEntrySource } from '../src/analytics.js';
import { visitsChart } from '../src/analytics-chart.js';

test('AI needs an identifiable source; ordinary search and ysclid remain unattributed', () => {
  assert.equal(analyticsEntrySource('https://gemini.google.com/app/private-query', 'abcars.by', '/catalog'), 'google-ai');
  assert.equal(analyticsEntrySource('https://alice.yandex.ru/chat/private-query', 'abcars.by', '/?ysclid=123'), 'yandex-ai');
  assert.equal(analyticsEntrySource('', 'abcars.by', '/?UTM_SOURCE=google_ai'), 'google-ai');
  assert.equal(analyticsEntrySource('', 'abcars.by', '/?utm_source=yandex-ai&yclid=123'), 'yandex-direct');
  assert.equal(analyticsAiSource('gemini.google.com', '/?gclid=123'), '');
  for (const referrer of ['https://google.com/search?q=test', 'https://google.com/search?udm=50', 'https://ya.ru/search/?text=test', 'https://gemini.google.com.evil.example/', 'https://example.com/?utm_source=google-ai']) {
    assert.equal(analyticsAiSource(referrer), '', referrer);
  }
  assert.equal(analyticsAiSource('google.com', '/?ysclid=123'), '');
  assert.equal(analyticsAiSource('', '/?utm_content=utm_source%3Dgoogle-ai'), '');
});

test('historical assistant hosts move into exclusive AI buckets without changing totals or paid attribution', async () => {
  const vite = await createTestServer({ configFile:false, plugins:[react()], server:{ middlewareMode:true }, appType:'custom' });
  try {
    const { visitBucket, VisitsSection } = await vite.ssrLoadModule('/src/analytics-page.jsx');
    const visits = ['google.com','gemini.google.com','google-ai','yandex.by','alice.yandex.ru','yandex-ai'].map((source,i) => ({ source, landingPath:'/catalog', pageViews:1, createdAt:`2026-11-02T03:0${i}:00Z` }));
    const ad = { ...visits[1], acquisition:'paid' };
    assert.deepEqual([...visits,ad].map(visitBucket), ['google','google-ai','google-ai','yandex','yandex-ai','yandex-ai','paid']);
    const html = renderToStaticMarkup(createElement(VisitsSection, { visits:[...visits,ad], total:7, unread:0 }));
    for (const [label,count] of [['Все',7],['Google',1],['Google AI',2],['Яндекс',1],['Яндекс AI',2],['Реклама',1]]) assert.ok(html.includes(`>${label}<b>${count}</b>`), label);
    assert.match(html,/Часть AI-переходов остаётся в Google\/Яндексе/);
    const noAi = renderToStaticMarkup(createElement(VisitsSection, { visits:[visits[0]], total:1, unread:0 }));
    assert.ok(noAi.includes('>Google AI<b>0</b>'));
  } finally { await vite.close(); }
});

test('AI graph preserves counts, missing historical values and same-time comparison', () => {
  const { points } = visitsChart([{day:'2026-11-01',visits:7,google:2,google_ai:3,yandex:1,yandex_ai:1,google_ai_to_now:0,yandex_ai_to_now:1},{day:'2026-11-02',visits:1}], '7', '2026-11-02T10:00:00Z');
  assert.equal(points[0].value,7);
  assert.equal(points[0].google_ai,3);
  assert.equal(points[0].googleAiToNow,0);
  assert.equal(points[0].yandexAiToNow,1);
  assert.equal(points[1].google_ai,0);
  assert.equal(points[1].googleAiToNow,null);
});

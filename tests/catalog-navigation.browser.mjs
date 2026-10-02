// Run after the client/SSR builds: node tests/catalog-navigation.browser.mjs.
// Uses isolated fixtures, no database, external requests, screenshots or writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { catalogMetaBoot } from '../server/app-render.mjs';
const russian = process.env.TEST_SITE === 'abdrive';
const buildDirectory = russian ? 'dist-abdrive' : 'dist';
const renderer = await import(new URL(`../${buildDirectory}/ssr/entry-server.js`, import.meta.url));
const renderCatalogApp = russian
  ? (path, search, boot) => renderer.render({ ...boot, path, search, kind:'catalog' })
  : renderer.renderCatalogApp;

const client = new URL(`../${buildDirectory}/client/`, import.meta.url);
const shell = await readFile(new URL('index.html', client), 'utf8');
const entry = shell.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/)[0] + '</script>';
const styles = [...shell.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m => m[0]).join('') + [...shell.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(m => m[0]).join('');
const cars = [['che168-99900001', 'Zeekr', '001'], ['che168-99900002', 'Zeekr', '7X'], ['che168-99900003', 'Toyota', 'Corolla']].map(([id, brand, model]) => ({
  id, brand, model, title:`${brand} ${model} 2024`, year:2024, source:'Che168', origin:'china',
  type:brand === 'Zeekr' ? 'Электромобиль' : 'Бензиновый', chinaPrice:150000, usdPrice:21000, sourcePriceUsd:21000,
  mileage:10000, bodyType:'Седан', image:null, images:[], status:'Карточка доступна', available:true,
  battery:75, range:500, drive:'Задний', _summary:true,
}));
const listing = params => {
  const items = cars.filter(c => (!params.get('brand') || c.brand === params.get('brand')) && (!params.get('model') || c.model === params.get('model')));
  return { items, total:items.length, hasMore:false, refreshedAt:'2026-10-02T10:00:00Z' };
};
const meta = params => ({
  brands:[{ brand:'Zeekr', count:2 }, { brand:'Toyota', count:1 }],
  models:[...new Set(listing(params).items.map(c => c.model))].map(model => ({ model, count:1 })),
  bodyTypes:[{ body_type:'Седан', count:3 }], drives:[{ drive:'Задний', count:3 }], countries:[], availability:{},
});
const modelCatalog = () => ({ model:{ brand:'Zeekr', model:'7X', name:'Zeekr 7X', path:'/catalog/zeekr/7x', brandSlug:'zeekr', modelSlug:'7x', inCatalog:true }, cars:[], total:1, links:{ brandPath:'/catalog/zeekr', sections:[], siblings:[], similar:[], journal:[] } });
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      assert.equal(req.method, 'GET', 'checks must not submit data');
      let value = {};
      if (url.pathname === '/api/catalog/meta') value = meta(url.searchParams);
      else if (url.pathname === '/api/cars') value = listing(url.searchParams);
      else if (url.pathname === '/api/auth/me') value = { user:null };
      else if (url.pathname === '/api/model-catalog') value = modelCatalog();
      else if (url.pathname.startsWith('/api/cars/')) value = { ...cars.find(c => c.id.endsWith(url.pathname.split('/').at(-1))), _summary:false };
      // Exercise navigation while the list and model metadata are still pending.
      await new Promise(r => setTimeout(r, url.pathname === '/api/cars' ? 500 : 250));
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); return;
    }
    if (url.pathname.startsWith('/catalog')) {
      const params = new URLSearchParams(url.pathname.includes('/zeekr') ? 'brand=Zeekr' : '');
      const boot = { catalogPath:url.pathname, catalogSearch:'', catalogSeed:'s3', catalogValue:listing(params),
        catalogFacts:{ total:3, updatedAt:'2026-10-02T10:00:00Z' }, ...catalogMetaBoot(params, meta(params)) };
      const root = renderCatalogApp(url.pathname, url.search, boot);
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root" data-prerender="${url.pathname}">${root}</div><script id="abdrive-data" type="application/json">${JSON.stringify(boot)}</script><script>window.__boot=${JSON.stringify(boot)}</script>${entry}</body></html>`); return;
    }
    if (url.pathname.startsWith('/assets/')) {
      assert.ok(!url.pathname.includes('..'));
      const data = await readFile(new URL('.' + url.pathname, client));
      res.setHeader('content-type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(data); return;
    }
    res.statusCode = 404; res.end();
  } catch (error) { res.statusCode = 500; res.end(error.message); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless:true });
try {
  for (const mobile of [true, false]) {
    const context = await browser.newContext({ viewport:mobile ? { width:390, height:844 } : { width:1280, height:900 }, isMobile:mobile, hasTouch:mobile });
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin !== base || route.request().resourceType() === 'image' || u.pathname.startsWith('/photo')) return route.abort();
      if (u.pathname.startsWith('/api/') && route.request().method() !== 'GET') return route.fulfill({ status:204 });
      return route.continue();
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; let documents = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text()); });
    page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++; });
    await page.goto(base + '/catalog?nocount=1', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => Object.keys(document.querySelector('.favorites-link') || {}).some(k => k.startsWith('__reactProps')));
    await page.evaluate(() => { window.__catalogBefore = document.querySelector('main.catalog'); });
    if (mobile) {
      await page.locator('.brand-model-open').click();
      await page.locator('[role=dialog]').getByText('Zeekr', { exact:true }).click();
      await page.locator('[role=dialog]').getByRole('button', { name:/Показать .* авто/ }).click();
    } else {
      await page.getByRole('button', { name:/Марка:/ }).click();
      await page.getByRole('option', { name:/Zeekr/ }).click();
    }
    await page.waitForURL('**/catalog/zeekr');
    assert.equal(await page.evaluate(() => document.querySelector('main.catalog') === window.__catalogBefore), true, 'brand selection preserves the catalog');
    if (mobile) {
      await page.locator('.brand-model-open').click();
      await page.locator('[role=dialog]').getByText('7X', { exact:true }).click();
    } else await page.locator('.model-quick-chips a').filter({ hasText:'7X' }).click();
    await page.waitForURL('**/catalog/zeekr/7x');
    await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('7X'));
    await page.waitForFunction(() => document.querySelectorAll('.car-row').length === 1);
    assert.equal(await page.evaluate(() => document.querySelector('main.catalog') === window.__catalogBefore), true, 'model selection preserves the catalog');
    assert.equal(await page.locator('.maintenance-page').count(), 0);
    assert.equal(documents, 1, 'filter navigation must not reload the document');
    assert.deepEqual(errors, []);
    // A fresh direct brand visit exercises the same server/client snapshot contract.
    await page.goto(base + '/catalog/zeekr?nocount=1', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => Object.keys(document.querySelector('.favorites-link') || {}).some(k => k.startsWith('__reactProps')));
    await page.waitForFunction(() => document.querySelectorAll('.car-row').length === 2);
    assert.deepEqual(errors, []);
    await page.goto(base + '/catalog?nocount=1', { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => Object.keys(document.querySelector('.favorites-link') || {}).some(k => k.startsWith('__reactProps')));
    await context.route('**/api/cars?**', route => new URL(route.request().url()).searchParams.get('brand') === 'Zeekr'
      ? route.fulfill({ status:503, contentType:'application/json', body:'{}' }) : route.continue());
    if (mobile) {
      await page.locator('.brand-model-open').click();
      await page.locator('[role=dialog]').getByText('Zeekr', { exact:true }).click();
      await page.locator('[role=dialog]').getByRole('button', { name:/Показать .* авто/ }).click();
    } else {
      await page.getByRole('button', { name:/Марка:/ }).click();
      await page.getByRole('option', { name:/Zeekr/ }).click();
    }
    await page.waitForURL('**/catalog/zeekr');
    await page.getByText('Не удалось обновить выдачу. Попробуйте ещё раз.', { exact:true }).waitFor();
    assert.equal(await page.locator('.maintenance-page').count(), 0);
    assert.equal(await page.locator('.car-row').count(), 3, 'API failure retains the previous list');
    assert.deepEqual(errors, []);
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: hydration, Zeekr, 7X, delayed/failed API, preserved catalog, no reload/crash, direct brand URL`);
    await context.close();
  }
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
}

// Build client + SSR first. No production data, external requests or visual checks.
// TEST_BUILD_DIR=runtime/navigation-fix-2026-10-22 node tests/catalog-filter-navigation.browser.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { catalogMetaBoot } from '../server/app-render.mjs';
import { findCatalogLanding, landingApiParams, parseModelLandingPath } from '../src/catalog-landings.js';
import { modelLandingObject } from '../src/model-landing.js';
import { modelSlug } from '../src/model-slug.js';
import { catalogShuffleSeed } from '../src/catalog-url.js';
import { sortCars } from '../src/car-filters.js';

const build = pathToFileURL(resolve(process.env.TEST_BUILD_DIR || 'dist') + '/');
const client = new URL('client/', build);
const { renderCatalogApp } = await import(new URL('ssr/entry-server.js', build));
const shell = await readFile(new URL('index.html', client), 'utf8');
const entry = shell.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/)[0] + '</script>';
const styles = [...shell.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m => m[0]).join('');
const cars = Array.from({ length: 240 }, (_, i) => {
  const brand = i % 3 ? 'Zeekr' : 'Audi';
  const model = brand === 'Audi' ? (i % 2 ? 'A6' : 'A4') : (i % 2 ? '7X' : '001');
  const origin = i % 4 ? 'china' : 'korea';
  return {
    id: `che168-${99900000 + i}`, brand, model, origin, title: `${brand} ${model} 2024`, year: 2024,
    source: origin === 'china' ? 'Che168' : 'Encar', type: i % 3 ? 'Электромобиль' : 'ДВС',
    sourceFuelType: i % 3 ? 'Electric' : 'Gasoline', bodyType: i % 2 ? 'SUV / кроссовер' : 'Седан',
    chinaPrice: 150000, usdPrice: 21000, sourcePriceUsd: 21000, estimatedTotalUsd: 24000 + i * 10, mileage: 10000 + i * 100, drive: 'Задний',
    battery: 75, range: 500 + i, available: true, image: null, images: [], _summary: true,
  };
});
const matching = p => cars.filter(c =>
  (!p.get('brand') || c.brand === p.get('brand')) &&
  (!p.has('model') || p.getAll('model').includes(c.model)) &&
  (!p.get('country') || c.origin === p.get('country')) &&
  (!p.get('type') || c.type === p.get('type')) &&
  (!p.has('bodyType') || p.getAll('bodyType').includes(c.bodyType)) &&
  (!p.get('yearMin') || c.year >= Number(p.get('yearMin'))));
const listing = p => {
  const all = sortCars(matching(p), p.get('sort') || 'default', p.get('seed') || catalogShuffleSeed());
  const offset = Number(p.get('offset') || 0), limit = Number(p.get('limit') || 48);
  return { items: all.slice(offset, offset + limit), total: all.length, hasMore: offset + limit < all.length };
};
const counts = (items, field, name) => [...new Set(items.map(c => c[field]))]
  .map(value => ({ [name]: value, count: items.filter(c => c[field] === value).length }));
const meta = p => ({
  brands: counts(cars, 'brand', 'brand'), models: counts(matching(p), 'model', 'model'),
  bodyTypes: counts(cars, 'bodyType', 'body_type'), drives: [{ drive: 'Задний', count: 240 }], countries: [], availability: {},
});
function modelData(brandSlug, slug) {
  const car = cars.find(c => c.brand.toLowerCase() === brandSlug.toLowerCase() && modelSlug(c.model) === slug);
  assert.ok(car, `unknown fixture model ${brandSlug}/${slug}`);
  return {
    model: { brand: car.brand, model: car.model, name: `${car.brand} ${car.model}`, path: `/catalog/${brandSlug}/${slug}`, brandSlug, modelSlug: slug, inCatalog: true },
    cars: [], total: 80, facts: { total: 80 },
    links: { brandPath: `/catalog/${brandSlug}`, sections: [], siblings: [], similar: [], journal: [] },
  };
}
const requests = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') { res.writeHead(204); res.end(); return; }
      requests.push(url);
      let value = {};
      if (url.pathname === '/api/cars') value = listing(url.searchParams);
      else if (url.pathname === '/api/catalog/meta') value = meta(url.searchParams);
      else if (url.pathname === '/api/auth/me') value = { user: null };
      else if (url.pathname === '/api/model-catalog') value = modelData(url.searchParams.get('brand'), url.searchParams.get('model'));
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); return;
    }
    if (url.pathname.startsWith('/catalog')) {
      const parsed = parseModelLandingPath(url.pathname);
      const data = parsed ? modelData(parsed.brandSlug, parsed.modelSlug) : null;
      const landing = data ? modelLandingObject(data) : findCatalogLanding(url.pathname);
      const params = landingApiParams(landing);
      const metaQuery = new URLSearchParams([...params].filter(([k]) => ['type', 'brand', 'bodyType', 'country'].includes(k)));
      const boot = {
        ...(data ? { modelCatalog: data } : {}), catalogPath: url.pathname, catalogSearch: '', catalogValue: null,
        catalogFacts: { total: 240, updatedAt: '2026-10-22T09:00:00Z' }, ...catalogMetaBoot(metaQuery, meta(metaQuery)),
      };
      const root = renderCatalogApp(url.pathname, url.search, boot);
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root" data-prerender="${url.pathname}">${root}</div><script>window.__boot=${JSON.stringify(boot)}</script>${entry}</body></html>`);
      return;
    }
    if (url.pathname.startsWith('/assets/') && !url.pathname.includes('..')) {
      const data = await readFile(new URL('.' + url.pathname, client));
      res.setHeader('content-type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(data); return;
    }
    res.writeHead(404); res.end();
  } catch (error) { res.writeHead(500); res.end(error.stack); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  for (const mobile of process.env.TEST_MOBILE ? [process.env.TEST_MOBILE === "1"] : [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== base || route.request().resourceType() === 'image') return route.abort();
      return route.continue();
    });
    const errors = [];
    context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const settle = () => page.waitForTimeout(350);
    const ready = async (path = '/catalog') => {
      await page.goto(base + path + (path.includes('?') ? '&' : '?') + 'nocount=1');
      await page.waitForFunction(() => Boolean(history.state?.catalog));
      await settle();
    };
    const state = p => p.evaluate(() => ({ filters: history.state?.catalog?.filters, sort: history.state?.catalog?.sort }));
    const chooseCountry = async () => {
      await page.locator('.heading-country-trigger').click();
      await page.getByRole('menuitemradio', { name: 'Китай', exact: true }).click();
      await page.waitForURL(url => url.searchParams.get('country') === 'china' || url.pathname === '/catalog/china');
    };
    const chooseType = async () => {
      if (mobile) await page.locator('.filter-chip--filters').click();
      else if (!await page.getByRole('button', { name: /Тип двигателя:/ }).count()) await page.getByRole('button', { name: 'Ещё фильтры', exact: true }).click();
      await page.getByRole('button', { name: /Тип двигателя:/ }).first().click();
      await page.getByRole('option', { name: 'Электромобили', exact: true }).click();
      if (mobile) await page.getByRole('button', { name: /Показать .*авто/ }).last().click();
      await page.waitForURL(url => url.pathname === '/catalog/electric');
    };
    const freshState = async href => {
      const fresh = await context.newPage();
      await fresh.goto(new URL(href, base).href);
      await fresh.waitForFunction(() => Boolean(history.state?.catalog));
      const result = await state(fresh); await fresh.close(); return result;
    };
    await ready(); await chooseCountry(); await chooseType(); await settle();
    const forward = new URL(page.url()); forward.searchParams.delete('nocount');
    assert.equal(forward.pathname + forward.search, '/catalog/electric?country=china');
    const first = await state(page);
    assert.equal(first.filters.type, 'Электромобиль'); assert.equal(first.filters.country, 'Китай');
    assert.deepEqual(await freshState(page.url()), first, 'copied URL restores the complete selection');
    const nextHref = await page.locator('a.load-more').getAttribute('href');
    assert.deepEqual(await freshState(nextHref), first, 'next-page URL preserves filters and sort');
    assert.ok(requests.some(url => url.searchParams.get('limit') === '48' && url.searchParams.get('type') === 'Электромобиль' && url.searchParams.get('country') === 'china'));
    await ready(); await chooseType(); await chooseCountry(); await settle();
    const reverse = new URL(page.url()); reverse.searchParams.delete('nocount');
    assert.equal(reverse.pathname + reverse.search, forward.pathname + forward.search);

    await ready('/catalog/zeekr?country=china&yearFrom=2023&priceTo=45000&text=long+range&sort=price_desc');
    const modelLink = page.locator('.model-quick-chips a').filter({ hasText: '7X' });
    const modelHref = await modelLink.getAttribute('href');
    const freshModel = await freshState(modelHref);
    if (mobile) {
      await page.locator('.brand-model-open').click();
      await page.locator('.sheet-option-main').filter({ hasText: '7X' }).click();
    } else await modelLink.click();
    await page.waitForURL(url => url.pathname === '/catalog/zeekr/7x'); await settle();
    assert.deepEqual(await state(page), freshModel, 'model href and ordinary click have identical filters/sort');
    assert.equal(freshModel.filters.country, 'Китай'); assert.equal(freshModel.filters.yearMin, '2023');
    assert.equal(freshModel.filters.priceMax, '45000'); assert.equal(freshModel.filters.text, 'long range');
    assert.equal(freshModel.sort, 'price_desc');
    assert.ok(requests.some(url => url.searchParams.get('model') === '7X' && url.searchParams.get('yearMin') === '2023' && url.searchParams.get('landedMax') === '45000' && url.searchParams.get('text') === 'long range'));
    if (!mobile) {
      await page.goBack(); await page.waitForURL(url => url.pathname === '/catalog/zeekr');
      await page.waitForFunction(() => history.state?.catalog?.filters?.model?.length === 0);
      await page.goForward(); await page.waitForURL(url => url.pathname === '/catalog/zeekr/7x');
      await page.waitForFunction(() => history.state?.catalog?.filters?.model?.[0] === '7X');

      await page.getByRole('button', { name: /Сортировка:/ }).click();
      await page.getByRole('option', { name: 'Дешёвые', exact: true }).click();
      await page.waitForURL(url => url.searchParams.get('sort') === 'price_asc');
      assert.equal((await freshState(page.url())).sort, 'price_asc');
      await page.getByRole('button', { name: /Год от:/ }).first().click();
      await page.getByRole('option', { name: /2022/ }).first().click();
      await page.waitForURL(url => url.searchParams.get('yearFrom') === '2022');
      assert.equal((await freshState(page.url())).filters.yearMin, '2022');
      await page.getByRole('button', { name: /^Модель:/ }).click();
      await page.getByRole('option', { name: /^001/ }).click();
      await page.getByRole('button', { name: /^Модель:/ }).click();
      await page.waitForURL(url => url.pathname === '/catalog/zeekr' && url.searchParams.getAll('model').length === 2);
      assert.deepEqual((await freshState(page.url())).filters.model.sort(), ['001', '7X']);
      assert.equal((await freshState(page.url())).filters.country, 'Китай');
      await page.getByRole('button', { name: 'Сбросить', exact: true }).click();
      await page.waitForURL(url => !url.searchParams.has('country') && !url.searchParams.has('yearFrom'));
      const reset = await freshState(page.url());
      assert.deepEqual(reset.filters.model.sort(), ['001', '7X']);
      assert.equal(reset.filters.country, 'Все страны');
      assert.equal(reset.filters.text, '');

    }
    await ready('/catalog/audi/a4');
    assert.equal((await state(page)).sort, 'default');
    assert.equal(new URL(page.url()).searchParams.has('sort'), false);
    const displayedIds = () => page.locator('main.catalog [data-car-id]').evaluateAll(nodes => nodes.map(node => node.dataset.carId));
    for (const [sort, label] of [
      ['price_asc', 'Дешёвые'], ['price_desc', 'Дорогие'], ['newest', 'Новые объявления'],
      ['mileage_asc', 'С наименьшим пробегом'], ['range_desc', 'С наибольшим запасом хода'],
      ['year_desc', 'Новые по году'], ['year_asc', 'Старые по году'], ['default', 'По умолчанию'],
    ]) {
      await page.getByRole('button', { name: /Сортировка:/ }).click();
      const listingResponse = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/cars' && url.searchParams.get('brand') === 'Audi'
          && url.searchParams.get('model') === 'A4' && url.searchParams.get('sort') === sort;
      });
      await page.getByRole('option', { name: label, exact: true }).click();
      await page.waitForURL(url => sort === 'default' ? !url.searchParams.has('sort') : url.searchParams.get('sort') === sort);
      await listingResponse; await settle();
      const before = await displayedIds();
      assert.ok(before.length > 0, sort);
      await page.reload();
      await page.waitForFunction(expected => history.state?.catalog?.sort === expected && document.querySelectorAll('main.catalog [data-car-id]').length > 0, sort);
      await settle();
      assert.equal((await state(page)).sort, sort);
      assert.deepEqual(await displayedIds(), before, `${sort}: reload preserves the vehicle order`);
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${mobile ? 'mobile' : 'desktop'}: filters, pagination, model navigation, all 8 sorts and vehicle order after reload${mobile ? "" : ", back/forward"}`);
    await context.close();
  }
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(r => server.close(r));
}

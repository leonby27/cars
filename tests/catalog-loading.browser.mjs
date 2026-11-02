// Run against a local dev server: TEST_BASE_URL=http://localhost:5174 node tests/catalog-loading.browser.mjs
// Listing responses are fixtures; no catalog records are changed.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.TEST_BASE_URL || 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const car = i => ({
  id: `che168-${99900000 + i}`, brand: 'Kia', model: 'K3', title: `Kia K3 ${2020 + i}`,
  year: 2020 + i, type: 'ДВС', source: 'Che168', origin: 'china', bodyType: 'Седан',
  usdPrice: 15000, sourcePriceUsd: 15000, estimatedTotalUsd: 20000, mileage: 20000,
  drive: 'Передний', available: true, image: null, images: [], _summary: true,
});
let hold = false;
let fail = false;
let empty = false;
const pending = [];
await page.route('**/api/cars?*', async route => {
  const params = new URL(route.request().url()).searchParams;
  const offset = Number(params.get('offset') || 0);
  if (params.get('summary') !== 'only' && hold) await new Promise(resolve => pending.push(resolve));
  try {
    await route.fulfill({ status: fail ? 503 : 200, json: {
      items: empty ? [] : Array.from({ length: 4 }, (_, i) => car(offset + i)),
      total: empty ? 0 : 8, hasMore: !empty && offset === 0,
    } });
  } catch { /* Aborted requests have no response to deliver. */ }
});
const skeletons = page.locator('.results-list .skeleton-card');
const cards = page.locator('.results-list [data-car-id]');
const sort = async label => {
  await page.locator('.sort-custom-select .select-trigger').click();
  await page.getByRole('option', { name: label, exact: true }).click();
};
try {
  await page.goto(`${base}/catalog`);
  await cards.first().waitFor();
  await page.evaluate(() => {
    window.skeletonSeen = false;
    new MutationObserver(() => {
      if (document.querySelector('.results-list .skeleton-card')) window.skeletonSeen = true;
    }).observe(document.querySelector('.results-list'), { childList: true, subtree: true });
  });
  await sort('Дорогие');
  await page.waitForURL('**sort=price_desc');
  await page.waitForFunction(() => !document.querySelector('.results-list').hasAttribute('aria-busy'));
  assert.equal(await page.evaluate(() => window.skeletonSeen), false, 'fast response must not flash skeletons');

  hold = true;
  await sort('Дешёвые');
  await page.waitForFunction(() => document.querySelector('.results-list').getAttribute('aria-busy') === 'true');
  assert.equal(await skeletons.count(), 0, 'old results remain during the short delay');
  assert.equal(await cards.count(), 4);
  await skeletons.first().waitFor();
  assert.equal(await skeletons.count(), 6);
  assert.equal(await cards.count(), 0, 'slow replacement hides old results');
  hold = false; pending.splice(0).forEach(resolve => resolve());
  await cards.first().waitFor();
  assert.equal(await skeletons.count(), 0);

  hold = true;
  await page.locator('.load-more').click();
  await skeletons.first().waitFor();
  assert.equal(await cards.count(), 4, 'loading more preserves current cars');
  hold = false; pending.splice(0).forEach(resolve => resolve());
  await page.waitForFunction(() => document.querySelectorAll('.results-list [data-car-id]').length === 8);
  assert.equal(await skeletons.count(), 0);

  hold = true;
  await sort('Дорогие');
  await skeletons.first().waitFor();
  fail = true; hold = false; pending.splice(0).forEach(resolve => resolve());
  await page.getByText('Не удалось обновить выдачу. Попробуйте ещё раз.', { exact: true }).waitFor();
  assert.equal(await skeletons.count(), 0, 'failure clears skeletons');
  assert.equal(await cards.count(), 8, 'failure restores previous results');

  fail = false;
  await page.getByRole('button', { name: 'Показать карточками', exact: true }).click();
  hold = true;
  await page.locator('.heading-country-trigger').click();
  await page.getByRole('menuitemradio', { name: 'Китай', exact: true }).click();
  await skeletons.first().waitFor();
  assert.equal(await page.locator('.catalog-card-grid .skeleton-card').count(), 6, 'country change shows grid skeletons');
  // Change country again before the first reply: the obsolete request must not leave loading stuck.
  await page.locator('.heading-country-trigger').click();
  await page.getByRole('menuitemradio', { name: 'Корея', exact: true }).click();
  await page.waitForURL('**/catalog/korea**');
  hold = false; pending.splice(0).forEach(resolve => resolve());
  await cards.first().waitFor();
  await page.waitForFunction(() => !document.querySelector('.results-list').hasAttribute('aria-busy'));
  assert.equal(await skeletons.count(), 0);

  empty = true;
  await sort('Дешёвые');
  await page.getByRole('heading', { name: 'Объявления не найдены', exact: true }).waitFor();
  assert.equal(await skeletons.count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: fast responses, delayed replacement, append, failure, country switching, grid, cancellation, empty results; no browser errors');
} finally {
  hold = false; pending.splice(0).forEach(resolve => resolve());
  await browser.close();
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsUpdatesUrl, clearAnalyticsUpdates, navigationViewedSections, sectionFreshCount, watchAnalyticsExit } from '../src/analytics-updates.js';

test('closing analytics persists viewed sections without clearing them on entry or tab switch', async () => {
  const target = new EventTarget();
  const viewed = new Set();
  const requests = [];
  const cleanup = watchAnalyticsExit(() => viewed, target, async (url, options) => {
    requests.push({ url, options });
  });
  target.dispatchEvent(new Event('pagehide'));
  assert.equal(requests.length, 0, 'unloaded analytics must not be marked as seen');
  viewed.add('overview');
  target.dispatchEvent(new Event('visibilitychange'));
  assert.equal(requests.length, 0, 'badges stay visible during the visit');
  viewed.add('vehicle_favorites');
  target.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(requests.map(({ url }) => url), [
    '/api/analytics/updates?viewing=overview',
    '/api/analytics/updates?viewing=vehicle_favorites',
  ]);
  for (const { options } of requests) {
    assert.equal(options.keepalive, true);
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
  }
  cleanup();
  target.dispatchEvent(new Event('pagehide'));
  assert.equal(requests.length, 2, 'cleanup removes the listener without marking anything');
});

test('returning from browser history can persist another visit and network failures are handled', async () => {
  const target = new EventTarget();
  let attempts = 0;
  const cleanup = watchAnalyticsExit(() => ['overview'], target, async () => {
    attempts++;
    throw new Error('offline');
  });
  target.dispatchEvent(new Event('pagehide'));
  target.dispatchEvent(new Event('pageshow'));
  target.dispatchEvent(new Event('pagehide'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 2);
  cleanup();
});

test('catalog unread counts stay hidden while overview and leads keep their badges', () => {
  const updates = { overview:3, vehicles:0, vehicle_cars:5, vehicle_favorites:2, leads:1 };
  assert.equal(sectionFreshCount(updates, 'vehicles'), 0);
  assert.equal(sectionFreshCount(updates, 'overview'), 3);
  assert.equal(sectionFreshCount(updates, 'searches'), 0, 'a section without data shows nothing');
  assert.equal(sectionFreshCount({}, 'vehicles'), 0);
  assert.equal(sectionFreshCount({ vehicles:4 }, 'vehicles'), 0);
  assert.equal(sectionFreshCount(updates, 'leads'), 1);
});


test('reselecting overview clears all non-lead badges and sends one persistent reset', () => {
  const sections = navigationViewedSections('overview', 'overview');
  assert.deepEqual(sections, ['overview', 'vehicles', 'vehicle_cars', 'vehicle_favorites', 'searches', 'customers', 'contact_interest']);
  const updates = { overview:3, page_views:20, vehicles:2, vehicle_cars:5, vehicle_favorites:4, searches:1, customers:2, contact_interest:8, contact_interest_details:{ contact_page_views:8 }, leads:6, cabinet_orders:2 };
  const cleared = clearAnalyticsUpdates(updates, sections);
  assert.equal(updates.page_views, 20, 'original state remains untouched');
  for (const section of sections) assert.equal(cleared[section], 0);
  assert.equal(cleared.page_views, 0);
  assert.deepEqual(cleared.contact_interest_details, {});
  assert.equal(cleared.leads, 6);
  assert.equal(cleared.cabinet_orders, 2);
  const url = new URL(analyticsUpdatesUrl(sections, 'without-quota', 'paid', 'actions'), 'http://localhost');
  assert.deepEqual(url.searchParams.get('viewing').split(','), sections);
  assert.equal(url.searchParams.get('traffic'), 'without-quota');
  assert.equal(url.searchParams.get('acquisition'), 'paid');
  assert.equal(url.searchParams.get('activity'), 'actions');
});

test('entering overview from another section does not reset other badges', () => {
  assert.deepEqual(navigationViewedSections('overview', 'searches'), ['overview']);
  const fromCatalog = navigationViewedSections('overview', 'vehicles');
  assert.deepEqual(fromCatalog, ['overview', 'vehicles', 'vehicle_cars', 'vehicle_favorites']);
  const cleared = clearAnalyticsUpdates({ overview:2, page_views:5, searches:3, leads:4, contact_interest_details:{ contact_phone_views:1 } }, ['overview']);
  assert.equal(cleared.searches, 3);
  assert.equal(cleared.leads, 4);
  assert.deepEqual(cleared.contact_interest_details, { contact_phone_views:1 });
});

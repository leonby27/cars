import test from 'node:test';
import assert from 'node:assert/strict';
import { watchAnalyticsExit } from '../src/analytics-updates.js';

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

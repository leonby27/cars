import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const shell = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const bootstrap = [...shell.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('const retryable'));
const now = Date.UTC(2026, 9, 19, 12);
class Clock extends Date {static now() {return now;}}
for (const [name, source] of [['early bootstrap', bootstrap], ['application', app]]) {
  test(`${name} respects complete numeric and HTTP-date Retry-After`, () => {
    const code = source.match(/const retryPause = [\s\S]*?\n\s*\};/)[0];
    const pause = vm.runInNewContext(code + '\nretryPause', {Date: Clock});
    const response = value => ({headers: new Headers(value === null ? {} : {'Retry-After': value})});
    for (const [value, expected] of [['10',10000], ['120',120000], ['0',0], [new Date(now+90000).toUTCString(),90000], [new Date(now-1000).toUTCString(),0], [null,1400], ['invalid',1400], ['-1',1400]]) {
      assert.equal(pause(response(value), 2), expected, String(value));
    }
  });
}

async function boot(path, rejectFirst = false) {
  const requests = [], pauses = [];
  const context = {location: new URL('https://abcars.by' + path), window: {}, Date: Clock,
    setTimeout: (callback, ms) => {pauses.push(ms); queueMicrotask(callback);},
    fetch: async url => {
      requests.push(url);
      const limited = rejectFirst && requests.length === 1;
      return {ok: !limited, status: limited ? 429 : 200, headers: new Headers(limited ? {'Retry-After': '10'} : {}), json: async () => ({items: [], total: 1})};
    },
  };
  vm.runInNewContext(bootstrap, context);
  await Promise.all(Object.values(context.window.__boot).filter(v => typeof v?.then === 'function'));
  return {requests, pauses};
}

test('all catalog routes skip the 60-car showcase preload', async () => {
  for (const path of ['/catalog','/catalog/','/catalog/byd','/catalog/china','/catalog/korea','/catalog/tesla/model-y','/catalog/under-15000?page=4']) {
    const {requests} = await boot(path);
    assert.ok(requests.includes('/api/cars?limit=1&sort=price_asc&summary=defer'), path);
    assert.ok(!requests.some(url => url.includes('limit=60')), path);
  }
});

test('home and car detail preserve the showcase and detail preload', async () => {
  for (const path of ['/','/cars/kr-123']) {
    const {requests} = await boot(path);
    assert.ok(requests.includes('/api/cars?limit=60&sort=variety'));
    if (path.startsWith('/cars/')) assert.ok(requests.includes('/api/cars/kr-123'));
  }
});

test('early bootstrap waits the full 10 seconds before retrying a 429', async () => {
  const {requests, pauses} = await boot('/catalog/byd', true);
  assert.deepEqual(requests, ['/api/cars?limit=1&sort=price_asc&summary=defer', '/api/cars?limit=1&sort=price_asc&summary=defer']);
  assert.deepEqual(pauses, [10000]);
});

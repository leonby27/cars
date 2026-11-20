import test from 'node:test';
import assert from 'node:assert/strict';
import { collectChe168ListPage, collectChe168Snapshots, inspectChe168ListResponse, planChe168Snapshot, retryChe168ListPage } from '../scripts/lib/che168-snapshot.mjs';
import { circleFailure } from '../scripts/lib/circle-report.mjs';

const row = (external_id, usd_price, sourceBrand = 'Volvo') => ({ id: `che168-${external_id}`, external_id, usd_price, sourceBrand });
const quote = (infoid, price, currency) => ({ infoid, price, currency });
function snapshot(items, covered = true) {
  const observations = new Map();
  collectChe168ListPage(observations, items, item => ({ externalId: String(item.infoid) }));
  return { quotes: [...observations.values()], covered };
}
const options = { estimate: (_row, price) => price + 5000, newPerBrand: 100, reportingThreshold: 100 };

test('Che168 reconciles existing quotes, invalid currencies, conflicts and absences without detail reads', () => {
  const saved = [
    row('1', '18000'), row('2', '18000'), row('3', '18000'), row('4', '18000'), row('5', '18000'),
    row('6', '18000'), row('7', '18000'), row('8', '18000'), row('9', '18000', 'Unmapped'),
    row('10', '18000'), row('11', '18000'),
  ];
  const brands = new Map([
    ['Volvo', snapshot([
      quote(1, 18000), quote(2, '$19,000.00', 'USD'), quote(3, 16999.99), quote(4, null),
      quote(5, 18000, 'CNY'), quote(6, 17500), quote(6, 17600),
      quote(8, 17000), quote(10, '18–20k'), quote(11, 18500),
    ])],
    ['BMW', snapshot([quote(11, 18550)])],
    ['Unmapped', snapshot([], false)],
  ]);
  const plan = planChe168Snapshot(brands, saved, new Map(saved.map(item => [item.external_id, 'active'])), options);
  assert.deepEqual(plan.updates.map(({ externalId, outcome, reason }) => [externalId, outcome, reason]), [
    ['1', 'seen', undefined], ['2', 'price', undefined], ['3', 'hidden', 'list-price-outlier'],
    ['4', 'hidden', 'invalid-list-price'], ['5', 'hidden', 'invalid-list-price'], ['6', 'seen', 'conflicting-list-prices'],
    ['7', 'hidden', 'absent-from-list'], ['8', 'price', undefined], ['10', 'hidden', 'invalid-list-price'],
    ['11', 'seen', 'conflicting-list-prices'],
  ]);
  assert.equal(plan.updates.find(update => update.externalId === '2').est, 24000);
  assert.equal(plan.updates.find(update => update.externalId === '3').observedUsd, 16999.99);
  assert.equal(plan.counts.unmapped, 1);
  assert.equal(plan.candidates.length, 0);
});

test('Che168 stops at 100 changed prices, counting each ID once across brands', () => {
  const prices = Array.from({ length: 101 }, (_, index) => quote(100 + index, 9000));
  const known = new Map(prices.map(item => [String(item.infoid), 'active']));
  const snapshots = new Map([
    ['Volvo', snapshot(prices.slice(0, 55))], ['BMW', snapshot(prices.slice(54))],
  ]);
  const oldRows = prices.map((item, index) => row(String(item.infoid), index < 98 ? '9100' : index === 98 ? '18000' : '9000', index < 55 ? 'Volvo' : 'BMW'));
  const belowThreshold = planChe168Snapshot(snapshots, oldRows, known, options);
  assert.equal(belowThreshold.counts.priceChanged, 98);
  assert.equal(belowThreshold.counts.hiddenPrice, 1);
  oldRows[99].usd_price = '9100';
  assert.throws(() => planChe168Snapshot(snapshots, oldRows, known, options), {
    code: 'CHE168_REPEATED_LIST_PRICE', diagnostic: { price: 9000, total: 100, ids: prices.slice(0, 20).map(item => String(item.infoid)) },
  });
});

test('Li Auto list diagnostics distinguish HTTP, timeout, page index, counts and malformed rows', () => {
  const response = (items, pageIndex, pageCount, totalCount) => ({
    status: 200, text: `20:${JSON.stringify({ ssrCars: items, ssrPageCount: pageCount, ssrTotalCount: totalCount, ssrPageIndex: pageIndex })}`,
  });
  assert.match(inspectChe168ListResponse({ status: 0, timedOut: true }, 168).error, /тайм-аут/);
  assert.equal(inspectChe168ListResponse({ status: 429 }, 168).error, 'HTTP 429');
  assert.match(inspectChe168ListResponse({ status: 200, text: '<html>' }, 168).error, /нет разбираемого списка/);
  assert.match(inspectChe168ListResponse(response([quote(42, 9000)], 1, 168, 4009), 168).error, /номер страницы 1/);
  assert.match(inspectChe168ListResponse(response([quote(42, 9000)], 169, 168, 4009), 169).error, /некорректные счётчики/);
  assert.match(inspectChe168ListResponse(response([], 168, 168, 4009), 168).error, /пустая страница/);
  assert.match(inspectChe168ListResponse(response([quote(0, 9000)], 168, 168, 4009), 168).error, /некорректный ID/);
  assert.equal(inspectChe168ListResponse(response([quote(42, 9000)], 168, 168, 4009), 168).payload.items.length, 1);
});

test('hidden Che168 IDs are import candidates with a fresh quote, under the existing per-brand cap', () => {
  const brands = new Map([['Volvo', snapshot([quote(1, 21000), quote(2, 12000), quote(3, null), quote(4, 15000)])]]);
  const known = new Map([['1', 'skipped'], ['4', 'active']]);
  const plan = planChe168Snapshot(brands, [row('4', '15000')], known, { ...options, newPerBrand: 1 });
  assert.deepEqual(plan.candidates.map(({ externalId, returning, queued }) => [externalId, returning, queued]), [
    ['1', true, true], ['2', false, false],
  ]);
});

test('a failed page gets two attempts, two after five minutes, and one after fifteen minutes', async () => {
  const pauses = [], notices = [];
  let calls = 0;
  const deps = {
    read: async () => { calls++; return { payload: null, error: `HTTP ${calls === 5 ? 429 : 502}` }; },
    pause: async ms => pauses.push([calls, ms]),
    stopped: () => false,
    retry: ({ attempt }) => notices.push(attempt),
  };
  const result = await retryChe168ListPage(deps);
  assert.equal(calls, 5);
  assert.deepEqual(pauses, [[2, 300000], [4, 900000]]);
  assert.deepEqual(notices, [2, 3, 4, 5]);
  assert.equal(result.error, 'после 5 попыток: HTTP 429');
  assert.deepEqual(result.history, ['HTTP 502', 'HTTP 502', 'HTTP 502', 'HTTP 502', 'HTTP 429']);
});

test('a successful page retry proceeds without further pauses and a manual stop cancels the next attempt', async () => {
  let calls = 0;
  const success = await retryChe168ListPage({
    read: async () => ++calls === 1 ? { error: 'те же ID, что на странице 1' } : { payload: 'correct page' },
    pause: () => assert.fail('success should not wait'),
    stopped: () => false,
    retry: () => {},
  });
  assert.equal(success.payload, 'correct page');
  let stopped = false;
  calls = 0;
  await assert.rejects(retryChe168ListPage({
    read: async () => { calls++; return { error: 'HTTP 503' }; },
    pause: async () => { stopped = true; },
    stopped: () => stopped,
    retry: () => {},
  }), { code: 'ABCARS_STOPPED' });
  assert.equal(calls, 2);
});

test('a brand with an exhausted page is omitted, the next brand is saved, and the report names the failure', async () => {
  const brands = [{ brand: 'Volvo' }, { brand: 'BMW' }, { brand: 'Audi' }];
  const saved = new Map(), failures = new Map(), reads = [];
  const deps = {
    brands, snapshots: saved, failures, stopped: () => false,
    async readBrand({ brand }) {
      reads.push(brand);
      return brand === 'BMW'
        ? { ok: false, why: 'страница 40: после 5 попыток: HTTP 503', history: ['HTTP 503'], quotes: ['partial'] }
        : { ok: true, quotes: ['complete'] };
    },
    async saveBrand(brand, result) { assert.equal(result.quotes[0], 'complete'); },
    async saveFailure(brand, failure) { assert.equal(brand, 'BMW'); assert.equal(failure.exhausted, true); },
  };
  await collectChe168Snapshots(deps);
  await collectChe168Snapshots(deps);
  assert.deepEqual(reads, ['Volvo', 'BMW', 'Audi']);
  assert.deepEqual([...saved.keys()], ['Volvo', 'Audi']);
  assert.equal(failures.get('BMW').reason, 'страница 40: после 5 попыток: HTTP 503');
  const telegram = circleFailure('che', Error('код 1'), {
    report: { failureCode: 'CHE168_SKIPPED_BRANDS', note: 'Che168: не завершён обход марок (1)',
      skippedBrands: ['BMW'], errors: [{ brand: 'BMW', error: failures.get('BMW').reason }] },
    cursor: { startedAt: '2026-11-20T04:00:00Z' },
  });
  assert.match(telegram, /Пропущены марки: BMW/);
  assert.match(telegram, /BMW: страница 40: после 5 попыток: HTTP 503/);
  assert.doesNotMatch(telegram, /Продолжить/);
});

test('an interrupted attempt is discarded before applying its observations', async () => {
  let stopped = false;
  await assert.rejects(collectChe168Snapshots({
    brands: [{ brand: 'Volvo' }], snapshots: new Map(), failures: new Map(),
    stopped: () => stopped,
    readBrand: async () => { stopped = true; return { ok: true }; },
    saveBrand: () => assert.fail('interrupted result written'),
    saveFailure: () => assert.fail('manual stop counted as a source failure'),
  }), { code: 'ABCARS_STOPPED' });
});

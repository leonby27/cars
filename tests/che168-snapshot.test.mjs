import test from 'node:test';
import assert from 'node:assert/strict';
import { collectChe168ListPage, collectChe168Snapshots, planChe168Snapshot } from '../scripts/lib/che168-snapshot.mjs';
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

test('Che168 stops at ten changed prices converging across brands, counting each ID once', () => {
  const prices = Array.from({ length: 11 }, (_, index) => quote(100 + index, 9000));
  const known = new Map(prices.map(item => [String(item.infoid), 'active']));
  const snapshots = new Map([
    ['Volvo', snapshot(prices.slice(0, 6))], ['BMW', snapshot(prices.slice(5))],
  ]);
  const oldRows = prices.map((item, index) => row(String(item.infoid), index < 9 ? '9100' : '9000', index < 6 ? 'Volvo' : 'BMW'));
  assert.equal(planChe168Snapshot(snapshots, oldRows, known, options).counts.priceChanged, 9);
  oldRows[9].usd_price = '18000';
  assert.throws(() => planChe168Snapshot(snapshots, oldRows, known, options), {
    code: 'CHE168_REPEATED_LIST_PRICE', diagnostic: { price: 9000, total: 10, ids: prices.slice(0, 10).map(item => String(item.infoid)) },
  });
});

test('hidden Che168 IDs are import candidates with a fresh quote, under the existing per-brand cap', () => {
  const brands = new Map([['Volvo', snapshot([quote(1, 21000), quote(2, 12000), quote(3, null), quote(4, 15000)])]]);
  const known = new Map([['1', 'skipped'], ['4', 'active']]);
  const plan = planChe168Snapshot(brands, [row('4', '15000')], known, { ...options, newPerBrand: 1 });
  assert.deepEqual(plan.candidates.map(({ externalId, returning, queued }) => [externalId, returning, queued]), [
    ['1', true, true], ['2', false, false],
  ]);
});

test('a broken brand restarts at page one once; a second failure survives resume and reports the reason', async () => {
  const brands = [{ brand: 'Volvo' }, { brand: 'BMW' }, { brand: 'Audi' }];
  const saved = new Map(), failures = new Map(), reads = [], notices = [];
  const deps = {
    brands, snapshots: saved, failures, stopped: () => false,
    async readBrand({ brand }) {
      reads.push(brand);
      return brand === 'BMW' ? { ok: false, why: 'страница 40', quotes: ['partial'] } : { ok: true, quotes: ['complete'] };
    },
    async saveBrand(brand, result) { assert.equal(result.quotes[0], 'complete'); },
    async saveFailure(brand, failure) { assert.equal(brand, 'BMW'); assert.equal(failure.reason, 'страница 40'); },
    retry: (brand, reason) => notices.push([brand, reason]),
  };
  const expected = { code: 'CHE168_BRAND_WALK_FAILED', diagnostic: { brand: 'BMW', attempts: 2, reason: 'страница 40' } };
  await assert.rejects(collectChe168Snapshots(deps), expected);
  await assert.rejects(collectChe168Snapshots(deps), expected);
  assert.deepEqual(reads, ['Volvo', 'BMW', 'BMW']);
  assert.deepEqual([...saved.keys()], ['Volvo']);
  assert.deepEqual(notices, [['BMW', 'страница 40']]);
  const telegram = circleFailure('che', Error('код 1'), {
    report: { failureCode: expected.code, note: 'Che168: два сбоя обхода марки BMW. страница 40' },
    cursor: { startedAt: '2026-11-20T04:00:00Z' },
  });
  assert.match(telegram, /Причина: Che168: два сбоя обхода марки BMW\. страница 40/);
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
    retry: () => assert.fail('interrupted brand retried'),
  }), { code: 'ABCARS_STOPPED' });
});

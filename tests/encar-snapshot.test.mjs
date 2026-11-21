import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EncarClient } from '../scripts/lib/encar-client.mjs';
import { createEncarImportIdentity } from '../scripts/lib/encar-import-identity.mjs';
import { encarCandidate } from '../scripts/lib/encar-parser.mjs';
import { runEncarRefresh } from '../scripts/lib/encar-refresh.mjs';

test('a fresh snapshot reconciles only complete brands and opens only returning cards', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'encar-list-snapshot-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const row = (id, brand = 'Kia', status = 'active') => ({ id: `encar-${id}`, external_id: id, brand, status, price_cny: 20_000_000 });
  const rows = ['1', '2', '3', '4', '5', '7'].map(id => row(id));
  rows.push(row('8', 'Kia', 'skipped'), row('9', 'Hyundai'), row('10', 'Kia', 'unavailable'));
  const attempts = [], reads = [], saved = [];
  let updated, waited = 0;
  const db = { query: async sql => {
    if (sql.startsWith('SELECT')) return { rows };
    assert.fail(sql);
  } };
  const client = {
    requests: 0,
    walk: async ({ brands: [brand], onItem, verifyCoverage }) => {
      assert.equal(verifyCoverage, true);
      attempts.push([brand, waited]);
      if (brand === 'Hyundai') {
        onItem({ externalId: '99', priceMan: 1000 });
        return { pages: 1, broken: 1, errors: [{ error: 'truncated page' }] };
      }
      for (const [externalId, priceMan] of [['1', 2000], ['2', 2135], ['3', 1864], ['4', null], ['5', 1950], ['5', 1975], ['10', 2500], ['11', 1800]]) {
        onItem({ externalId, priceMan });
      }
      return { pages: 1 };
    },
    car: async (externalId, { skipDuplicate }) => {
      reads.push(externalId);
      assert.equal(await skipDuplicate(701), false);
      return { status: 200, detail: { advertisement: { status: 'ADVERTISE' } }, car: { externalId, sourceVehicleId: 701 } };
    },
  };
  const options = {
    client, db, brands: ['Hyundai', 'Kia'], usdPerKrw: 0.0007, listSnapshot: true,
    applySnapshot: async updates => { updated = updates; }, wait: async ms => { waited += ms; },
    upsert: async (car, settings) => saved.push([car.externalId, settings.resetPriceBaseline]),
    checkpointPath: path.join(root, 'checkpoint.json'), reportPath: path.join(root, 'report.json'), discoveriesPath: path.join(root, 'discoveries.json'),
  };
  const report = await runEncarRefresh(options);
  assert.deepEqual(attempts.map(([, elapsed]) => elapsed), [0, 0, 300_000, 300_000, 1_200_000, 1_200_000]);
  assert.deepEqual(updated.map(({ externalId, outcome, reason }) => [externalId, outcome, reason]), [
    ['1', 'seen', 'present-in-list'], ['2', 'price', 'price-from-list'], ['3', 'hidden', 'list-price-outlier'],
    ['4', 'hidden', 'invalid-list-price'], ['5', 'seen', 'conflicting-list-prices'],
    ['7', 'sold', 'absent-from-list'], ['8', 'sold', 'absent-from-list'],
  ]);
  assert.equal(updated.find(row => row.externalId === '2').won, 21_350_000);
  assert.deepEqual(reads, ['10']);
  assert.deepEqual(saved, [['10', true]]);
  const discoveries = JSON.parse(await readFile(options.discoveriesPath));
  assert.deepEqual(discoveries.items.map(item => item.externalId), ['11']);
  assert.deepEqual(report.skippedBrands, ['Hyundai']);
  assert.equal(report.complete, false);
  assert.equal(report.readyForImport, true);
  assert.equal(report.reactivated, 1);
});

test('repeating a page cannot turn a partial list into authority to remove listings', async () => {
  const item = { Id: '1', Manufacturer: '기아', Year: 202500, FuelType: '가솔린', Price: 2400 };
  const client = new EncarClient({ pace: 0 });
  client.patientList = async () => ({ status: 200, json: { Count: 2, SearchResults: [item] } });
  const report = await client.walk({ brands: ['Kia'], verifyCoverage: true, onItem() {} });
  assert.equal(report.pages, 2);
  assert.equal(report.broken, 1);
  assert.equal(report.errors[0].code, 'ENCAR_LIST_INCOMPLETE');
  assert.equal(encarCandidate({ ...item, Currency: 'USD' }).priceMan, null);
});

test('large brand lists cover all models and prove the split by registration month', async () => {
  const calls = [];
  const client = new EncarClient({ pace: 0 });
  client.modelGroups = async () => assert.fail('brand coverage must not depend on the model facet');
  client.patientList = async (query, offset, count) => {
    const range = query.match(/Year\.range\((\d+)\.\.(\d+)\)/).slice(1).map(Number);
    calls.push([range, offset, count]);
    assert.doesNotMatch(query, /ModelGroup/);
    if (calls.length === 1) return { status: 200, json: { Count: 12_000, SearchResults: [] } };
    if (count === 1) return { status: 200, json: { Count: 2, SearchResults: [{ Id: '10' }] } };
    const [year, id] = range[1] === 202606 ? [202601, '10'] : [202612, '11'];
    return { status: 200, json: { Count: 1, SearchResults: [{ Id: id, Manufacturer: '기아', Year: year, FuelType: '가솔린', Price: 2400 }] } };
  };
  const ids = [];
  const walk = await client.walk({ brands: ['Kia'], yearFrom: 2026, yearTo: 2026, verifyCoverage: true,
    onItem: item => ids.push(item.externalId) });
  assert.deepEqual(calls.map(([range]) => range), [[202600, 202612], [202600, 202606], [202607, 202612], [202600, 202612]]);
  assert.deepEqual(ids, ['10', '11']);
  assert.equal(walk.broken, undefined);
});

test('a verified duplicate never requests history and two workers serialize a new vehicle', async () => {
  const { samples } = JSON.parse(await readFile(new URL('./fixtures/encar-samples.json', import.meta.url)));
  const { detail, listItem } = samples[1];
  const calls = [];
  const client = new EncarClient({ pace: 0, fetcher: async url => {
    calls.push(url);
    assert.match(url, new RegExp(`/vehicle/${listItem.Id}$`));
    return { status: 200, text: async () => JSON.stringify(detail) };
  } });
  const identity = createEncarImportIdentity([{ external_id: String(detail.vehicleId), status: 'active', source_vehicle_id: detail.vehicleId }]);
  const result = await client.car(listItem.Id, { usdPerKrw: 0.0007,
    skipDuplicate: async vehicleId => await identity.reserveDetail(listItem.Id, vehicleId) === null });
  assert.equal(result.duplicate, true);
  assert.equal(calls.length, 1);
  const release = await identity.reserveDetail('200', 1234);
  const otherWorker = identity.reserveDetail('201', 1234);
  assert.equal(identity.claim({ externalId: '200', sourceVehicleId: 1234 }), null);
  release();
  assert.equal(await otherWorker, null);
});

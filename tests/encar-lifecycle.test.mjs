import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EncarClient } from '../scripts/lib/encar-client.mjs';
import { runEncarRefresh, readEncarCheckpoint } from '../scripts/lib/encar-refresh.mjs';
import { upsertEncarCar } from '../scripts/lib/encar-write.mjs';
import { encarImportPlan } from '../scripts/lib/scheduled-circle.mjs';

test('one round handles the observed source states, a DB interruption and an access outage, then resumes without replay or lost history', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'encar-lifecycle-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sample = JSON.parse(await fs.readFile(new URL('./fixtures/encar-samples.json', import.meta.url))).samples[0].detail;
  const rows = new Map(Array.from({ length: 7 }, (_, n) => {
    const id = String(n + 1);
    return [id, { status: id === '7' ? 'unavailable' : 'active', source_payload: { sourceVehicleId: Number(id), owners: 9, claims: 'Сохранённый страховой случай', claimsCount: 1, totalLoss: true } }];
  }));
  let phase = 1;
  const reads = [], writes = [];
  const detail = (id, status = 'ADVERTISE') => ({ ...structuredClone(sample), vehicleId: Number(id), manage: { dummyVehicleId: null }, advertisement: { ...sample.advertisement, status } });
  const failedPage = { cars: { base: {}, detailFlags: null }, pender: { failure: { 'cars/GET_BASE': true }, success: { 'cars/GET_BASE': false }, pending: { 'cars/GET_BASE': false } } };
  const publicPage = id => {
    const state = ['3', '4'].includes(id) ? failedPage : { cars: { base: { ...detail(id, id === '1' ? 'WAIT' : 'SOLD'), queryCarId: id }, detailFlags: { adStatus: id === '1' ? 'wait' : 'soldOut' } } };
    return `<script>__PRELOADED_STATE__ = ${JSON.stringify(state)};</script>`;
  };
  const response = (status, value = '') => ({ status, text: async () => typeof value === 'string' ? value : JSON.stringify(value) });
  const makeClient = () => {
    const client = new EncarClient({ pace: 0, attempts: 1, fetcher: async url => {
      if (url.includes('/search/car/list/')) return phase === 2 ? response(407) : response(200, { Count: 0, iNav: { Nodes: [] }, SearchResults: [] });
      if (url.startsWith('https://fem.encar.com/')) return response(200, phase===2?'verification':publicPage(url.split('/').at(-1)));
      const id = url.match(/\/vehicle\/(?:ev-battery\/)?(\d+)/)?.[1];
      if (/\/readside\/vehicle\/\d+/.test(url)) {
        reads.push(id);
        if (id === '1' || id === '4' || (id === '3' && phase === 3)) return response(404);
        if (id === '2' || id === '3') return response(407);
        return response(200, detail(id));
      }
      return id === '5' ? response(407) : response(200, {});
    } });
    client.walk = async ({ onItem }) => {
      await client.modelGroups('Hyundai');
      onItem({ externalId: '7', priceMan: 1000 });
      return { slices: 1, broken: 0, errors: [] };
    };
    return client;
  };
  const db = { query: async (sql, values) => {
    if (sql.startsWith('SELECT l.id')) return { rows: [...rows].filter(([, row]) => ['active', 'skipped'].includes(row.status)).map(([id, row]) => ({ id, external_id: id, price_cny: 10000000, status: row.status })) };
    if (sql.startsWith('SELECT external_id')) return { rows: [...rows].map(([id, row]) => ({ external_id: id, status: row.status })) };
    if (sql.startsWith('SELECT source_payload')) return { rows: [rows.get(values[0])] };
    if (sql.startsWith('UPDATE listings')) {
      const row = rows.get(values[0]);
      row.status = sql.includes("status='skipped'") ? 'skipped' : 'unavailable';
      row.source_payload.sourceAvailability = JSON.parse(values[1]);
      return { rowCount: 1 };
    }
    assert.fail(`Unexpected query: ${sql}`);
  } };
  const options = { db, brands: ['Hyundai'], yearFrom: 2020, usdPerKrw: 0.0007, concurrency: 1, policyViolation: () => null,
    checkpointPath: path.join(root, 'checkpoint.json'), reportPath: path.join(root, 'report.json'), discoveriesPath: path.join(root, 'discoveries.json'),
    upsert: async car => {
      if (phase === 1 && car.externalId === '6') throw Object.assign(Error('DB disconnected'), { code: 'ECONNREFUSED' });
      return upsertEncarCar(car, db, async saved => { writes.push(saved.externalId); rows.set(saved.externalId, { status: 'active', source_payload: saved }); return saved; });
    },
  };
  await assert.rejects(runEncarRefresh({ ...options, client: makeClient() }), /DB disconnected/);
  assert.equal(rows.get('1').status, 'skipped', 'API 404 cannot turn public WAIT into a sale');
  assert.equal(rows.get('2').status, 'unavailable', 'matching explicit SOLD is a sale');
  assert.equal(rows.get('3').status, 'unavailable', 'missing source data is removed by the owner policy');
  assert.equal(rows.get('4').status, 'unavailable', 'structured absence is unavailable, not a confirmed sale');
  assert.equal(rows.get('1').source_payload.sourceAvailability.reason, 'source-wait');
  assert.equal(rows.get('1').source_payload.sourceAvailability.apiStatus, 404);
  assert.equal(rows.get('2').source_payload.sourceAvailability.reason, 'source-sold');
  assert.equal(rows.get('4').source_payload.sourceAvailability.reason, 'source-unavailable');
  assert.equal(rows.get('3').source_payload.sourceAvailability.reason, 'source-unavailable');
  assert.equal(rows.get('5').source_payload.owners, 9);
  assert.equal(rows.get('5').source_payload.totalLoss, true);
  assert.equal(rows.get('7').status, 'active', 'an already known unavailable ad can return from current source lists');
  let checkpoint = await readEncarCheckpoint(options.checkpointPath);
  assert.deepEqual(checkpoint.pending, ['6']);
  assert.equal(checkpoint.summary.sold, 3);
  assert.equal(checkpoint.summary.unverifiedUnavailable, 2);
  assert.equal(checkpoint.summary.reactivated, 1);
  const previousWrites = [...writes];
  phase = 2;
  reads.length = 0;
  await assert.rejects(runEncarRefresh({ ...options, client: makeClient(), resume: true }), error => error.code === 'ENCAR_UNAVAILABLE');
  assert.deepEqual(reads, []);
  assert.deepEqual(writes, previousWrites);
  checkpoint = await readEncarCheckpoint(options.checkpointPath);
  assert.deepEqual(checkpoint.pending, ['6']);
  assert.equal(checkpoint.summary.attempt.checked, 0);
  phase = 3;
  const report = await runEncarRefresh({ ...options, client: makeClient(), resume: true });
  assert.deepEqual(reads, ['6']);
  assert.equal(report.complete, true);
  assert.equal(report.sold, 3);
  assert.equal(report.skipped, 1);
  assert.equal(report.rewritten, 3);
  assert.equal(report.reactivated, 1);
  assert.equal(report.historyDeferred, 3);
  assert.equal(report.readFailed + report.parseFailed + report.writeFailed, 0);
  assert.equal(rows.get('6').source_payload.claimsCount, 1, 'successful but empty optional history cannot erase an established fact');
  assert.deepEqual((await readEncarCheckpoint(options.checkpointPath)).pending, []);
  const discoveries = JSON.parse(await fs.readFile(options.discoveriesPath));
  assert.equal(encarImportPlan(discoveries, report, Date.parse(report.resumedAt)), null);
});

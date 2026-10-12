import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runEncarRefresh, readEncarCheckpoint } from '../scripts/lib/encar-refresh.mjs';
import { encarImportPlan } from '../scripts/lib/scheduled-circle.mjs';

async function fixture(t, ids = ['same', 'changed', 'missing']) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'encar-refresh-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const queries = [], reads = [], writes = [];
  const client = {
    requests: 0,
    walk: async ({ onItem }) => {
      onItem({ externalId: 'same', priceMan: 1000 });
      onItem({ externalId: 'changed', priceMan: 2000 });
      onItem({ externalId: 'new', priceMan: 1000, manufacturer: '기아' });
      return { slices: 1, broken: 0 };
    },
    car: async id => {
      reads.push(id); client.requests++;
      return { status: 200, car: { externalId: id }, detail: { advertisement: { status: 'ADVERTISE' } } };
    },
  };
  const db = { query: async (sql, values) => {
    queries.push({ sql, values });
    if (sql.startsWith('SELECT l.id')) return { rows: ids.map(id => ({ id, external_id: id, price_cny: 10000000 })) };
    if (sql.startsWith('SELECT external_id')) return { rows: ids.map(external_id => ({ external_id })) };
    return { rows: [], rowCount: 1 };
  } };
  const options = { client, db, upsert: async car => writes.push(car.externalId),
    policyViolation: () => null, canonicalBrand: () => 'Kia', brands: ['Kia'], usdPerKrw: 0.0007, concurrency: 1,
    checkpointPath: path.join(root, 'checkpoint.json'), reportPath: path.join(root, 'report.json'), discoveriesPath: path.join(root, 'discoveries.json'),
  };
  return { options, client, queries, reads, writes };
}

test('completed refresh persists discoveries, success counts and an empty checkpoint', async t => {
  const { options, reads, queries } = await fixture(t);
  const report = await runEncarRefresh(options);
  assert.equal(report.complete, true);
  assert.equal(report.seenSamePrice, 1);
  assert.equal(report.rewritten, 2);
  assert.equal(report.remainingListings, 0);
  assert.deepEqual(reads, ['changed', 'missing']);
  assert.deepEqual(queries[0].values, [['Kia']]);
  const checkpoint = await readEncarCheckpoint(options.checkpointPath);
  assert.equal(checkpoint.phase, 'complete');
  assert.deepEqual(checkpoint.pending, []);
  const discoveries = JSON.parse(await fs.readFile(options.discoveriesPath));
  assert.equal(discoveries.items[0].brand, 'Kia');
  assert.equal(encarImportPlan(discoveries, report, Date.parse(report.startedAt)).args.at(-1), '--limit=1');
});

test('network, parsing and database failures remain queued; resume only retries failures and clears their counters', async t => {
  const { options, client, reads, writes } = await fixture(t, ['changed', 'network', 'parse', 'database', 'sold']);
  client.car = async id => {
    reads.push(id); client.requests++;
    if (id === 'network') return { status: 503, car: null };
    if (id === 'parse') throw Object.assign(Error('Malformed vehicle'), { stage: 'parse', code: 'ENCAR_INVALID_DETAIL' });
    if (id === 'sold') return { status: 404, car: null };
    return { status: 200, car: { externalId: id }, detail: { advertisement: { status: 'ADVERTISE' } } };
  };
  options.upsert = async car => {
    if (car.externalId === 'database') throw Object.assign(Error('invalid input syntax for integer'), { code: '22P02' });
    writes.push(car.externalId);
  };
  const report = await runEncarRefresh(options);
  assert.deepEqual([report.readFailed, report.parseFailed, report.writeFailed, report.unknown, report.remainingListings], [1, 1, 1, 3, 3]);
  assert.deepEqual(report.responseStatuses, { 503: 1 });
  assert.equal(report.rewritten, 1);
  assert.equal(report.sold, 1);
  assert.equal(report.complete, false);
  assert.throws(() => encarImportPlan({ generatedAt: report.finishedAt, items: [{}] }, report, Date.parse(report.startedAt)));
  const saved = await readEncarCheckpoint(options.checkpointPath);
  assert.deepEqual(saved.pending, ['network', 'parse', 'database']);
  reads.length = 0;
  client.requests = 0;
  client.walk = () => assert.fail('resume must not repeat the list walk');
  client.car = async id => { reads.push(id); client.requests++; return { status: 200, car: { externalId: id }, detail: { advertisement: { status: 'ADVERTISE' } } }; };
  options.upsert = async car => writes.push(car.externalId);
  const resumed = await runEncarRefresh({ ...options, resume: true });
  assert.deepEqual(reads, ['network', 'parse', 'database']);
  assert.equal(resumed.complete, true);
  assert.deepEqual([resumed.readFailed, resumed.parseFailed, resumed.writeFailed, resumed.unknown, resumed.remainingListings], [0, 0, 0, 0, 0]);
  assert.equal(resumed.rewritten, 4);
  assert.equal(resumed.sold, 1);
  assert.equal(resumed.requests, 8);
});

test('time/stop and detail limits preserve unattempted cards and prevent false completion', async t => {
  const { options, reads, client } = await fixture(t, ['missing1', 'missing2', 'missing3']);
  const report = await runEncarRefresh({ ...options, detailLimit: 1 });
  assert.equal(report.complete, false);
  assert.equal(report.unknown, 0);
  assert.equal(report.remainingListings, 2);
  assert.deepEqual(reads, ['missing1']);
  assert.deepEqual((await readEncarCheckpoint(options.checkpointPath)).pending, ['missing2', 'missing3']);
  reads.length = 0;
  client.requests = 0;
  const resumed = await runEncarRefresh({ ...options, resume: true, stop: () => reads.length > 0 });
  assert.equal(resumed.complete, false);
  assert.equal(resumed.remainingListings, 1);
  assert.deepEqual(reads, ['missing2']);
});

test('empty/malformed successful detail responses are not persisted as sold', async t => {
  const { options, queries, client } = await fixture(t, ['missing']);
  client.car = async () => ({ status: 200, car: null, detail: null });
  const report = await runEncarRefresh(options);
  assert.equal(report.parseFailed, 1);
  assert.equal(report.sold, 0);
  assert.equal(queries.filter(query => query.sql.includes("status='unavailable'")).length, 0);
});

test('incomplete lists cannot be resumed as complete or authorize import', async t => {
  const { options, client } = await fixture(t, []);
  client.walk = async () => ({ broken: 1, errors: [{ status: 400 }] });
  const report = await runEncarRefresh(options);
  assert.equal(report.complete, false);
  await assert.rejects(runEncarRefresh({ ...options, resume: true }), /списки|Списки/);
  assert.throws(() => encarImportPlan({ generatedAt: report.finishedAt, items: [{}] }, report, Date.parse(report.startedAt)));
});

test('resume rejects incompatible settings and never treats a failure before queue creation as complete', async t => {
  const { options } = await fixture(t);
  await assert.rejects(runEncarRefresh({ ...options, resume: true }), /совместимой/);
  options.db.query = async () => { throw Error('database unavailable'); };
  await assert.rejects(runEncarRefresh(options), /database unavailable/);
  const checkpoint = await readEncarCheckpoint(options.checkpointPath);
  assert.equal(checkpoint.summary.complete, false);
  await assert.rejects(runEncarRefresh({ ...options, resume: true }), /списки|Списки/);
  await assert.rejects(runEncarRefresh({ ...options, resume: true, dryRun: true }), /совместимой/);
});

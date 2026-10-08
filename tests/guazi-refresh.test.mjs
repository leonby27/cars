import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGuaziRefresh, refreshPaths } from '../scripts/lib/guazi-refresh.mjs';
import { makeSegments } from '../scripts/lib/guazi-core.mjs';
import { readJson } from '../scripts/lib/guazi-pilot-io.mjs';
import { readSessionCard } from '../scripts/lib/guazi-pilot-browser.mjs';
import { mergeRefreshedGuazi, createGuaziRefreshStore } from '../scripts/lib/guazi-refresh-store.mjs';
import { isGuaziSoldCard } from '../scripts/lib/guazi-availability.mjs';

const config = { ...JSON.parse(await fs.readFile(new URL('../config/guazi-core.json', import.meta.url))), priceBasis: 'FOB' };
const { filters } = JSON.parse(await fs.readFile(new URL('../config/refresh-order.json', import.meta.url)));
const segment = makeSegments([{ id: '102715', name: 'Tesla' }], filters, config)[0];
const policy = { config, segments: [segment] };
const a = 'y2ud7mtru4', b = 'bbbbbbbbbb', c = 'cccccccccc';
const url = id => `https://en.guazi.com/products/tesla-${id}.html`;
const snapshotRow = id => ({ id: `guazi-${id}`, externalId: id, sourceUrl: url(id), brand: 'Tesla' });
const listing = id => ({ productId: id, seoUri: `tesla-${id}.html`, brandId: 102715, fuelTypeName: 'BEV', licenseDate: '20240901' });
const capture = (id, price = '$28,748') => ({ url: url(id), observedAt: new Date().toISOString(), rawData: {
  productId: id, clueId: 172877314, makeNameEn: 'Tesla', modelName: 'Model Y', title: 'Tesla Model Y',
  vehicleDetails: [{ key: 'modelYear', value: '2024' }, { key: 'fuel', value: 'BEV' }, { key: 'regDate', value: '2024.09' }, { key: 'mileage', value: '60300' }],
  images: [{ imgUrl: 'https://global-image-pub.guazistatic-global.com/car.jpg' }], prices: [{ price, enName: 'Horgos, China' }],
} });
const missing = id => ({ unavailable: true, httpStatus: 404, url: url(id), observedAt: new Date().toISOString() });
const sold = id => { const value = capture(id); value.rawData.displayStatus = 1; return value; };
const blocked = () => Object.assign(Error('Source access check'), { code: 'SOURCE_BLOCKED' });

async function fixture(t, { active = [a], listed = [a, b] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'guazi-refresh-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rows = new Map(active.map(id => [id, { ...snapshotRow(id), status: 'active', fobPriceUsd: 28748 }]));
  const f = { root, rows, listed, reads: [], searches: [], writes: [], removals: [], messages: [], finalized: 0, releases: 0, closed: 0, snapshots: 0, skips: [], audits: [] };
  f.store = {
    target: 'test-only', acquire: async () => async () => { f.releases++; },
    snapshot: async () => { f.snapshots++; return [...rows.values()].filter(x => ['active','skipped'].includes(x.status)); },
    upsert: async car => { const previous = rows.get(car.externalId); f.writes.push(car); rows.set(car.externalId, { ...snapshotRow(car.externalId), status: 'active', fobPriceUsd: car.fobPriceUsd }); return { action: !previous ? 'added' : previous.status === 'skipped' ? 'reactivated' : 'updated', quoteChanged: !!previous && previous.fobPriceUsd !== car.fobPriceUsd, priceChanged: !!previous && Math.abs(previous.fobPriceUsd-car.fobPriceUsd)>=100 }; },
    countActive: async brands => [...rows.values()].filter(row => row.status === 'active' && (!brands || brands.includes(row.brand))).length,
    markUnavailable: async (row, evidence) => { f.removals.push({ row, evidence }); if (rows.has(row.externalId)) rows.get(row.externalId).status = 'unavailable'; },
    markSkipped: async (row, details) => { f.skips.push({ row, details }); if(rows.has(row.externalId)) rows.get(row.externalId).status='skipped'; },
    audit: async input => { f.audits.push(input); const actual = await f.store.countActive(); assert.equal(actual,input.expectedRemaining); return { active:actual,invalid:0,mismatches:0 }; },
    finalize: async () => { f.finalized++; },
  };
  f.detail = async id => f.listed.includes(id) ? capture(id) : missing(id);
  f.search = async body => {
    const ids = body.exportPolicyEligible === 1 ? f.listed : [];
    return { data: { totalCount: ids.length, list: body.clientScene === 'count' ? [] : ids.map(listing) } };
  };
  f.deps = {
    store: f.store, policy, notify: async text => f.messages.push(text), log: () => {},
    browserFactory: async options => {
      assert.equal(options.publicOnly, true); assert.equal(options.authState, undefined); assert.equal(options.requestInterval, 750);
      return { publicBootstrap: async () => {}, publicSearch: async body => { f.searches.push(body); return f.search(body); },
        worker: async () => ({ card: async (href, options) => { assert.equal(options.allowMissing, true); const id = href.match(/-([a-z0-9]{10})\.html/)[1]; f.reads.push(id); return f.detail(id); } }),
        close: async () => { f.closed++; },
      };
    },
  };
  f.run = (newCircle = true, signal) => runGuaziRefresh({ root, newCircle, signal }, f.deps);
  f.state = () => readJson(refreshPaths(root).state);
  return f;
}

test('new round refreshes existing FOB, adds discoveries, and removes only after absent list plus two missing pages', async t => {
  const f = await fixture(t, { active: [a, c] });
  const state = await f.run();
  assert.equal(state.status, 'complete');
  assert.deepEqual(state.counts, { checked: 3, updated: 1, added: 1, unavailable: 1, review: 0, skipped: 0, rejected: 0 });
  assert.equal(f.reads.filter(id => id === c).length, 2);
  assert.equal(f.removals[0].evidence.observations.length, 2);
  assert.ok(f.writes.every(car => car.source === 'Guazi' && car.fobPort === 'Horgos' && car.fobPriceUsd === 28748));
  assert.equal(f.finalized, 1); assert.equal(f.releases, 1); assert.equal(f.closed, 1);
  assert.equal(f.messages.length, 1);
  assert.match(f.messages[0], /^🏁 Каталог Guazi обновлён целиком/);
  assert.match(f.messages[0], /В каталоге Guazi сейчас: 2/);
  assert.equal(state.summary.added, 1);
  assert.equal(state.summary.remaining, 2);
  await assert.rejects(fs.stat(refreshPaths(f.root).lock), { code: 'ENOENT' });
});

test('next round actually rereads lists and cards; completed round cannot be resumed', async t => {
  const f = await fixture(t, { listed: [a] });
  const first = await f.run(); const n = f.searches.length;
  await assert.rejects(f.run(false), /Незавершённого/);
  f.detail = async id => capture(id, '$29,900');
  const second = await f.run();
  assert.notEqual(second.run, first.run); assert.equal(f.reads.length, 2); assert.equal(f.searches.length, n * 2);
  assert.equal(f.writes.at(-1).fobPriceUsd, 29900); assert.equal(f.snapshots, 2);
  assert.equal(f.messages.length, 2);
  assert.match(f.messages.at(-1), /изменилось цен: 1/);
});

test('blocked card saves committed checks; resume keeps initial snapshot and skips only those successes', async t => {
  const f = await fixture(t);
  f.detail = async id => { if (id === b) throw blocked(); return capture(id); };
  await assert.rejects(f.run(), { code: 'SOURCE_BLOCKED' });
  const state = await f.state(); assert.equal(state.status, 'blocked'); assert.equal(state.counts.updated, 1);
  await assert.rejects(f.run(), /Предыдущ|Прошлый/);
  assert.equal((await f.state()).run, state.run);
  f.detail = async id => capture(id);
  const resumed = await f.run(false);
  assert.equal(resumed.status, 'complete'); assert.equal(resumed.run, state.run); assert.equal(f.snapshots, 1);
  assert.equal(f.reads.filter(id => id === a).length, 1); assert.equal(f.reads.filter(id => id === b).length, 2);
  assert.equal(f.messages.length, 2);
  assert.match(f.messages[0], /Источник|Source access check/);
  assert.match(f.messages[0], /Последняя марка: Tesla/);
  assert.match(f.messages[0], /Сохранено проверок: 1/);
  assert.match(f.messages.at(-1), /За этот круг новых заведено: 1/);
});

test('catalog absence is retried automatically then skipped without a false sale or price write', async t => {
  const f = await fixture(t, { listed: [] });
  f.detail = async id => capture(id);
  const state = await f.run();
  assert.equal(state.counts.skipped, 1); assert.equal(f.removals.length, 0); assert.equal(f.rows.get(a).status, 'skipped');
  assert.equal(f.writes.length, 0); assert.equal(f.reads.length,2);
});

test('explicit sold status removes existing cars in one read, even with a stale listing and FOB price', async t => {
  for (const listed of [[], [a]]) {
    const f = await fixture(t, { listed }); f.detail = async id => sold(id);
    const state = await f.run();
    assert.equal(state.counts.unavailable, 1); assert.equal(state.counts.review, 0);
    assert.equal(f.rows.get(a).status, 'unavailable'); assert.equal(f.writes.length, 0);
    assert.deepEqual(f.reads, [a]);
    assert.deepEqual(f.removals[0].evidence.observations[0].rawData, { productId: a, displayStatus: 1 });
  }
});

test('sold new discoveries are rejected without inserting or removing a database row', async t => {
  const f = await fixture(t, { active: [], listed: [b] }); f.detail = async id => sold(id);
  const state = await f.run();
  assert.equal(state.counts.rejected, 1); assert.equal(state.counts.unavailable, 0);
  assert.equal(f.writes.length, 0); assert.equal(f.removals.length, 0); assert.deepEqual(f.reads, [b]);
});

test('under offer, unknown status and hidden price alone never mean sold', async t => {
  for (const displayStatus of [undefined, null, 0, 2, 3, 99, '1', true]) {
    const f = await fixture(t, { listed: [] });
    f.detail = async id => { const value = capture(id); Object.assign(value.rawData, { displayStatus, showPrice: 0 }); return value; };
    assert.equal((await f.run()).counts.skipped, 1);
    assert.equal(f.removals.length, 0); assert.equal(f.rows.get(a).status, 'skipped');
  }
});

test('sold status from a second missing-page read is recognized; failed removal remains resumable', async t => {
  const f = await fixture(t, { listed: [] }); let calls = 0;
  f.detail = async id => ++calls === 1 ? missing(id) : sold(id);
  const remove = f.store.markUnavailable;
  f.store.markUnavailable = async () => { throw Error('database failed'); };
  await assert.rejects(f.run(), /database failed/);
  assert.equal((await f.state()).counts.checked, 0); assert.equal(f.rows.get(a).status, 'active');
  f.store.markUnavailable = remove;
  assert.equal((await f.run(false)).counts.unavailable, 1);
  assert.equal(f.writes.length, 0); assert.equal(f.removals.length, 1);
});

test('sold recognition uses the exact product identity, never another car or a numeric coercion', () => {
  assert.equal(isGuaziSoldCard(sold(a), a), true);
  assert.equal(isGuaziSoldCard(sold(a), b), false);
  assert.equal(isGuaziSoldCard({ ...sold(a), url: url(b) }), false);
  assert.equal(isGuaziSoldCard({ ...sold(a), url: 'https://example.com/products/car-y2ud7mtru4.html' }), false);
  assert.equal(isGuaziSoldCard({ ...sold(a), rawData: { productId: a, displayStatus: '1' } }), false);
  assert.equal(isGuaziSoldCard(missing(a)), false);
});

test('missing page for a listed car never removes it; incomplete discovery performs no writes', async t => {
  const f = await fixture(t, { listed: [a] });
  f.detail = async id => missing(id);
  assert.equal((await f.run()).counts.skipped, 1); assert.equal(f.removals.length, 0);
  f.search = async body => { if (body.clientScene !== 'count') throw blocked(); return { data: { totalCount: 1 } }; };
  await assert.rejects(f.run(), { code: 'SOURCE_BLOCKED' });
  assert.equal(f.writes.length, 0); assert.equal(f.removals.length, 0); assert.equal((await f.state()).status, 'blocked');
});

test('failed second missing-page check preserves the vehicle and remains resumable', async t => {
  const f = await fixture(t, { listed: [] });
  let calls = 0; f.detail = async id => { if (++calls === 2) throw blocked(); return missing(id); };
  await assert.rejects(f.run(), { code: 'SOURCE_BLOCKED' });
  assert.equal(f.removals.length, 0); assert.equal((await f.state()).counts.checked, 0);
  f.detail = async id => capture(id);
  assert.equal((await f.run(false)).counts.skipped, 1); assert.equal(f.rows.get(a).status, 'skipped');
});

test('zero census counts do not suppress fresh discovery', async t => {
  const f = await fixture(t, { active: [], listed: [b] });
  const normal = f.search; f.search = body => body.clientScene === 'count' ? { data: { totalCount: 0 } } : normal(body);
  assert.equal((await f.run()).counts.added, 1);
});

test('SIGTERM equivalent finishes active work and resumes without discarding it', async t => {
  const f = await fixture(t, { listed: [a] }); const controller = new AbortController();
  f.detail = async id => { controller.abort(); return capture(id); };
  await assert.rejects(f.run(true, controller.signal), { code: 'GUAZI_PAUSED' });
  assert.equal((await f.state()).status, 'paused'); assert.equal(f.writes.length, 1);
  assert.equal((await f.run(false)).status, 'complete'); assert.equal(f.reads.length, 1);
});

test('DB failure is not checkpointed; retry rereads the card, and incompatible database cannot resume', async t => {
  const f = await fixture(t, { listed: [a] }); const normal = f.store.upsert;
  f.store.upsert = async () => { throw Error('database failed'); };
  await assert.rejects(f.run(), /database failed/); assert.equal((await f.state()).counts.checked, 0);
  f.store.target = 'another-database'; await assert.rejects(f.run(false), /database changed/);
  f.store.target = 'test-only'; f.store.upsert = normal;
  assert.equal((await f.run(false)).counts.updated, 1); assert.equal(f.reads.length, 2);
});

test('missing Horgos quote retains existing FOB; unknown historical brand cannot be removed without a scan', async t => {
  const f = await fixture(t, { listed: [a] });
  f.detail = async id => { const value = capture(id); value.rawData.prices[0].enName = 'Shanghai, China'; return value; };
  assert.equal((await f.run()).counts.skipped, 1); assert.equal(f.writes.length, 0);
  f.rows.get(a).brand = 'Historical unknown'; f.listed = []; f.detail = async id => missing(id);
  assert.equal((await f.run()).counts.skipped, 1); assert.equal(f.removals.length, 0);
});

test('live process lock prevents a second collector without deleting the lock', async t => {
  const f = await fixture(t); await fs.mkdir(refreshPaths(f.root).base, { recursive: true });
  await fs.writeFile(refreshPaths(f.root).lock, String(process.pid));
  await assert.rejects(f.run(), /live PID/); assert.equal(f.snapshots, 0);
  assert.equal(await fs.readFile(refreshPaths(f.root).lock, 'utf8'), String(process.pid));
});

test('normal 404/410 requires explicit opt-in and source HTML; challenges, redirects and 5xx remain errors', async () => {
  let disposed = 0;
  const request = (status, html, type = 'text/html', responseUrl = url(a)) => ({ get: async () => ({
    status: () => status, url: () => responseUrl, headers: () => ({ 'content-type': type }), body: async () => Buffer.from(html), dispose: async () => { disposed++; },
  }) });
  const html = '<title>404: This page could not be found</title><h1>404</h1><script>self.__next_f.push([0])</script>';
  for (const status of [404, 410]) assert.equal((await readSessionCard(request(status, html), url(a), { allowMissing: true })).httpStatus, status);
  await assert.rejects(readSessionCard(request(404, html), url(a)), /HTTP 404/);
  await assert.rejects(readSessionCard(request(404, html + '<p>verify you are human</p>'), url(a), { allowMissing: true }), { code: 'SOURCE_BLOCKED' });
  await assert.rejects(readSessionCard(request(404, '<h1>404 proxy error</h1>'), url(a), { allowMissing: true }), { code: 'SOURCE_BLOCKED' });
  await assert.rejects(readSessionCard(request(404, html, 'application/json'), url(a), { allowMissing: true }), { code: 'SOURCE_BLOCKED' });
  await assert.rejects(readSessionCard(request(404, html, 'text/html', url(b)), url(a), { allowMissing: true }), /redirect/);
  await assert.rejects(readSessionCard(request(503, html), url(a), { allowMissing: true }), /HTTP 503/);
  assert.equal(disposed, 8);
});

test('store preserves enrichment and original import date but writes fresh FOB and price history', () => {
  const old = { importedAt: '2026-09-26', conditionSummary: 'old report', appearanceScore: 85, fobPriceUsd: 28000, priceHistory: [{ at: '2026-01-01', priceCny: 1 }] };
  const fresh = { ...snapshotRow(a), source: 'Guazi', priceBasis: 'FOB', fobPort: 'Horgos', fobPriceUsd: 29000, chinaPrice: 200000,
    checkedAt: '2026-09-28', importedAt: '2026-09-28', appearanceScore: null, images: ['https://global-image-pub.guazistatic-global.com/new.jpg'] };
  const merged = mergeRefreshedGuazi(old, fresh);
  assert.equal(merged.appearanceScore, 85); assert.equal(merged.conditionSummary, 'old report'); assert.equal(merged.importedAt, '2026-09-26');
  assert.equal(merged.fobPriceUsd, 29000); assert.deepEqual(merged.priceHistory, [{ at: '2026-09-28', priceCny: 200000 }]);
  assert.throws(() => mergeRefreshedGuazi(old, { ...fresh, fobPort: 'Shanghai' }), /Invalid/);
});

test('database store reports a price change only when an existing Horgos FOB quote differs', async () => {
  const fresh = { ...snapshotRow(a), source: 'Guazi', priceBasis: 'FOB', fobPort: 'Horgos', fobPriceUsd: 28748,
    chinaPrice: 200000, checkedAt: '2026-09-30', images: ['https://global-image-pub.guazistatic-global.com/car.jpg'] };
  let previous = { source: 'Guazi', source_payload: { fobPriceUsd: 28000 } };
  const saved = [];
  const store = createGuaziRefreshStore({ databaseUrl: 'postgres://test:secret@localhost/test',
    withTransaction: fn => fn({ query: async () => ({ rows: previous ? [previous] : [] }) }),
    upsertCar: async car => saved.push(car) });
  assert.deepEqual(await store.upsert(fresh), { action: 'updated', priceChanged: true, quoteChanged:true });
  previous.source_payload.fobPriceUsd = 28748;
  assert.deepEqual(await store.upsert(fresh), { action: 'updated', priceChanged: false, quoteChanged:false });
  previous = null;
  assert.deepEqual(await store.upsert(fresh), { action: 'added', priceChanged: false, quoteChanged:false });
  assert.equal(saved.length, 3);
});

test('database removal is source-scoped and rejects mismatched or single evidence', async () => {
  const queries = [];
  const store = createGuaziRefreshStore({ databaseUrl: 'postgres://test:secret@localhost/test', withTransaction: fn => fn({ query: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; } }) });
  await assert.rejects(store.markUnavailable(snapshotRow(a), { observations: [missing(a)] }), /Unconfirmed/);
  await assert.rejects(store.markUnavailable(snapshotRow(a), { observations: [missing(a), missing(b)] }), /Unconfirmed/);
  await store.markUnavailable(snapshotRow(a), { run: 'test', observations: [missing(a), missing(a)] });
  assert.match(queries[0].sql, /source='Guazi' AND status IN \('active','skipped'\)/); assert.equal(queries[0].params[0], `guazi-${a}`);
});

test('database accepts one explicit sold card, rejects unknown status and mismatched identities', async () => {
  const queries = [];
  const store = createGuaziRefreshStore({ databaseUrl: 'postgres://test:secret@localhost/test', withTransaction: fn => fn({ query: async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; } }) });
  await assert.rejects(store.markUnavailable(snapshotRow(a), { observations: [capture(a)] }), /Unconfirmed/);
  await assert.rejects(store.markUnavailable(snapshotRow(a), { observations: [sold(b)] }), /Unconfirmed/);
  await assert.rejects(store.markUnavailable(snapshotRow(a), { observations: [{ ...sold(a), rawData: { productId: b, displayStatus: 1 } }] }), /Unconfirmed/);
  await store.markUnavailable(snapshotRow(a), { run: 'test', observations: [sold(a)] });
  assert.equal(queries.length, 1); assert.equal(queries[0].params[0], `guazi-${a}`);
  assert.match(queries[0].sql, /source='Guazi' AND status IN \('active','skipped'\)/);
  assert.equal(JSON.parse(queries[0].params[1]).observations[0].rawData.displayStatus, 1);
});

test('a failed FOB quote is retried at round end and recovered without double counting or manual work', async t => {
  const f = await fixture(t, { listed:[a] }); let calls=0;
  f.detail = async id => capture(id,++calls===1?'$9,999,999':'$29,900');
  const state=await f.run();
  assert.equal(state.counts.checked,1);assert.equal(state.counts.updated,1);assert.equal(state.counts.skipped,0);
  assert.equal(state.summary.reactivated,0);assert.equal(state.summary.remaining,1);
  assert.equal(f.skips.length,1);assert.equal(f.rows.get(a).fobPriceUsd,29900);assert.equal(f.rows.get(a).status,'active');
  assert.equal(f.audits.length,1);assert.equal(f.reads.length,2);
});

test('persistent policy skips preserve the old quote, are hidden, and get another chance next round', async t => {
  const f=await fixture(t,{listed:[a]}); f.detail=async id=>capture(id,'$6,500');
  const first=await f.run();assert.equal(first.counts.skipped,1);assert.equal(first.counts.review,0);
  assert.equal(f.rows.get(a).status,'skipped');assert.equal(f.rows.get(a).fobPriceUsd,28748);assert.equal(f.removals.length,0);
  assert.equal(first.summary.remaining,0);assert.match(f.messages.at(-1),/Пропущено автоматически: 1/);
  f.detail=async id=>capture(id,'$7,500');const second=await f.run();
  assert.equal(second.snapshotTotal,1);assert.equal(second.summary.reactivated,1);assert.equal(second.summary.remaining,1);
  assert.equal(f.rows.get(a).status,'active');
});

test('an unlisted card which becomes sold before the automatic retry is removed and the skip count is replaced',async t=>{
  const f=await fixture(t,{listed:[]});let calls=0;f.detail=async id=>++calls===1?capture(id):sold(id);
  const state=await f.run();assert.equal(state.counts.checked,1);assert.equal(state.counts.skipped,0);
  assert.equal(state.counts.unavailable,1);assert.equal(f.rows.get(a).status,'unavailable');assert.equal(f.writes.length,0);
});

test('uncertain new discoveries are skipped without publishing and do not block valid cars',async t=>{
  const f=await fixture(t,{active:[],listed:[a,b]});f.detail=async id=>{const x=capture(id);if(id===a)x.rawData.prices[0].enName='Shanghai, China';return x;};
  const state=await f.run();assert.equal(state.counts.checked,2);assert.equal(state.counts.skipped,1);assert.equal(state.counts.added,1);
  assert.equal(f.rows.has(a),false);assert.equal(f.rows.has(b),true);assert.equal(state.status,'complete');
});

test('failed automatic recheck resumes with its saved identity, without repeating completed main work',async t=>{
  const f=await fixture(t,{listed:[a,b]});let calls=0;
  f.detail=async id=>{if(id===a){calls++;if(calls===2)throw blocked();if(calls===1)return capture(id,'$6,500');}return capture(id);};
  await assert.rejects(f.run(),{code:'SOURCE_BLOCKED'});assert.equal((await f.state()).phase,'recheck');
  assert.equal((await f.state()).counts.checked,2);assert.equal(f.rows.get(a).status,'skipped');
  const resumed=await f.run(false);assert.equal(resumed.status,'complete');assert.equal(resumed.counts.checked,2);
  assert.equal(resumed.counts.skipped,0);assert.equal(resumed.counts.updated,1);assert.equal(resumed.counts.added,1);
  assert.equal(f.reads.filter(id=>id===b).length,1);assert.equal(f.rows.get(a).status,'active');
});

test('database integrity failure cannot produce a successful completion and audit can resume',async t=>{
  const f=await fixture(t,{listed:[a]});const audit=f.store.audit;
  f.store.audit=async()=>{throw Object.assign(Error('wrong stored count'),{code:'GUAZI_INTEGRITY_FAILED'});};
  await assert.rejects(f.run(),{code:'GUAZI_INTEGRITY_FAILED'});
  assert.equal((await f.state()).status,'error');assert.equal((await f.state()).phase,'audit');assert.match(f.messages[0],/не завершён/);
  f.store.audit=audit;assert.equal((await f.run(false)).status,'complete');assert.equal(f.reads.length,1);
});

test('minor FOB movement is tracked separately, with a $100 threshold for reported price changes',async()=>{
  const car={...snapshotRow(a),source:'Guazi',priceBasis:'FOB',fobPort:'Horgos',fobPriceUsd:28748,chinaPrice:200000,checkedAt:'2026-10-08',images:['https://global-image-pub.guazistatic-global.com/car.jpg']};
  const store=createGuaziRefreshStore({databaseUrl:'postgres://localhost/test',withTransaction:fn=>fn({query:async()=>({rows:[{source:'Guazi',status:'active',source_payload:{fobPriceUsd:28700}}]})}),upsertCar:async()=>{}});
  assert.deepEqual(await store.upsert(car),{action:'updated',quoteChanged:true,priceChanged:false});
  assert.equal((await store.upsert({...car,fobPriceUsd:28800})).priceChanged,true);
});

test('missing photos or mileage are ordinary skips, while corrupt identities still fail the round',async t=>{
  for(const field of ['gallery','mileage']){
    const f=await fixture(t,{listed:[a]});
    f.detail=async id=>{const x=capture(id);if(field==='gallery')x.rawData.images=[];else x.rawData.vehicleDetails.find(d=>d.key==='mileage').value='';return x;};
    const state=await f.run();assert.equal(state.status,'complete');assert.equal(state.counts.skipped,1);assert.equal(f.writes.length,0);
  }
  const f=await fixture(t,{listed:[a]});f.detail=async id=>{const x=capture(id);x.rawData.productId=b;x.rawData.images=[];return x;};
  await assert.rejects(f.run(),/identity mismatch/);assert.equal((await f.state()).counts.checked,0);
});

test('unfinished legacy review journals are automatically rechecked using their persisted discovery identity',async t=>{
  const f=await fixture(t,{listed:[a]});f.detail=async id=>capture(id,'$6,500');const audit=f.store.audit;
  f.store.audit=async()=>{throw Error('audit unavailable');};await assert.rejects(f.run(),/audit unavailable/);
  const state=await f.state();const file=path.join(refreshPaths(f.root).base,state.run,'results.jsonl');
  const r=JSON.parse((await fs.readFile(file,'utf8')).trim().split('\n').at(-1));delete r.job;delete r.rechecked;r.outcome='review';
  await fs.writeFile(file,JSON.stringify(r)+'\n');
  f.detail=async id=>capture(id,'$29,000');f.store.audit=audit;
  const resumed=await f.run(false);assert.equal(resumed.status,'complete');assert.equal(resumed.counts.checked,1);
  assert.equal(resumed.counts.review,0);assert.equal(resumed.counts.skipped,0);assert.equal(resumed.counts.updated,1);
  assert.equal(f.rows.get(a).status,'active');
});

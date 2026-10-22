import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runEncarRefresh, readEncarCheckpoint } from '../scripts/lib/encar-refresh.mjs';
import { encarImportPlan } from '../scripts/lib/scheduled-circle.mjs';
import { EncarClient } from '../scripts/lib/encar-client.mjs';

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

test('WAIT is hidden temporarily without a sale, and skipped cars are rechecked even at an unchanged price',async t=>{
  const {options,client,queries,reads}=await fixture(t,['waiting']);
  client.car=async()=>({status:200,car:null,detail:{advertisement:{status:'WAIT'}}});
  const report=await runEncarRefresh(options);
  assert.equal(report.complete,true);
  assert.equal(report.skipped,1);
  assert.equal(report.sold,0);
  assert.ok(queries.some(q=>q.sql.includes("status='skipped'")&&q.sql.includes('sold_at=NULL')));
  assert.ok(!queries.some(q=>q.sql.includes("status='unavailable'")));
  assert.match(queries[0].sql,/status IN \('active','skipped'\)/);
  const baseQuery=options.db.query;
  options.db.query=async(sql,args)=>sql.startsWith('SELECT l.id')
    ?{rows:[{id:'same',external_id:'same',price_cny:10000000,status:'skipped'}]}:baseQuery(sql,args);
  client.car=async id=>{reads.push(id);return {status:200,car:{externalId:id,sourceVehicleId:100},detail:{advertisement:{status:'ADVERTISE'}}};};
  const next=await runEncarRefresh(options);
  assert.deepEqual(reads,['same']);
  assert.equal(next.seenSamePrice,0);
  assert.equal(next.priceChanged,0);
  assert.equal(next.rewritten,1);
  reads.length=0;
  options.db.query=async(sql,args)=>sql.startsWith('SELECT l.id')
    ?{rows:[{id:'same',external_id:'same',price_cny:10000000,status:'active',history_unavailable:'true'}]}:baseQuery(sql,args);
  await runEncarRefresh(options);
  assert.deepEqual(reads,['same'],'deferred history is retried next round even at the same price');
});

test('an optional-history refusal is counted separately after the verified car is successfully saved',async t=>{
  const {options,client}=await fixture(t,['missing']);
  client.car=async()=>({status:200,car:{externalId:'missing',historyUnavailable:true},detail:{advertisement:{status:'ADVERTISE'}},historyUnavailable:true});
  const report=await runEncarRefresh(options);
  assert.equal(report.complete,true);
  assert.equal(report.historyDeferred,1);
  assert.equal(report.readFailed,0);
  assert.equal(report.rewritten,1);
  options.upsert=async()=>{throw Error('write failed');};
  const failed=await runEncarRefresh(options);
  assert.equal(failed.historyDeferred,undefined);
  assert.equal(failed.writeFailed,1);
  assert.equal(failed.remainingListings,1);
});

test('an unavailable source card is removed without a sale date and no longer blocks discoveries',async t=>{
  const {options,client,queries}=await fixture(t,['same','missing']);
  const query=options.db.query;
  options.db.query=async(sql,args)=>sql.startsWith('SELECT external_id')?{rows:[
    {external_id:'missing',status:'active'},{external_id:'same',status:'active'},
  ]}:query(sql,args);
  const probes=[];
  client.verifyAccess=async({sampleId})=>probes.push(sampleId);
  client.car=async()=>({status:404,car:null,detail:null,unverifiedUnavailable:true,apiStatus:407,publicStatus:200,availabilitySource:'public-missing'});
  const initial=await runEncarRefresh({...options,stop:()=>true});
  assert.equal(initial.remainingListings,1);
  const report=await runEncarRefresh({...options,resume:true});
  assert.deepEqual(probes,['same'],'access control must be outside the unverified tail');
  assert.equal(report.complete,true);
  assert.equal(report.sold,1);
  assert.equal(report.unverifiedUnavailable,1);
  assert.equal(report.readFailed+report.parseFailed+report.writeFailed,0);
  assert.equal(report.remainingListings,0);
  const update=queries.find(row=>row.sql.includes("status='unavailable'"));
  assert.ok(update.sql.includes('sold_at=NULL'));
  assert.deepEqual(JSON.parse(update.values[1]),{state:'unavailable',reason:'source-unavailable',checkedAt:JSON.parse(update.values[1]).checkedAt,sourceState:null,source:'public-missing',apiStatus:407,publicStatus:200});
  const checkpoint=await readEncarCheckpoint(options.checkpointPath);
  assert.deepEqual(checkpoint.pending,[]);
  assert.deepEqual(checkpoint.failures,{});
  const discoveries=JSON.parse(await fs.readFile(options.discoveriesPath));
  assert.ok(encarImportPlan(discoveries,report,Date.parse(report.startedAt)));
});

test('returning advertisements cannot create a second active record of the same physical car',async t=>{
  const {options,client,writes,queries}=await fixture(t,['same']);
  const query=options.db.query;
  options.db.query=async(sql,args)=>sql.startsWith('SELECT external_id')?{rows:[
    {external_id:'same',status:'active',source_vehicle_id:'100'},
    {external_id:'returning',status:'unavailable',source_vehicle_id:'100'},
  ]}:query(sql,args);
  client.walk=async({onItem})=>{onItem({externalId:'same',priceMan:1000});onItem({externalId:'returning',priceMan:1000});return {slices:1,broken:0};};
  client.car=async()=>({status:200,car:{externalId:'returning',sourceVehicleId:100},detail:{advertisement:{status:'ADVERTISE'}}});
  const report=await runEncarRefresh(options);
  assert.equal(report.complete,true);
  assert.equal(report.skipped,1);
  assert.equal(report.reactivated,undefined);
  assert.deepEqual(writes,[]);
  assert.ok(queries.some(q=>q.sql.includes("status='skipped'")));
});

test('replay after an unsaved successful reactivation does not hide the already activated advertisement',async t=>{
  const {options,client,writes}=await fixture(t,[]);
  let active=false;
  options.db.query=async sql=>sql.startsWith('SELECT external_id')
    ?{rows:[{external_id:'returning',status:active?'active':'unavailable',source_vehicle_id:'100'}]}:{rows:[],rowCount:1};
  client.walk=async({onItem})=>{onItem({externalId:'returning',priceMan:1000});return {slices:1,broken:0};};
  client.car=async()=>({status:200,car:{externalId:'returning',sourceVehicleId:100},detail:{advertisement:{status:'ADVERTISE'}}});
  const partial=await runEncarRefresh({...options,stop:()=>true});
  assert.equal(partial.remainingListings,1);
  active=true; // The DB write survived a hard kill, but the last checkpoint did not.
  const report=await runEncarRefresh({...options,resume:true});
  assert.equal(report.complete,true);
  assert.equal(report.skipped,undefined);
  assert.equal(report.reactivated,1);
  assert.deepEqual(writes,['returning']);
});

test('an unacknowledged database status write remains queued instead of being counted as sold',async t=>{
  const {options,client}=await fixture(t,['missing']);
  const query=options.db.query;
  options.db.query=async(sql,args)=>sql.startsWith('UPDATE listings SET status')?{rows:[],rowCount:0}:query(sql,args);
  client.car=async()=>({status:200,car:null,detail:{advertisement:{status:'SOLD'}}});
  const report=await runEncarRefresh(options);
  assert.equal(report.complete,false);
  assert.equal(report.sold,0);
  assert.equal(report.writeFailed,1);
  assert.deepEqual((await readEncarCheckpoint(options.checkpointPath)).pending,['missing']);
});

test('a corrupted queue or mismatched round totals are rejected before source or database writes',async t=>{
  const {options,client}=await fixture(t,['missing1','missing2']);
  await runEncarRefresh({...options,detailLimit:1});
  const initial=await readEncarCheckpoint(options.checkpointPath);
  client.car=()=>assert.fail('must validate the checkpoint before card reads');
  client.verifyAccess=()=>assert.fail('must validate the checkpoint before access probes');
  for(const corrupt of [
    {...initial,pending:[...initial.pending,...initial.pending]},
    {...initial,summary:{...initial.summary,active:initial.summary.active+1}},
  ]){
    const raw=JSON.stringify(corrupt);
    await fs.writeFile(options.checkpointPath,raw);
    await assert.rejects(runEncarRefresh({...options,resume:true}),/очеред|исходным набором/);
    assert.equal(await fs.readFile(options.checkpointPath,'utf8'),raw);
  }
});

test('network, parsing and database failures remain queued; resume only retries failures and clears their counters', async t => {
  const { options, client, reads, writes } = await fixture(t, ['changed', 'network', 'parse', 'database', 'sold']);
  client.car = async id => {
    reads.push(id); client.requests++;
    if (id === 'network') return { status: 503, car: null };
    if (id === 'parse') throw Object.assign(Error('Malformed vehicle'), { stage: 'parse', code: 'ENCAR_INVALID_DETAIL' });
    if (id === 'sold') return { status: 200, car: null, detail: { advertisement: { status: 'SOLD' } } };
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
  client.walk = async () => ({ slices: 1, broken: 1, errors: [{ status: 400 }] });
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

test('an extended outage stops both workers, saves untouched cards and resumes the unresolved queue', async t => {
  const ids = Array.from({ length: 40 }, (_, index) => String(index));
  const { options, client: fixtureClient, writes, queries } = await fixture(t, ids);
  let calls = 0;
  const client = new EncarClient({ attempts: 1, pace: 0, wait: async () => {}, fetcher: async () => {
    calls++;
    throw new TypeError('fetch failed', { cause: Object.assign(Error('connection reset'), { code: 'ECONNRESET' }) });
  } });
  client.walk = fixtureClient.walk;
  await assert.rejects(runEncarRefresh({ ...options, client, concurrency: 2 }), error => error.code === 'ENCAR_UNAVAILABLE');
  const saved = await readEncarCheckpoint(options.checkpointPath);
  assert.equal(saved.summary.complete, false);
  assert.equal(saved.phase, 'partial');
  assert.deepEqual(saved.pending, ids);
  assert.match(saved.summary.fatal, /15 запросов/);
  assert.ok(calls <= 16, 'stop after the limit plus an already in-flight request');
  assert.deepEqual(writes, []);
  assert.equal(queries.filter(query => query.sql.includes("status='unavailable'")).length, 0);
  fixtureClient.walk = () => assert.fail('completed list snapshot must be reused');
  const resumed = await runEncarRefresh({ ...options, resume: true });
  assert.equal(resumed.complete, true);
  assert.equal(resumed.remainingListings, 0);
  assert.equal(resumed.readFailed, 0);
  assert.equal(resumed.rewritten, ids.length);
});

test('resuming repairs only list evidence and outstanding cards, preserving completed work and discoveries',async t=>{
  const {options,client,reads}=await fixture(t,['changed','missing']);
  const initialWalk=client.walk;
  client.walk=async args=>({...await initialWalk(args),broken:1,errors:[{label:'Kia',status:200,error:'Incomplete list'}]});
  const initialCar=client.car;
  client.car=async id=>id==='missing'?{status:503}:initialCar(id);
  const first=await runEncarRefresh(options);
  assert.equal(first.rewritten,1);
  assert.equal(first.remainingListings,1);
  reads.length=0;
  client.car=initialCar;
  client.walk=async({onItem})=>{onItem({externalId:'repaired-new',manufacturer:'기아'});return {broken:0,stopped:false};};
  const resumed=await runEncarRefresh({...options,resume:true});
  assert.deepEqual(reads,['missing']);
  assert.equal(resumed.rewritten,2);
  assert.equal(resumed.complete,true);
  assert.equal(resumed.discoveries,3);
  assert.equal(resumed.attempt.completed,1);
  assert.equal(resumed.attempt.readFailed,0);
  const discoveries=JSON.parse(await fs.readFile(options.discoveriesPath));
  assert.deepEqual(discoveries.items.map(item=>item.externalId),['same','new','repaired-new']);
  assert.ok(encarImportPlan(discoveries,resumed,Date.parse(resumed.resumedAt)));
});

test('a resume access-probe failure saves a current report without touching catalog records',async t=>{
  const {options,client,reads,writes}=await fixture(t,['missing1','missing2']);
  await runEncarRefresh({...options,detailLimit:1});
  reads.length=0;writes.length=0;
  client.verifyAccess=async()=>{throw Object.assign(Error('Encar access blocked'),{code:'ENCAR_GEO_BLOCKED'});};
  await assert.rejects(runEncarRefresh({...options,resume:true}),/access blocked/);
  assert.deepEqual(reads,[]);
  assert.deepEqual(writes,[]);
  const saved=await readEncarCheckpoint(options.checkpointPath);
  assert.deepEqual(saved.pending,['missing2']);
  assert.equal(saved.summary.attempt.completed,0);
  assert.ok(saved.summary.attempt.startedAt);
  assert.match(saved.summary.fatal,/access blocked/);
});

test('old unresolved failures are distinct from new-attempt errors and the actual HTTP status is retained',async t=>{
  const {options,client}=await fixture(t,['one','two']);
  client.car=async()=>({status:0,error:Error('old network error')});
  await runEncarRefresh(options);
  client.car=async()=>{throw Object.assign(Error('HTTP 407 without sold proof'),{code:'ENCAR_UNAVAILABLE',status:407});};
  await assert.rejects(runEncarRefresh({...options,resume:true}),/407/);
  const saved=await readEncarCheckpoint(options.checkpointPath);
  assert.equal(saved.summary.readFailed,2);
  assert.equal(saved.summary.attempt.readFailed,1);
  assert.deepEqual(saved.summary.attempt.responseStatuses,{'407':1});
  assert.match(saved.summary.errors[0].error,/407/);
});

test('a failed report save stops processing, retains the checkpoint and safely resumes without replaying saved successes',async t=>{
  const {options,reads,writes}=await fixture(t,['missing1','missing2','missing3']);
  let time=Date.now();
  options.now=()=>time;
  const backup=`${options.reportPath}.backup`;
  options.upsert=async car=>{
    writes.push(car.externalId);
    time+=31000;
    await fs.rename(options.reportPath,backup);
    await fs.mkdir(options.reportPath);
  };
  await assert.rejects(runEncarRefresh(options));
  assert.deepEqual(reads,['missing1']);
  const saved=await readEncarCheckpoint(options.checkpointPath);
  assert.deepEqual(saved.pending,['missing2','missing3']);
  assert.equal(saved.summary.complete,false);
  await fs.rm(options.reportPath,{recursive:true});
  await fs.rename(backup,options.reportPath);
  reads.length=0;
  options.upsert=async car=>writes.push(car.externalId);
  const resumed=await runEncarRefresh({...options,resume:true});
  assert.deepEqual(reads,['missing2','missing3']);
  assert.deepEqual(writes,['missing1','missing2','missing3']);
  assert.equal(resumed.complete,true);
});

test('an unverified 404 never becomes a sale, and a catalog DB outage stops after the failed write',async t=>{
  const {options,client,queries,reads}=await fixture(t,['missing1','missing2']);
  client.car=async()=>({status:404,error:Object.assign(Error('API missing response not confirmed'),{code:'ENCAR_UNVERIFIED_STATUS'}),detail:null,car:null});
  const partial=await runEncarRefresh(options);
  assert.equal(partial.sold,0);
  assert.equal(partial.readFailed,2);
  assert.equal(queries.filter(x=>x.sql.includes("status='unavailable'")).length,0);
  client.car=async id=>{reads.push(id);return {status:200,car:{externalId:id},detail:{advertisement:{status:'ADVERTISE'}}};};
  options.upsert=async()=>{throw Object.assign(Error('database connection refused'),{code:'ECONNREFUSED'});};
  await assert.rejects(runEncarRefresh({...options,resume:true}),/database connection refused/);
  assert.deepEqual(reads,['missing1']);
  const saved=await readEncarCheckpoint(options.checkpointPath);
  assert.deepEqual(saved.pending,['missing1','missing2']);
  assert.equal(saved.summary.attempt.writeFailed,1);
  assert.equal(saved.summary.attempt.readFailed,0);
});

test('a completely failed list census cannot launch a mass missing-card pass',async t=>{
  const {options,client,reads}=await fixture(t,['missing']);
  client.walk=async()=>({slices:0,broken:1,errors:[{status:407}]});
  await assert.rejects(runEncarRefresh(options),/ни одного списка/);
  assert.deepEqual(reads,[]);
  assert.equal((await readEncarCheckpoint(options.checkpointPath)).summary.complete,false);
});

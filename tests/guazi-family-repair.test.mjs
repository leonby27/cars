import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { normalizeCoreCard, evaluateCoreCard, makeSegments } from '../scripts/lib/guazi-core.mjs';
import { repairGuaziFamily, familyRepairTargets } from '../scripts/lib/guazi-family-repair.mjs';
import { loadRefreshPolicy, readResults, refreshPaths, runGuaziRefresh } from '../scripts/lib/guazi-refresh.mjs';
import { writeJson, readJson } from '../scripts/lib/guazi-pilot-io.mjs';
import { orderGuaziBrands } from '../scripts/guazi-census.mjs';

const config = { ...JSON.parse(await fs.readFile(new URL('../config/guazi-core.json', import.meta.url))), priceBasis: 'FOB' };
const filters = JSON.parse(await fs.readFile(new URL('../config/refresh-order.json', import.meta.url))).filters;
const group = 'AITO/LUXEED/MAEXTRO/SAIC/STELATO';
const url = id => `https://en.guazi.com/products/car-${id}.html`;
const a='aaaaaaaaaa', b='bbbbbbbbbb', d='dddddddddd', good='gggggggggg', sold='ssssssssss';
const raw = (id, makeNameEn, makeId, modelName) => ({ productId:id,clueId:172877314,makeNameEn,makeId,modelName,title:modelName,
  vehicleDetails:[{key:'modelYear',value:'2024'},{key:'fuel',value:'BEV'},{key:'regDate',value:'2024.09'},{key:'mileage',value:'10000'}],
  images:[{imgUrl:'https://global-image-pub.guazistatic-global.com/car.jpg'}],prices:[{price:'$20,000',enName:'Horgos, China'}] });
const capture = (id, make, makeId, model) => ({url:url(id),observedAt:new Date().toISOString(),rawData:raw(id,make,makeId,model)});

test('a normal round collects all family feeds before checking absence, regardless of their relative size',()=>{
  const segments=makeSegments([{id:'103950',name:group},{id:'104071',name:'AITO'},
    {id:'104015',name:'LUXEED'},{id:'104070',name:'STELATO'},{id:'104068',name:'MAEXTRO'},
    {id:'104069',name:'SAIC'},{id:'102715',name:'Tesla'}],filters,config);
  const counts=Object.fromEntries(segments.flatMap(s=>[0,1].map(p=>[`${s.id}:${p}`,s.brand==='Luxeed'?1000:1])));
  const ordered=orderGuaziBrands(segments,counts);
  assert.deepEqual(ordered.map(x=>x.brand),['Tesla','AITO']);
  const family=ordered.find(x=>x.brand==='AITO');assert.equal(family.segments.length,24);
  assert.deepEqual(new Set(family.segments.map(s=>s.sourceBrandId)),new Set(['103950','104071','104015','104070','104068','104069']));
});

test('observed alliance and individual makes preserve each family brand, without accepting unrelated SAIC',()=>{
  const segments=makeSegments([{id:'103950',name:group},{id:'104069',name:'SAIC'}],filters,config);
  assert.equal(segments.length,8);
  for(const [make,id,model,brand,want] of [
    [group,103950,'AITO M7','AITO','M7'],[group,103950,'Luxeed R7','Luxeed','R7'],
    [group,103950,'Stelato S9','Stelato','S9'],[group,103950,'Maextro S800','Maextro','S800'],[group,103950,'S800','Maextro','S800'],
    [group,103950,'Shangjie H5','Shangjie','H5'],['Hima',103950,'H5','Shangjie','H5'],
    ['AITO',104071,'AITO M5','AITO','M5'],['LUXEED',104015,'Luxeed R7','Luxeed','R7'],
    ['SAIC',104069,'H5','Shangjie','H5'],
  ]){
    const card=normalizeCoreCard(capture(a,make,id,model),config);
    assert.equal(card.catalogIdentity.brand,brand,`${make}/${model}`);assert.equal(card.catalogIdentity.model,want);
    assert.equal(evaluateCoreCard(card,segments[0],config).status,'accepted');
  }
  const unrelated=normalizeCoreCard(capture(a,'SAIC',12345,'H5'),config);
  assert.equal(unrelated.selection.eligible,false);
  const chery=normalizeCoreCard(capture(a,'Chery',1200,'Tiggo 7'),config);
  assert.equal(evaluateCoreCard(chery,segments[0],config).reason,'detail_brand_mismatch');
});

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'guazi-family-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await writeJson(path.join(root,'config/guazi-core.json'),config);
  await writeJson(path.join(root,config.sharedFilterFile),{filters});
  await writeJson(path.join(root,'config/guazi-core-brands.json'),{brands:[{id:'103950',name:group},{id:'104069',name:'SAIC'},
    {id:'104071',name:'AITO'},{id:'104015',name:'LUXEED'},{id:'104070',name:'STELATO'},{id:'104068',name:'MAEXTRO'}]});
  const pinned={config,segments:makeSegments([{id:'103950',name:'Hima'}],filters,config)};
  const run='2026-10-28T15-00-05-392Z-3a5142b4';const base=path.join(refreshPaths(root).base,run);
  await writeJson(path.join(base,'policy.json'),pinned);
  const signature=createHash('sha256').update(JSON.stringify({...pinned,target:'test'})).digest('hex');
  const snapshot=[a,b,good,sold].map(id=>({id:`guazi-${id}`,externalId:id,sourceUrl:url(id),brand:id===b?'Shangjie':'AITO',status:'active'}));
  await writeJson(path.join(base,'snapshot.json'),snapshot);
  await writeJson(refreshPaths(root).state,{version:1,run,signature,status:'blocked',phase:'details',brand:'Buick',snapshotTotal:4,brandsDone:['AITO'],counts:{}});
  const job=id=>({candidate:{id,url:url(id),violations:[]},listed:true,segmentId:'103950-electric',partition:1});
  const original=[{id:a,brand:'AITO',outcome:'skipped',reason:'brand is outside the Belarus import list',job:job(a)},
    {id:b,brand:'AITO',outcome:'skipped',reason:'source_segment_unknown',job:job(b)},
    {id:d,brand:'AITO',outcome:'rejected',reason:'brand is outside the Belarus import list',job:job(d)},
    {id:good,brand:'AITO',outcome:'updated',job:job(good)}, {id:sold,brand:'AITO',outcome:'unavailable',reason:'source_sold',job:job(sold)}];
  const journal=path.join(base,'results.jsonl');const initial=original.map(r=>JSON.stringify(r)+'\n').join('');await fs.writeFile(journal,initial);
  const f={root,base,run,signature,journal,initial,reads:[],writes:[],finalized:0,fail:true};
  const statuses=new Map([[a,'skipped'],[b,'skipped'],[good,'active'],[sold,'unavailable']]);
  f.store={target:'test',acquire:async()=>async()=>{},
    upsert:async car=>{f.writes.push(car);statuses.set(car.externalId,'active');return{action:car.externalId===d?'added':'reactivated'};},
    markSkipped:async row=>statuses.set(row.externalId,'skipped'),markUnavailable:async row=>statuses.set(row.externalId,'unavailable'),
    auditSelected:async({results})=>{assert.equal(results.length,3);assert.ok(results.every(r=>statuses.get(r.id)==='active'));return{checked:3,mismatches:0};},
    finalize:async()=>{f.finalized++;}};
  f.deps={store:f.store,log:()=>{},browserFactory:async()=>({publicBootstrap:async()=>{},close:async()=>{},
    publicSearch:async body=>{
      const ids=body.fuelTypes[0]===2&&body.exportPolicyEligible===1?(body.brandId==='103950'?[a,d]:body.brandId==='104069'?[b]:[]):[];
      return{data:{totalCount:ids.length,list:ids.map(id=>({productId:id,seoUri:`car-${id}.html`,brandId:Number(body.brandId),fuelTypeName:'BEV',licenseDate:'20240901'}))}};
    },worker:async()=>({card:async href=>{const id=href.match(/-([a-z]{10})\.html/)[1];f.reads.push(id);if(id===b&&f.fail)throw Object.assign(Error('access check'),{code:'SOURCE_BLOCKED'});
      return id===b?capture(id,'SAIC',104069,'H5'):id===d?capture(id,'LUXEED',104015,'Luxeed R7'):capture(id,group,103950,'AITO M7');}})})};
  f.go=()=>repairGuaziFamily({root},f.deps);return f;
}

test('repair resumes only failed targets, retains successful work and original policy, then verifies DB outcomes',async t=>{
  const f=await fixture(t);
  await assert.rejects(f.go(),{code:'SOURCE_BLOCKED'});
  const blocked=await readJson(path.join(f.base,'guazi-huawei-v1/current.json'));
  assert.equal(blocked.status,'blocked');assert.equal(blocked.targets.length,3);assert.equal(blocked.completed,2);
  f.fail=false;const done=await f.go();assert.equal(done.status,'complete');assert.equal(done.completed,3);
  assert.deepEqual(done.outcomes,{updated:2,added:1});assert.equal(f.finalized,1);
  assert.equal(f.reads.filter(x=>x===a).length,1);assert.equal(f.reads.filter(x=>x===d).length,1);assert.equal(f.reads.filter(x=>x===b).length,2);
  assert.ok(!f.reads.includes(good)&&!f.reads.includes(sold));
  assert.ok((await fs.readFile(f.journal,'utf8')).startsWith(f.initial));
  const state=await readJson(refreshPaths(f.root).state);assert.equal(state.signature,f.signature);assert.equal(state.run,f.run);assert.equal(state.status,'blocked');assert.equal(state.brand,'Buick');assert.deepEqual(state.brandsDone,['AITO']);
  assert.equal(state.counts.checked,5);assert.equal(state.counts.updated,3);assert.equal(state.counts.added,1);assert.equal(state.counts.unavailable,1);
  const results=await readResults(f.journal);assert.equal(results.get(b).sourceIdentity.makeNameEn,'SAIC');assert.equal(results.get(b).job.listed,true);
  const pinned=await loadRefreshPolicy(f.root,state);assert.equal(pinned.segments[0].sourceBrand,'Hima');
  assert.equal((await loadRefreshPolicy(f.root)).segments[0].sourceBrand,group);
  const before=f.reads.length;await f.go();assert.equal(f.reads.length,before);
});

test('repair refuses a different database before reading or changing cars',async t=>{
  const f=await fixture(t);f.store.target='different';await assert.rejects(f.go(),/database mismatch/);assert.equal(f.reads.length,0);assert.equal(await fs.readFile(f.journal,'utf8'),f.initial);
});

test('a saved Shangjie moved out of the alliance feed remains active in an ordinary full round',async t=>{
  const f=await fixture(t);f.fail=false;
  await fs.rm(refreshPaths(f.root).state);
  f.store.snapshot=async()=>[{id:`guazi-${b}`,externalId:b,sourceUrl:url(b),brand:'Shangjie',status:'active'}];
  f.store.countActive=async()=>f.writes.length;
  f.store.audit=async input=>{assert.equal(input.expectedRemaining,1);return{active:1,invalid:0,mismatches:0};};
  const factory=f.deps.browserFactory;
  f.deps.browserFactory=async options=>({...await factory(options),publicSearch:async body=>{
    const present=body.brandId==='104069'&&body.fuelTypes[0]===2&&body.exportPolicyEligible===1;
    return{data:{totalCount:present?1:0,list:present?[{productId:b,seoUri:`car-${b}.html`,brandId:104069,fuelTypeName:'BEV',licenseDate:'20240901'}]:[]}};
  }});
  const state=await runGuaziRefresh({root:f.root,newCircle:true},f.deps);
  assert.equal(state.status,'complete');assert.equal(state.brandsTotal,1);assert.equal(state.counts.updated,1);assert.equal(state.counts.skipped,0);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].brand,'Shangjie');assert.equal(f.reads.filter(id=>id===b).length,1);
});

test('target selection never includes sales, valid outcomes, unrelated brands or ordinary price exclusions',()=>{
  const rows=[{id:a,brand:'AITO',outcome:'unavailable',reason:'source_sold'}, {id:b,brand:'AITO',outcome:'skipped',reason:'fob_price_range'},
    {id:d,brand:'Chery',outcome:'skipped',reason:'source_segment_unknown'}];
  assert.deepEqual(familyRepairTargets(new Map(rows.map(r=>[r.id,r]))),[]);
});

test('repair never restores an unlisted car merely because its detail page still has an FOB quote',async t=>{
  const f=await fixture(t);f.fail=false;
  const originalFactory=f.deps.browserFactory;
  f.deps.browserFactory=async()=>({...await originalFactory(),publicSearch:async()=>({data:{totalCount:0,list:[]}})});
  f.store.auditSelected=async({results})=>{
    assert.ok(results.every(r=>r.outcome==='skipped'&&r.reason==='availability_unverified'));
    return{checked:3,mismatches:0};
  };
  const done=await f.go();assert.equal(done.status,'complete');assert.deepEqual(done.outcomes,{skipped:3});assert.equal(f.writes.length,0);
});

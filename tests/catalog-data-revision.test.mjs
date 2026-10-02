import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogDataRevision} from '../scripts/lib/catalog-data-revision.mjs';
import {reuseFeed} from '../scripts/lib/reuse-feed.mjs';
import {mkdtempSync,writeFileSync,utimesSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('revision tracks content, sales, specs, visibility and deletion without loading payloads',async()=>{
 let state={content:'one',sold:null,vehicles:'one',sources:'one',listing_count:'100000',vehicle_count:'100000',visibility:'0:0'};
 const db={query:async sql=>{assert.doesNotMatch(sql,/source_payload|JOIN vehicles/);return {rows:[{...state}]};}};
 const before=await catalogDataRevision(db);
 for(const key of Object.keys(state)) {
  const previous=state[key];state[key]='changed';
  assert.notEqual(await catalogDataRevision(db),before,key);state[key]=previous;
 }
 await assert.rejects(catalogDataRevision({query:async()=>({rows:[]})}));
});

test('feed reuse refuses a changed catalog and does not renew feed age',()=>{
 const dir=mkdtempSync(join(tmpdir(),'abcars-feed-revision-'));
 try {
  const source=join(dir,'feed.xml'),target=join(dir,'next.xml');
  writeFileSync(source,'<yml_catalog/>');utimesSync(source,new Date(10000),new Date(10000));
  writeFileSync(source+'.meta.json',JSON.stringify({key:'rules',dataRevision:'before'}));
  assert.equal(reuseFeed(source,target,{now:20000,key:'rules',dataRevision:'before'}),true);
  assert.equal(reuseFeed(source,target,{now:20000,key:'rules',dataRevision:'after'}),false);
  assert.equal(reuseFeed(target,join(dir,'later.xml'),{now:86410000,key:'rules',dataRevision:'before'}),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

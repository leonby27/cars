import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../server/db.mjs';
import {listCars,brandCatalogGuide,brandStock,clearCatalogCaches} from '../server/repository.mjs';
import {CATALOG_PAGE_SIZE,CATALOG_MAX_PAGES} from '../src/catalog-landings.js';

const params=extra=>new URLSearchParams({brand:'Kia',limit:String(CATALOG_PAGE_SIZE),sort:'default',seed:'s1',...extra});
const carRow=id=>({id,brand:'Kia',model:'K5',model_year:2023,source:'Encar',images:[]});

test('initial and following batches retain 48 cards and the original crawl depth',()=>{
 assert.equal(CATALOG_PAGE_SIZE,48);
 assert.equal(CATALOG_PAGE_SIZE*CATALOG_MAX_PAGES,4992);
});

test('same batches share in-flight reads; pagination and sorting reuse only the total',async()=>{
 const old=pool.query,calls=[];
 clearCatalogCaches();
 pool.query=async(sql,values)=>{
  calls.push({sql,values});await new Promise(setImmediate);
  if(sql.startsWith('SELECT count(*)'))return {rows:[{total:120,refreshed_at:'checked',changed_at:'changed'}]};
  const offset=values.at(-1),limit=values.at(-2);
  return {rows:Array.from({length:Math.min(limit,120-offset)},(_,i)=>carRow(`encar-${offset+i}`))};
 };
 try{
  const [a,b]=await Promise.all([listCars(params()),listCars(params())]);
  assert.deepEqual(a,b);assert.equal(a.items.length,48);assert.equal(a.total,120);assert.equal(a.hasMore,true);
  assert.equal(calls.length,2);
  const next=await listCars(params({offset:'48'}));
  assert.equal(calls.length,3);assert.equal(next.items.length,48);assert.equal(next.hasMore,true);
  assert.equal(new Set([...a.items,...next.items].map(car=>car.id)).size,96);
  const last=await listCars(params({offset:'96'}));
  assert.equal(last.items.length,24);assert.equal(last.hasMore,false);
  await listCars(params({sort:'price_asc'}));
  await listCars(params({seed:'s2'}));
  assert.equal(calls.filter(call=>call.sql.startsWith('SELECT count(*)')).length,1);
  await listCars(params({country:'korea'}));
  assert.equal(calls.filter(call=>call.sql.startsWith('SELECT count(*)')).length,2,'country filters have their own total');
  clearCatalogCaches();await listCars(params());
  assert.equal(calls.filter(call=>call.sql.startsWith('SELECT count(*)')).length,3);
 }finally{pool.query=old;clearCatalogCaches();}
});

test('brand summary supplies total and dates to SSR and subsequent API batches',async()=>{
 const old=pool.query,calls=[];
 clearCatalogCaches();
 pool.query=async(sql)=>{calls.push(sql);return {rows:[carRow('encar-1')]};};
 const facts={total:70,refreshedAt:'checked',changedAt:'changed',calculatedAt:new Date().toISOString()};
 try{
  const first=await listCars(params(),{summary:Promise.resolve(facts)});
  assert.equal(first.total,70);assert.equal(first.refreshedAt,'checked');assert.equal(first.changedAt,'changed');
  const next=await listCars(params({offset:'48'}));
  assert.equal(next.total,70);assert.equal(calls.length,2);
  assert.ok(calls.every(sql=>sql.startsWith('WITH picked')),'no separate count scan');
  assert.equal('validUntil' in first,false,'cache bookkeeping stays internal');
 }finally{pool.query=old;clearCatalogCaches();}
});

test('expired guide facts cannot keep an obsolete total alive for another minute',async()=>{
 const old=pool.query;
 clearCatalogCaches();let counts=0;
 pool.query=async sql=>sql.startsWith('SELECT count(*)')
  ? (counts++,{rows:[{total:40}]}) : {rows:[]};
 try{
  await listCars(params(),{summary:Promise.resolve({total:70,calculatedAt:new Date(Date.now()-61_000).toISOString()})});
  assert.equal((await listCars(params({offset:'48'}))).total,40);
  assert.equal(counts,1);
 }finally{pool.query=old;clearCatalogCaches();}
});

test('brand guides and stock coalesce concurrent reads and retry a failed batch',async()=>{
 const old=pool.query;
 clearCatalogCaches();let calls=0,fail=false;
 pool.query=async sql=>{
  calls++;await new Promise(setImmediate);
  if(fail){fail=false;throw new Error('temporary');}
  if(sql.includes('count(DISTINCT v.model)'))return {rows:[{total:70,year_min:2020,year_max:2026,refreshed_at:'checked'}]};
  if(sql.startsWith('SELECT count(*)'))return {rows:[{total:70}]};
  return {rows:[]};
 };
 try{
  const [a,b]=await Promise.all([brandCatalogGuide('Kia'),brandCatalogGuide('Kia')]);
  assert.deepEqual(a,b);assert.equal(calls,3);assert.equal(a.refreshedAt,'checked');
  await Promise.all([brandStock(),brandStock()]);assert.equal(calls,4);
  clearCatalogCaches();fail=true;
  await assert.rejects(listCars(params()),/temporary/);
  assert.equal((await listCars(params())).items.length,0);
 }finally{pool.query=old;clearCatalogCaches();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../server/db.mjs';
import {listCars,readyCatalogSummary,clearCatalogCaches} from '../server/repository.mjs';
import {catalogSort,catalogHref} from '../src/catalog-url.js';
import {CATALOG_PAGE_SIZE,CATALOG_MAX_PAGES} from '../src/catalog-landings.js';
import {prepareCatalogPageFacts} from '../server/prepared-catalog.mjs';
const row=i=>({id:`encar-${i}`,brand:'Kia',model:'K5',model_year:2023,source:'Encar',images:[]});
const query=offset=>new URLSearchParams({sort:'price_asc',limit:'48',offset:String(offset),summary:'defer'});

test('first and next batches do not wait for a pending summary and use one-row lookahead',async()=>{
 const old=pool.query,calls=[];let finish;
 clearCatalogCaches();
 pool.query=async(sql,values)=>{
  calls.push({sql,values});
  if(sql.startsWith('SELECT count(*)'))return new Promise(resolve=>{finish=()=>resolve({rows:[{total:130,year_min:2020,year_max:2026}]})});
  const offset=values.at(-1),limit=values.at(-2);
  return {rows:Array.from({length:Math.min(limit,130-offset)},(_,i)=>row(offset+i))};
 };
 try{
  const pending=listCars(new URLSearchParams({summary:'only'}));await new Promise(setImmediate);
  assert.equal(readyCatalogSummary(new URLSearchParams()),null);
  const first=await listCars(query(0));
  assert.equal(first.items.length,48);assert.equal(first.hasMore,true);assert.equal(first.total,null);assert.equal(first.summaryPending,true);
  assert.equal(calls.filter(c=>c.sql.startsWith('SELECT count(*)')).length,1);
  assert.equal(calls.find(c=>c.sql.startsWith('WITH picked')).values.at(-2),49);
  const next=await listCars(query(48));assert.equal(next.items.length,48);
  assert.equal(new Set([...first.items,...next.items].map(c=>c.id)).size,96);
  const last=await listCars(query(96));assert.equal(last.items.length,34);assert.equal(last.hasMore,false);
  finish();const summary=await pending;assert.equal(summary.total,130);assert.equal(summary.yearMin,2020);
  assert.equal(readyCatalogSummary(new URLSearchParams()).total,130);
 }finally{finish?.();pool.query=old;clearCatalogCaches();}
});

test('summary failure cannot reject or erase a successful card batch',async()=>{
 const old=pool.query;clearCatalogCaches();
 pool.query=async(sql,values)=>{if(sql.startsWith('SELECT count(*)'))throw new Error('summary down');return {rows:[row(1)]};};
 try{
  await assert.rejects(listCars(new URLSearchParams({summary:'only'})),/summary down/);
  const result=await listCars(query(0));assert.equal(result.items[0].id,'encar-1');assert.equal(result.hasMore,false);assert.equal(result.total,null);
 }finally{pool.query=old;clearCatalogCaches();}
});

test('lookahead respects the existing public page depth',async()=>{
 const old=pool.query;clearCatalogCaches();
 pool.query=async(sql,values)=>({rows:Array.from({length:values.at(-2)},(_,i)=>row(i))});
 try{
  const result=await listCars(query((CATALOG_MAX_PAGES-1)*CATALOG_PAGE_SIZE));
  assert.equal(result.items.length,CATALOG_PAGE_SIZE);assert.equal(result.hasMore,false);
 }finally{pool.query=old;clearCatalogCaches();}
});

test('deferred cards and independent counts preserve the same text fallback across pages',async()=>{
 const old=pool.query;clearCatalogCaches();
 pool.query=async(sql,values)=>{
  const exact=values.includes('%surpassing%');
  if(sql.startsWith('SELECT count(*)'))return {rows:[{total:exact?0:60}]};
  const offset=values.at(-1),limit=values.at(-2);
  return {rows:exact?[]:Array.from({length:Math.max(0,Math.min(limit,60-offset))},(_,i)=>row(offset+i))};
 };
 try{
  const first=query(0);first.set('text','Surpassing');
  assert.equal((await listCars(first)).items.length,48);
  const second=query(48);second.set('text','Surpassing');
  assert.equal((await listCars(second)).items.length,12);
  const stats=new URLSearchParams({summary:'only',text:'Surpassing'});
  assert.equal((await listCars(stats)).total,60);
 }finally{pool.query=old;clearCatalogCaches();}
});

test('exhausted exact matches do not switch later pages to a broader text fallback',async()=>{
 const old=pool.query,calls=[];clearCatalogCaches();
 pool.query=async(sql,values)=>{
  calls.push(values);
  assert.ok(!sql.startsWith('SELECT count(*)'),'card lookup must not count');
  return {rows:values.at(-1)===0?[row(1)]:[]};
 };
 try{
  const next=query(48);next.set('text','Surpassing');
  assert.equal((await listCars(next)).items.length,0);
  assert.equal(calls.length,2);assert.ok(calls.every(values=>values.includes('%surpassing%')));
 }finally{pool.query=old;clearCatalogCaches();}
});

test('initial newest order leaves addresses clean and keeps other chosen sorts explicit',()=>{
 assert.equal(catalogSort(new URLSearchParams()),'newest');
 assert.equal(catalogSort(new URLSearchParams('sort=default')),'newest');
 for(const search of ['', 'sort=default','sort=newest','sort=default&seed=s3'])assert.equal(catalogHref(search),'/catalog');
 assert.equal(catalogHref('brand=BMW&page=2&sort=newest'),'/catalog/bmw?page=2');
 assert.equal(catalogHref('brand=BMW&page=2&sort=price_asc'),'/catalog/bmw?page=2&sort=price_asc');
 assert.equal(catalogHref('brand=BMW&page=2&sort=price_desc'),'/catalog/bmw?page=2&sort=price_desc');
});

test('prepared SEO facts reuse build data without extra catalog queries',()=>{
 const snapshot=prepareCatalogPageFacts({activeCars:100,stock:new Map([['/catalog/bmw',40]]),changed:new Map([['/catalog','2026-10-27']]),modelRows:[{brand:'BMW',model:'X5',count:20}]});
 assert.equal(snapshot.routes['/catalog'].total,100);assert.equal(snapshot.routes['/catalog/bmw'].total,40);
 assert.equal(snapshot.routes['/catalog'].changedAt,'2026-10-27');assert.equal(snapshot.models[0].count,20);
});

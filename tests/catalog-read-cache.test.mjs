import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../server/db.mjs';
import {getCatalogMeta,relatedCarCandidates,clearCatalogCaches} from '../server/repository.mjs';
import {priceRating,clearPriceRatingCache} from '../server/price-rating.mjs';

const car=model=>({brand:'BMW',model,source:'Che168',chinaPrice:100000});
test('model comparisons share in-flight work and evict only least-used models',async()=>{
 clearPriceRatingCache();let reads=0;
 const db={query:async()=>{reads++;await new Promise(setImmediate);return {rows:[]};}};
 await Promise.all([priceRating(car('hot'),{db}),priceRating(car('hot'),{db})]);assert.equal(reads,1);
 for(let i=0;i<199;i++)await priceRating(car(String(i)),{db});
 await priceRating(car('hot'),{db});await priceRating(car('new'),{db});
 const before=reads;await priceRating(car('hot'),{db});assert.equal(reads,before);
 await priceRating(car('0'),{db});assert.equal(reads,before+1);
 clearPriceRatingCache();await priceRating(car('hot'),{db});assert.equal(reads,before+2);
});

test('related cards reuse one model selection without an unused count',async()=>{
 clearCatalogCaches();const old=pool.query;const queries=[];
 pool.query=async(sql,args)=>{queries.push({sql,args});await new Promise(setImmediate);return {rows:[]};};
 try{
  await Promise.all([relatedCarCandidates('BMW','5 Series'),relatedCarCandidates('BMW','5 Series')]);
  assert.equal(queries.length,1);assert.doesNotMatch(queries[0].sql,/count\(\*\)|max\(l.last_seen_at\)/);
  assert.deepEqual(queries[0].args,['BMW',['5 Series'],13]);
  clearCatalogCaches();await relatedCarCandidates('BMW','5 Series');assert.equal(queries.length,2);
 }finally{pool.query=old;clearCatalogCaches();}
});

test('different brands share the full-catalog scan, with separate country counts',async()=>{
 clearCatalogCaches();const old=pool.query;let wide=0,narrow=0;
 pool.query=async sql=>{
  if(sql.includes('GROUPING(v.brand)')){wide++;return {rows:[
   {g_brand:0,g_source:1,brand:'BMW',brand_count:5},
   {g_brand:0,g_source:1,brand:'BYD',brand_count:3},
   {g_brand:0,g_source:0,brand:'BMW',source:'Che168',source_count:2},
   {g_brand:0,g_source:0,brand:'BMW',source:'Encar',source_count:3},
   {g_brand:0,g_source:0,brand:'BYD',source:'Guazi',source_count:3},
  ]};}
  narrow++;return {rows:[]};
 };
 try{
  const [bmw,byd]=await Promise.all([getCatalogMeta(null,'BMW'),getCatalogMeta(null,'BYD')]);
  assert.equal(wide,1);assert.equal(narrow,2);
  assert.deepEqual(bmw.brands,byd.brands);
  assert.deepEqual(bmw.countries,[{origin:'china',count:2},{origin:'korea',count:3}]);
  assert.deepEqual(byd.countries,[{origin:'china',count:3},{origin:'korea',count:0}]);
  await getCatalogMeta(null,'BMW');assert.equal(narrow,2);
  clearCatalogCaches();await getCatalogMeta(null,'BMW');assert.equal(wide,2);
 }finally{pool.query=old;clearCatalogCaches();}
});

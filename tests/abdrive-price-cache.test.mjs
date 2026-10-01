import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRussianPriceIndex} from '../server/abdrive/price-index.mjs';
import {RU_PRICING} from '../config/ru-pricing.mjs';
const date=new Date('2026-10-01T12:00:00Z');
const row={id:'che168-1',source:'Che168',city:'shanghai',brand:'Test',model:'Car',price_cny:100000,model_year:2022,powertrain:'ДВС',specifications:{engineVolume:1.5,enginePower:150}};
test('prewarmed Russian prices survive process restart without a full catalog scan',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'abdrive-prices-'));
 try{
  const cacheFile=join(directory,'prices.json');let queries=0;
  const options={getRates:async()=>RU_PRICING.rates,now:()=>date,cacheFile};
  const built=await createRussianPriceIndex({query:async()=>{queries++;return {rows:[row]};}},options)();
  assert.equal(queries,1);assert.equal(built.prices.size,1);
  const restored=await createRussianPriceIndex({query:async()=>{throw new Error('must not scan at startup');}},options)();
  assert.deepEqual([...restored.prices],[...built.prices]);assert.deepEqual(restored.rates,built.rates);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('missing, corrupted, expired and incompatible snapshots are rebuilt before use',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'abdrive-prices-'));
 try{
  const cacheFile=join(directory,'prices.json');let queries=0;
  for(const contents of ['broken',JSON.stringify({format:1,version:RU_PRICING.version,date:'2026-09-30',prices:[['old',1]]}),JSON.stringify({format:0,version:RU_PRICING.version,date,prices:[['old',1]]})]){
   await writeFile(cacheFile,contents);
   const index=await createRussianPriceIndex({query:async()=>{queries++;return {rows:[row]};}},{getRates:async()=>RU_PRICING.rates,now:()=>date,cacheFile})();
   assert.equal(index.prices.has('old'),false);assert.equal(index.prices.has(row.id),true);
  }
  assert.equal(queries,3);
 }finally{await rm(directory,{recursive:true,force:true});}
});

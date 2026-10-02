import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPricingCoverage} from '../server/abdrive/pricing-coverage.mjs';
import {createRussianPriceIndex} from '../server/abdrive/price-index.mjs';
import {RU_PRICING} from '../config/ru-pricing.mjs';
const date=new Date('2026-10-02T00:00:00Z');

test('Coverage counts each listing and groups actionable variants without retaining private source data',()=>{
 const audit=createPricingCoverage({version:'test',date});
 const row={id:'one',source:'Encar',brand:'Kia',model:'Example',model_year:2023,powertrain:'Гибрид',source_payload:{rawModel:'HEV 1.6',sellerPhone:'SECRET'}};
 audit.add(row,{status:'estimated',range:null});
 audit.add(row,{status:'estimated',range:{min:2000000,max:2200000}});
 for(let n=0;n<4;n++)audit.add({...row,id:String(n)},{status:'estimated',range:{min:2000000,max:3000000}});
 audit.add(row,{status:'unavailable',reason:'engine_specs_missing'});
 audit.add({...row,source_payload:{rawModel:'PHEV 1.6'}},{status:'unavailable',reason:'engine_specs_missing'});
 const report=audit.finish();
 assert.deepEqual(report.summary,{total:8,point:1,range:5,wideRange:4,unavailable:2,reasons:{power_range:1,power_range_wide:4,engine_specs_missing:2}});
 assert.equal(report.groups.length,4);assert.equal(report.groups[0].count,4);assert.equal(report.groups[0].examples.length,3);
 assert.doesNotMatch(JSON.stringify(report),/SECRET|sellerPhone/);
});

test('Price refresh persists coverage for all rows, including missing prices, and restores without a scan',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'abdrive-coverage-'));
 try{
  const path=join(dir,'index.json');
  const rows=[{id:'known',source:'Che168',price_cny:100000,model_year:2022,powertrain:'ДВС',specifications:{engineVolume:1.5,enginePower:150}},
   {id:'unknown',source:'Encar',brand:'Unknown',model:'Unknown',model_year:2022,powertrain:'ДВС'}];
  let calls=0;const db={query:async()=>{calls++;return {rows};}};
  const options={getRates:async()=>RU_PRICING.rates,now:()=>date,cacheFile:path};
  const index=await createRussianPriceIndex(db,options)();
  assert.equal(index.prices.size,1);assert.equal(index.coverage.summary.total,2);assert.equal(index.coverage.summary.unavailable,1);
  const saved=JSON.parse(await readFile(path,'utf8'));assert.deepEqual(saved.coverage,index.coverage);
  const restored=await createRussianPriceIndex(db,options)();assert.equal(calls,1);assert.deepEqual(restored.coverage,index.coverage);
 }finally{await rm(dir,{recursive:true,force:true});}
});

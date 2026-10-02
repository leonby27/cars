import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRussianPriceIndex} from '../server/abdrive/price-index.mjs';
import {RU_PRICING} from '../config/ru-pricing.mjs';

const date=new Date('2026-10-01T12:00:00Z');
const row={id:'che168-1',status:'active',source:'Che168',city:'shanghai',brand:'Test',model:'Car',price_cny:100000,model_year:2022,powertrain:'ДВС',specifications:{engineVolume:1.5,enginePower:150}};

function fakeCatalog(clock){
 const rows=new Map([[row.id,{...row}]]),stats={full:0,incremental:0,revision:0};
 let changedAt=+date;
 return {rows,stats,
  change(id,patch){rows.set(id,{...(rows.get(id)||row),id,...patch});changedAt=+clock();},
  async query(sql,args=[]){
   if(sql.includes('max(content_changed_at)')){stats.revision++;return {rows:[{listing_changed:new Date(changedAt),vehicle_changed:null,sold_changed:null}]};}
   if(sql.includes('NOT EXISTS (SELECT 1 FROM catalog_listings'))return {rows:[]};
   if(sql.includes('l.id=ANY($1::text[])'))return {rows:args[0].map(id=>rows.get(id)).filter(Boolean)};
   if(sql.includes('l.content_changed_at>$1')){stats.incremental++;return {rows:[...rows.values()].filter(item=>item.changedAt>+args[0]&&item.changedAt<=+args[1]).map(({id})=>({id}))};}
   if(sql.includes("l.status='active' AND l.id>$1")){stats.full++;return {rows:[...rows.values()].filter(item=>item.status==='active'&&item.id>args[0])};}
   throw new Error('Unexpected query: '+sql);
  },
 };
}

test('prewarmed prices survive a code-only deploy and hours of traffic without a full scan',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'abdrive-prices-'));
 try{
  const cacheFile=join(directory,'prices.json');let clock=+date;
  const db=fakeCatalog(()=>clock),options={getRates:async()=>RU_PRICING.rates,now:()=>new Date(clock),cacheFile};
  const built=await createRussianPriceIndex(db,options)({requireFresh:true});
  assert.equal(db.stats.full,1);assert.equal(built.prices.size,1);
  clock+=2*60*60_000;
  const restored=await createRussianPriceIndex(db,options)({requireFresh:true});
  assert.equal(db.stats.full,1);
  assert.deepEqual([...restored.prices],[...built.prices]);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('an imported price change updates only that listing and remains saved after restart',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'abdrive-prices-'));
 try{
  const cacheFile=join(directory,'prices.json');let clock=+date;
  const db=fakeCatalog(()=>clock),options={getRates:async()=>RU_PRICING.rates,now:()=>new Date(clock),cacheFile};
  const prices=createRussianPriceIndex(db,options),before=await prices({requireFresh:true});
  clock+=60_000;db.change(row.id,{price_cny:120000,changedAt:clock});
  clock+=6*60_000;
  const after=await prices({requireFresh:true});
  assert.ok(after.prices.get(row.id)>before.prices.get(row.id));
  assert.equal(db.stats.full,1);assert.equal(db.stats.incremental,1);
  assert.equal(JSON.parse(await readFile(cacheFile,'utf8')).format,2);
  const restarted=await createRussianPriceIndex(db,options)({requireFresh:true});
  assert.equal(restarted.prices.get(row.id),after.prices.get(row.id));
  assert.equal(db.stats.full,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('a new exchange-rate period rebuilds all prices once',async()=>{
 let clock=+date,rates=RU_PRICING.rates;
 const db=fakeCatalog(()=>clock),prices=createRussianPriceIndex(db,{getRates:async()=>rates,now:()=>new Date(clock)});
 await prices({requireFresh:true});
 clock=Date.parse('2026-10-16T12:00:00Z');rates={...rates,date:'2026-10-16',CNY:rates.CNY*1.1};
 await prices({requireFresh:true});await prices({requireFresh:true});
 assert.equal(db.stats.full,2);
});

test('missing, corrupted and incompatible snapshots are rebuilt before use',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'abdrive-prices-'));
 try{
  const cacheFile=join(directory,'prices.json');let queries=0;
  for(const contents of ['broken',JSON.stringify({format:1,version:RU_PRICING.version,date:'2025-09-30',prices:[['old',1]]}),JSON.stringify({format:0,version:RU_PRICING.version,date,prices:[['old',1]]})]){
   await writeFile(cacheFile,contents);
   const index=await createRussianPriceIndex({query:async()=>{queries++;return {rows:[row]};}},{getRates:async()=>RU_PRICING.rates,now:()=>date,cacheFile})({requireFresh:true});
   assert.equal(index.prices.has('old'),false);assert.equal(index.prices.has(row.id),true);
  }
  assert.equal(queries,3);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('Russian index and detail quote share reference inputs, and old reference versions rebuild',async()=>{
 const {estimateRussianOffer}=await import('../server/abdrive/pricing.mjs');
 const car={...row,brand:'Kia',model:'Niro',model_year:2021,powertrain:'Электромобиль',drivetrain:'Передний',battery_kwh:64,specifications:{},source_payload:{motorPowerKw:150}};
 const directory=await mkdtemp(join(tmpdir(),'abdrive-reference-'));
 try{
  const cacheFile=join(directory,'prices.json');
  await writeFile(cacheFile,JSON.stringify({format:1,version:'ru-moscow-market-logistics-2026-10-01',date,prices:[[car.id,1]]}));
  let queries=0;
  const index=await createRussianPriceIndex({query:async sql=>{queries++;assert.match(sql,/v\.drivetrain/);assert.match(sql,/v\.battery_kwh/);return {rows:[car]};}},{getRates:async()=>RU_PRICING.rates,now:()=>date,cacheFile})({requireFresh:true});
  assert.equal(queries,1);
  assert.equal(index.prices.get(car.id),estimateRussianOffer(car,{now:date}).totalAmount);
 }finally{await rm(directory,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import http from 'node:http';
import {once} from 'node:events';
process.env.SITE_ID='abdrive';
const {createRussianCatalog}=await import('../server/abdrive/catalog.mjs');
const {createAbdriveHandler}=await import('../server/abdrive/handler.mjs');
const {createFrontend}=await import('../server/abdrive/frontend.mjs');
const {RU_PRICING}=await import('../config/ru-pricing.mjs');
const {getSiteProfile}=await import('../config/sites/index.mjs');
const date=new Date('2026-10-02T12:00:00Z');
const row={id:'encar-123',source:'Encar',brand:'Test',model:'Car',model_year:2022,powertrain:'ДВС',
 price_cny:20_000_000,status:'active',mileage_km:10000,images:[],source_payload:{},specifications:{engineVolume:1.5,enginePower:150}};
function fixture(){
 let clock=+date,reads=0,record={...row},index={date,rates:RU_PRICING.rates};
 const catalog=createRussianCatalog({query:async()=>{reads++;return {rows:record?[record]:[]};}},
  {now:()=>new Date(clock),getPriceIndex:async()=>index});
 return {catalog,get reads(){return reads;},advance:ms=>{clock+=ms;},setRecord:value=>{record=value;},
  newRates:()=>{index={date,rates:{...RU_PRICING.rates,KRW:RU_PRICING.rates.KRW*1.1}};}};
}

test('card aliases share data; imports, rates and a fresh availability check invalidate it',async()=>{
 const f=fixture();
 const [a,b]=await Promise.all([f.catalog.get('kr-123'),f.catalog.get('encar-123')]);
 assert.equal(f.reads,1);assert.equal(a.car.id,b.car.id);
 f.setRecord({...row,price_cny:30_000_000});f.advance(60000);
 const changed=await f.catalog.get('kr-123');assert.equal(f.reads,2);
 assert.ok(changed.car.offer.totalAmount>a.car.offer.totalAmount);
 f.newRates();const rated=await f.catalog.get('kr-123');assert.equal(f.reads,3);
 assert.ok(rated.car.offer.totalAmount>changed.car.offer.totalAmount);
 f.setRecord(null);assert.equal(await f.catalog.get('kr-123',{fresh:true}),null);
 assert.equal(await f.catalog.get('kr-123'),null);assert.equal(f.reads,4);
});

test('actual HTML followed by the public API performs only one card query',
 {skip:!existsSync(resolve('dist-abdrive/ssr/entry-server.js'))},async()=>{
 const f=fixture(),site=getSiteProfile('abdrive');
 const frontend=await createFrontend({buildDirectory:resolve('dist-abdrive'),catalog:f.catalog,site});
 const server=http.createServer(createAbdriveHandler({catalog:f.catalog,siteDatabase:{},site,frontend}));
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const html=await fetch(base+'/cars/kr-123');assert.equal(html.status,200);await html.text();
  const api=await fetch(base+'/api/cars/kr-123');assert.equal(api.status,200);
  assert.equal((await api.json()).id,row.id);assert.equal(f.reads,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

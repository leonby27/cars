import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createAbdriveHandler} from '../server/abdrive/handler.mjs';
import {catalogSelection,publicCar} from '../server/abdrive/catalog.mjs';
import {getSiteProfile} from '../config/sites/index.mjs';
const site=getSiteProfile('abdrive');

test('RU catalog never presents the legacy Belarus price as RUB',()=>{
 const car=publicCar({id:'che168-1',source:'Che168',brand:'BYD',model:'Seal',model_year:2024,mileage_km:1000,estimated_total_usd:12345,source_url:'private',source_payload:{contact:'private'},images:['https://example.com/a.jpg','javascript:alert(1)']});
 assert.equal(publicCar({images:[],mileage_km:null}).mileage,null);
 assert.equal(publicCar({images:[],mileage_km:0}).mileage,0);
 assert.throws(()=>catalogSelection(new URLSearchParams({yearMin:'2025',yearMax:'2020'})),/invalid_filter/);
 assert.equal(car.offer.currency,'RUB');assert.equal(car.offer.totalAmount,null);
 assert.equal(car.source_url,undefined);assert.equal(car.source_payload,undefined);assert.equal(car.estimated_total_usd,undefined);
 assert.equal(car.images.length,1);
 const selection=catalogSelection(new URLSearchParams({brand:"O'Reilly",q:"a%_",country:'korea'}));
 assert.doesNotMatch(selection.where,/O'Reilly/);assert.ok(selection.args.includes("O'Reilly"));assert.ok(selection.args.includes('%a\\%\\_%'));
 assert.throws(()=>catalogSelection(new URLSearchParams({sort:'price'})),/price_filter_unavailable/);
 for(const params of [{landedMax:'20000'},{priceCnyMax:'20000'}])assert.throws(()=>catalogSelection(new URLSearchParams(params)),/price_filter_unavailable/);
 for(const params of [{currency:'BYN'},{refund50:'1'}])assert.throws(()=>catalogSelection(new URLSearchParams(params)),/invalid_filter/);
 assert.throws(()=>catalogSelection(new URLSearchParams({page:'1000000'})),/invalid_page/);
 for(const sort of ['constructor','__proto__','toString'])assert.throws(()=>catalogSelection(new URLSearchParams({sort})),/invalid_sort/);
});

test('RU HTTP: only own routes, origin, consent and server snapshots; no account or BY tools exposed',async()=>{
 const queries=[];let connected=0;
 const database={connect:async()=>{connected++;return {query:async(sql,values)=>{queries.push({sql,values});return {rowCount:1,rows:[{id:'test'}]};},release(){}};}};
 const car={id:'che168-1',title:'Car',offer:{status:'unavailable',totalAmount:null}};
 const catalog={list:async()=>({cars:[car],total:1}),meta:async()=>({brands:[]}),get:async(id)=>id==='missing'?null:{car,sourceVersion:'server-v1',sourceUrl:'https://source.example/car'}};
 const server=http.createServer(createAbdriveHandler({catalog,siteDatabase:database,site,consentVersion:'test-v1',log:()=>{}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 const post=(body,origin=site.origin)=>fetch(base+'/api/leads',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/api/health').then(r=>r.json())).site,'abdrive');
  assert.equal((await fetch(base+'/api/catalog').then(r=>r.json())).total,1);
  assert.equal((await fetch(base+'/api/account')).status,404);
  assert.equal((await fetch(base+'/api/market/compare')).status,404);
  const input={requestKey:randomUUID(),name:'Test',phone:'+79991234567',consent:true,listingId:'che168-1',snapshot:{total:1},market:'BY'};
  assert.equal((await post(input,'https://abcars.by')).status,403);
  assert.equal((await post({...input,consent:false})).status,400);
  assert.equal((await post({...input,destinationId:'minsk'})).status,400);
  assert.equal((await post({...input,listingId:'missing'})).status,409);
  assert.equal(connected,0);
  assert.equal((await post(input)).status,202);
  const saved=queries.find(q=>q.sql.startsWith('INSERT INTO leads'));
  assert.equal(saved.values[3],'+79991234567');assert.equal(saved.values[4],'moscow');
  assert.deepEqual(saved.values[7],{siteId:'abdrive',market:'RU',car,sourceVersion:'server-v1',sourceUrl:'https://source.example/car',assignment:'owner'});
  assert.ok(queries.some(q=>q.sql.startsWith('INSERT INTO lead_notifications')));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

test('unconfigured intake leaves catalogue available without accepting personal data',async()=>{
 let writes=0;
 const server=http.createServer(createAbdriveHandler({site,catalog:{list:async()=>({cars:[]})},siteDatabase:{connect(){writes++;}},log:()=>{}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/api/catalog')).status,200);
  assert.equal((await fetch(base+'/api/leads',{method:'POST',headers:{origin:site.origin,'content-type':'application/json'},body:'{}'})).status,503);
  assert.equal(writes,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

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
 assert.equal(catalogSelection(new URLSearchParams({sort:'price'})).priced,true);
 assert.equal(catalogSelection(new URLSearchParams({landedMax:'2000000'})).max,2000000);
 assert.throws(()=>catalogSelection(new URLSearchParams({priceCnyMax:'20000'})),/invalid_filter/);
 for(const params of [{currency:'BYN'},{refund50:'1'}])assert.throws(()=>catalogSelection(new URLSearchParams(params)),/invalid_filter/);
 assert.throws(()=>catalogSelection(new URLSearchParams({page:'1000000'})),/invalid_page/);
 for(const sort of ['constructor','__proto__','toString'])assert.throws(()=>catalogSelection(new URLSearchParams({sort})),/invalid_sort/);
});

test('RU HTTP: only own routes, origin, consent and server snapshots; account authentication isolated and BY tools not exposed',async()=>{
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
  assert.equal((await fetch(base+'/api/account')).status,401);
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

test('RU detail preserves technical specs but exposes inspection values only after own login',async()=>{
 const specs={groups:[{name:'Engine',items:[{name:'Displacement (mL)',value:'1395',privateNote:'hidden'}]},{name:'Осмотр: Кузов',items:[{name:'Дверь',value:'окрашена'}]}],internal:'hidden'};
 const car=publicCar({source_payload:{technicalSpecs:specs,contact:'hidden'},images:[]},{detail:true});
 assert.equal(car._summary,false);assert.equal(publicCar({images:[]})._summary,true);
 assert.equal(car.technicalSpecs.count,1);assert.equal(car.technicalSpecs.groups[0].items[0].value,'1395');
 assert.doesNotMatch(JSON.stringify(car),/окрашена|privateNote|hidden/);assert.deepEqual(car.reportPreview,[{name:'Осмотр: Кузов'}]);
 let reportReads=0;
 const catalog={brandGuide:async brand=>({brand,total:7}),report:async()=>{reportReads++;return [specs.groups[1]];}};
 const database={query:async()=>({rows:[{id:'ru-account'}]})};
 const server=http.createServer(createAbdriveHandler({catalog,siteDatabase:database,site,log:()=>{}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  const guide=await fetch(base+'/api/brand-guide?brand=BYD');assert.equal(guide.status,200);assert.equal((await guide.json()).total,7);
  for(const cookie of ['',`abcars_session=${'a'.repeat(43)}`])assert.equal((await fetch(base+'/api/cars/1/report',{headers:{cookie}})).status,401);
  assert.equal(reportReads,0);
  const report=await fetch(base+'/api/cars/1/report',{headers:{cookie:`abdrive_session=${'a'.repeat(43)}`}});
  assert.equal(report.status,200);assert.equal(report.headers.get('cache-control'),'no-store');assert.equal((await report.json()).groups[0].items[0].value,'окрашена');assert.equal(reportReads,1);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

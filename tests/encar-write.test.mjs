import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertEncarCar } from '../scripts/lib/encar-write.mjs';

test('a refused history refresh updates price and availability without losing stored claims or technical facts', async()=>{
  const previous={sourceVehicleId:100,owners:3,transfers:2,claims:'2 страховых случая',claimsCount:2,totalLoss:true,
    inspection:{accident:true},incident:'осмотр: было ДТП',battery:77.4,batteryHealth:91,electricRange:400,range:400,
    evBattery:{soh:91},technicalSpecs:{groups:[{name:'Страховая история',items:[{name:'ДТП',value:'2'}]}]}};
  const car={externalId:'200',sourceVehicleId:100,sourcePrice:12000000,mileage:30000,historyUnavailable:true,
    owners:null,claims:null,totalLoss:null,technicalSpecs:null};
  const queries=[];
  const db={query:async(sql,args)=>{queries.push({sql,args});return {rows:[{source_payload:previous}]};}};
  let written;
  await upsertEncarCar(car,db,async(value,connection)=>{written=value;assert.equal(connection,db);});
  assert.match(queries[0].sql,/source='Encar'.*external_id=\$1 FOR UPDATE/);
  assert.deepEqual(queries[0].args,['200']);
  for(const [field,value] of Object.entries(previous)) if(field!=='incident') assert.deepEqual(written[field],value);
  assert.match(written.incident,/было ДТП/);
  assert.equal(written.sourcePrice,12000000);
  assert.equal(written.mileage,30000);
  assert.equal(written.historyUnavailable,true);
  assert.equal(car.owners,null,'the caller payload is not mutated');
});

test('a new car keeps explicit unknown history; a later verified history replaces the saved facts normally', async()=>{
  const db={query:async()=>({rows:[]})};
  const incomplete={externalId:'123',historyUnavailable:true,claims:null,totalLoss:null};
  assert.equal(await upsertEncarCar(incomplete,db,async car=>car),incomplete);
  const complete={externalId:'123',claims:'Без страховых случаев',claimsCount:0,totalLoss:false,incident:null};
  db.query=async()=>({rows:[{source_payload:{claims:'2 случая',claimsCount:2,totalLoss:true}}]});
  assert.deepEqual(await upsertEncarCar(complete,db,async car=>car),complete);
});

test('partial successful history preserves unknown facts and rows while explicit new values still replace old ones',async()=>{
  const previous={sourceVehicleId:100,owners:3,claimsCount:2,claims:'2 случая',totalLoss:true,
    inspection:{accident:true,waterlog:true},technicalSpecs:{groups:[{name:'Страховая история',items:[{name:'ДТП',value:'2'},{name:'Владельцы',value:'3'}]}]}};
  const car={externalId:'100',sourceVehicleId:100,owners:4,claimsCount:null,claims:null,totalLoss:null,
    inspection:{accident:false,waterlog:null},technicalSpecs:{groups:[{name:'Опции',items:[{name:'Новое',value:'есть'}]},{name:'Страховая история',items:[{name:'Владельцы',value:'4'}]}]}};
  const saved=await upsertEncarCar(car,{query:async()=>({rows:[{source_payload:previous}]})},async value=>value);
  assert.equal(saved.owners,4);
  assert.equal(saved.claimsCount,2);
  assert.equal(saved.totalLoss,true);
  assert.deepEqual(saved.inspection,{accident:false,waterlog:true});
  assert.deepEqual(saved.technicalSpecs.groups[1].items,[{name:'Владельцы',value:'4'},{name:'ДТП',value:'2'}]);
  assert.equal(saved.technicalSpecs.count,3);
  assert.equal(saved.historyUnavailable,true,'retained older facts must be retried in the next round');
});

test('previous history is never carried onto a different physical vehicle',async()=>{
  const db={query:async()=>({rows:[{source_payload:{sourceVehicleId:100}}]})};
  await assert.rejects(upsertEncarCar({externalId:'123',sourceVehicleId:101,historyUnavailable:true},db,
    ()=>assert.fail('a mismatched history cannot be saved')),/другой машине/);
});

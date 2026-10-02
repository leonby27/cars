import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {russianPowertrain} from '../server/abdrive/powertrain.mjs';
import {estimateRussianOffer} from '../server/abdrive/pricing.mjs';
import {russianPriceRows} from '../src/markets/ru-price-details.js';
const now=new Date('2026-10-02T00:00:00Z');
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url)));
const tucson=fixture('abdrive-encar-42023581.json');
const variants=fixture('abdrive-korea-variants.json');
const car=model=>structuredClone(variants.find(r=>r.model===model));

test('Korean dictionary supplies known engines for existing imports, independent of listing ID',()=>{
 for(const [row,hp] of [[tucson,186],[car('Carnival'),202],[car('K5'),160],[car('Elantra'),123]]){
  const original=structuredClone(row),offer=estimateRussianOffer(row,{now});
  assert.equal(offer.status,'estimated');assert.equal(offer.range,null);
  assert.ok(Math.abs(offer.inputs.icePowerKw-hp*.7355)<.001);
  assert.ok(offer.inputs.engineReference.referenceIds.length);
  assert.deepEqual(estimateRussianOffer({...row,id:'new-import'},{now}),offer);
  assert.deepEqual(row,original);
 }
 const offer=estimateRussianOffer(tucson,{now});
 assert.equal(offer.totalAmount,4040000);assert.equal(offer.rows.find(r=>r.id==='utilization').amount,1492800);
});

test('Hybrid dictionary reads ICE separately from combined horsepower and keeps motor uncertainty',()=>{
 const row=car('Grandeur');row.specifications.enginePower=200;row.source_payload.engine='2.4L 200 HP';
 const power=russianPowertrain(row);
 assert.equal(power.iceHp,159);assert.equal(power.electricPeakKw,52*.7355);
 assert.equal(power.continuousKw,null);assert.equal(power.motorPower.method,'unknown');
 assert.ok(estimateRussianOffer(row,{now}).range);
 const explicit=russianPowertrain({...row,source_payload:{...row.source_payload,enginePowerKw:118,motorThirtyMinutePowerKw:12}});
 assert.equal(explicit.iceKw,118);assert.equal(explicit.motorPower.minKw,12);assert.equal(explicit.motorPower.method,'document');
});

test('Conflicting variants remain a bounded ICE range with a relevant tooltip',()=>{
 const row=car('Mohave'),power=russianPowertrain(row),quote=estimateRussianOffer(row,{now});
 assert.equal(power.icePower.minKw,249*.7355);assert.equal(power.icePower.maxKw,260*.7355);
 assert.ok(quote.range.max>quote.range.min);
 const text=russianPriceRows({source:row.source,offer:quote}).find(r=>r.id==='duty').description;
 assert.match(text,/Мощность ДВС/);assert.doesNotMatch(text,/30-минутной/);
});

test('Korean lookup never overrides source power or fills an unsupported model, year or origin',()=>{
 const row=car('Carnival');
 const power=russianPowertrain({...row,source_payload:{...row.source_payload,engineHorsepower:190}});
 assert.equal(power.iceHp,190);assert.equal(power.icePower.minKw,190*.7355);
 for(const change of [{brand:'Unknown'},{model:'Unknown'},{model_year:1991},{source:'Che168'}]){
  const quote=estimateRussianOffer({...row,...change},{now});assert.equal(quote.status,'unavailable');
 }
});

test('Regional grade and generation constraints exclude N Line and distinguish K8 facelift',()=>{
 const ordinary=car('Elantra');
 const nline=russianPowertrain({...ordinary,source_payload:{...ordinary.source_payload,rawModel:'1.6 Turbo N Line'}});
 assert.ok(!nline.engineReference?.referenceIds.includes('avante-cn7-kr-16'));
 const n=russianPowertrain({...ordinary,source_payload:{...ordinary.source_payload,engineCc:1998,rawModel:'2.0 N'}});
 assert.equal(n.iceHp,280);
 const k8=car('K8');assert.equal(russianPowertrain(k8).electricPeakKw,44.2);
 assert.equal(russianPowertrain({...k8,model_year:2025,source_payload:{...k8.source_payload,rawSeries:'더 뉴 K8 하이브리드'}}).electricPeakKw,47.7);
});

test('AT abbreviation classifies parallel hybrids without overriding explicit series fuel',()=>{
 const row={source:'Che168',model_year:2025,powertrain:'Гибрид',source_payload:{transmission:'AT',engineCc:1498,engineHorsepower:110,motorPowerKw:120}};
 assert.equal(russianPowertrain(row).kind,'parallel');
 assert.equal(russianPowertrain({...row,source_payload:{...row.source_payload,sourceFuelType:'Range Extender'}}).kind,'series');
});

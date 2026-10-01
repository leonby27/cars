import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveRussianMotorPower} from '../server/abdrive/power-reference.mjs';
import {russianPowertrain} from '../server/abdrive/powertrain.mjs';
import {estimateRussianOffer} from '../server/abdrive/pricing.mjs';
import {RU_POWER_REFERENCE,RU_POWER_SOURCES} from '../config/ru-power-reference.mjs';
import {russianPriceRows} from '../src/markets/ru-price-details.js';
const qin=JSON.parse(readFileSync(new URL('./fixtures/abdrive-qin-plus-58676125.json',import.meta.url)));
const now=new Date('2026-10-01T12:00:00Z');
const tesla={brand:'Tesla',model:'Model Y',year:2024,kind:'electric',drive:'all',variant:'long-range',electricPeakKw:331};

test('Qin 58676125 uses matching motor analogue, net ICE and a single utilization band',()=>{
 const offer=estimateRussianOffer(qin,{now});
 assert.equal(offer.status,'estimated');assert.equal(offer.inputs.continuousPowerKw,null);
 assert.equal(offer.inputs.motorPower.method,'reference');assert.deepEqual(offer.inputs.motorPower.referenceIds,['byd-tz210xyb-120']);
 assert.equal(offer.inputs.icePowerKw,70);assert.equal(offer.inputs.motorPower.minKw,55);
 assert.equal(offer.rows.find(r=>r.id==='utilization').amount,900000);
 assert.equal(offer.totalAmount,2840000);assert.equal(offer.range,null);
 const customs=russianPriceRows({offer,source:qin.source}).find(r=>r.id==='duty');
 assert.match(customs.description,/справочнику/);assert.doesNotMatch(customs.description,/пиковая|верхняя граница/);
 const documented=estimateRussianOffer({...qin,source_payload:{...qin.source_payload,motorThirtyMinutePowerKw:40}},{now});
 assert.equal(documented.inputs.motorPower.method,'document');assert.equal(documented.rows.find(r=>r.id==='utilization').amount,3400);
 assert.equal(estimateRussianOffer({...qin,source_payload:{...qin.source_payload,motorThirtyMinutePowerKw:130}},{now}).reason,'motor_power_conflict');
});

test('Motor analogue requires the same brand, scheme, code, peak, count and drive',()=>{
 const facts={brand:'BYD',year:2026,kind:'parallel',motorCode:'TZ210XYB',motorCount:1,drive:'front',electricPeakKw:120};
 assert.equal(resolveRussianMotorPower(facts).minKw,55);
 for(const change of [{brand:'Geely'},{kind:'electric'},{motorCode:'TZ210XYD'},{motorCount:2},{drive:'all'},{electricPeakKw:160},{year:2020}])assert.equal(resolveRussianMotorPower({...facts,...change}).method,'unknown');
});

test('Tesla reference respects generation, drivetrain and trim; unknown trim combines candidates',()=>{
 assert.equal(resolveRussianMotorPower(tesla).minKw,179);
 assert.equal(resolveRussianMotorPower({...tesla,variant:'performance'}).minKw,155);
 assert.equal(resolveRussianMotorPower({...tesla,year:2025}).minKw,165);
 const ambiguous=resolveRussianMotorPower({...tesla,variant:null});assert.equal(ambiguous.minKw,155);assert.equal(ambiguous.maxKw,179);
 for(const change of [{model:'Model Y L'},{brand:'BYD'},{drive:null},{year:2019},{electricPeakKw:100}])assert.equal(resolveRussianMotorPower({...tesla,...change}).method,'unknown');
});

test('EV variant data never leaks into hybrids or a different battery/peak',()=>{
 const facts={brand:'Kia',model:'Niro',kind:'electric',year:2022,drive:'front',electricPeakKw:150,battery:64};
 assert.equal(resolveRussianMotorPower(facts).minKw,28.68);
 assert.equal(resolveRussianMotorPower({...facts,battery:64.8}).minKw,36.77);
 for(const change of [{kind:'parallel'},{battery:null},{battery:65.4},{electricPeakKw:100}])assert.equal(resolveRussianMotorPower({...facts,...change}).method,'unknown');
});

test('Catalog database fields and full technical variant feed the same dictionary',()=>{
 const row={brand:'Tesla',model:'Model Y',model_year:2025,powertrain:'Электромобиль',drivetrain:'Полный',source_payload:{motorPowerKw:331,technicalSpecs:{groups:[{name:'Basic Specifications',items:[{name:'Model Name',value:'Model Y 2024 Long Range All-Wheel Drive'}]}]}}};
 const power=russianPowertrain(row);assert.equal(power.motorPower.minKw,179);
 const kia=russianPowertrain({brand:'Kia',model:'Niro',model_year:2021,powertrain:'Электромобиль',drivetrain:'Передний',battery_kwh:'64',source_payload:{motorPowerKw:150}});
 assert.equal(kia.motorPower.minKw,28.68);
});

test('Unknown vehicles retain uncertainty instead of using a universal coefficient',()=>{
 const unknown=resolveRussianMotorPower({...tesla,model:'Future Model'});
 assert.equal(unknown.method,'unknown');assert.equal(unknown.minKw,0);assert.equal(unknown.maxKw,331);
 assert.equal(resolveRussianMotorPower({...tesla,continuousKw:100}).minKw,100);
 assert.equal(resolveRussianMotorPower({kind:'parallel'}).maxKw,null);
});

test('Every reference has unique identity, bounded validity, evidence and physically possible power',()=>{
 assert.equal(new Set(RU_POWER_REFERENCE.map(e=>e.id)).size,RU_POWER_REFERENCE.length);
 for(const e of RU_POWER_REFERENCE){assert.ok(RU_POWER_SOURCES[e.source]?.url.startsWith('https://'));assert.ok(e.years[0]<=e.years[1]);const values=Array.isArray(e.kw)?e.kw:[e.kw];assert.ok(values.every(n=>n>0&&(!e.peak||n<=e.peak)));}
});

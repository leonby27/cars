import test from 'node:test';
import assert from 'node:assert/strict';
import {russianCustomsPayment} from '../src/markets/ru-customs.js';
import {selectRussianPrices} from '../server/abdrive/price-index.mjs';
import {russianModelText} from '../src/markets/ru-content.js';
import {catalogSelection} from '../server/abdrive/catalog.mjs';
const context={now:new Date('2026-10-01T12:00:00Z'),rates:{date:'2026-10-01',EUR:100}};
test('RU customs uses Russian personal ICE and electric payments, not Belarus exemption',()=>{
 const ice=russianCustomsPayment({kind:'ice',priceRub:1500000,year:2022,cc:1500,hp:150},context);
 assert.equal(ice.total,273741);assert.equal(ice.rows.find(r=>r.id==='duty').amount,255000);assert.ok(!ice.rows.some(r=>r.id==='vat'));
 const ev=russianCustomsPayment({kind:'ev',priceRub:2000000,year:2024,motorKw:50},context);
 assert.equal(ev.total,822941);assert.equal(ev.rows.find(r=>r.id==='vat').amount,506000);
 const high=russianCustomsPayment({kind:'ev',priceRub:2000000,year:2024,motorKw:200},context);
 assert.ok(high.total>ev.total);assert.ok(high.rows.find(r=>r.id==='excise').amount>0);
});
test('RU customs refuses incomplete power, invalid input, stale rates and expired tariff year',()=>{
 const input={kind:'ev',priceRub:2000000,year:2024,motorKw:50};
 for(const patch of [{motorKw:''},{priceRub:-1},{motorKw:'bad'},{year:2030},{kind:'invalid'}])assert.equal(russianCustomsPayment({...input,...patch},context),null);
 assert.equal(russianCustomsPayment(input,{...context,rates:{date:'2026-09-01',EUR:100}}),null);
 assert.equal(russianCustomsPayment(input,{...context,now:new Date('2027-01-01')}),null);
});
test('Russian price filtering sorts and paginates RUB totals; missing prices do not meet budget',()=>{
 const ids=['a','b','c','d'];const prices=new Map([['a',2000000],['b',1500000],['d',3000000]]);
 assert.deepEqual(selectRussianPrices(ids,prices,{max:2000000,sort:'price_asc',offset:1,limit:1}),{ids:['a'],total:2});
 assert.deepEqual(selectRussianPrices(ids,prices,{sort:'price_desc'}).ids,['d','a','b','c']);
 const query=catalogSelection(new URLSearchParams({landedMin:'1500000',landedMax:'2000000',sort:'price_asc'}));
 assert.equal(query.priced,true);assert.equal(query.min,1500000);assert.doesNotMatch(query.where,/estimated_total_usd/);
 assert.throws(()=>catalogSelection(new URLSearchParams({landedMin:'3',landedMax:'2'})),/invalid_filter/);
});
test('Russian reviews retain technical content and replace Belarus duty and geographic claims',()=>{
 const technical='Батарея 75 кВт·ч, разгон до 100 км/ч за 4,2 секунды.';
 const t=russianModelText({intro:[technical],sections:[{title:'Оформление',paragraphs:['Электромобили проходят таможню по нулевой ставке.','Доставка до Минска.']}]});
 assert.equal(t.intro[0],technical);assert.match(t.sections[0].paragraphs.join(' '),/НДС 22%/);assert.doesNotMatch(JSON.stringify(t),/Минск|нулевой ставке/);
});

import {estimateRussianDelivery,russianDeliverySize} from '../src/markets/ru-delivery.js';
import {estimateRussianOffer} from '../server/abdrive/pricing.mjs';
import {russianBrandGuide} from '../server/abdrive/brand-guide.mjs';
import {RU_PRICING} from '../config/ru-pricing.mjs';
test('Delivery changes by origin, city and dimensions and matches the car breakdown',()=>{
 assert.deepEqual(russianDeliverySize({source_payload:{technicalSpecs:{groups:[{name:'Body',items:[{name:'Length*Width*Height (mm)',value:'5100*1900*1700'},{name:'Curb weight (kg)',value:'2500'}]}]}}}),{lengthMm:5100,curbWeight:2500});
 const local=estimateRussianDelivery({city:'wulumuqi',model:'BYD Seal'});
 const distant=estimateRussianDelivery({city:'shanghai',model:'BYD Seal'});
 const large=estimateRussianDelivery({city:'shanghai',model:'BYD Seal',lengthMm:5100});
 assert.equal(local.total,199000);assert.equal(distant.total,249000);assert.equal(large.total,316000);
 const korea=estimateRussianDelivery({city:'busan'});assert.equal(korea.origin,'korea');assert.equal(korea.total,312000);
 assert.equal(estimateRussianDelivery({city:'seoul'}).total,323000);
 for(const [source,city] of [['Che168','shanghai'],['Encar','seoul']]){
  const row={source,city,brand:'Test',model:'Large',price_cny:100000,model_year:2022,powertrain:'ДВС',specifications:{engineVolume:1.5,enginePower:150,dimensions:'5100×1900×1700'}};
  const offer=estimateRussianOffer(row,{now:new Date('2026-10-01')});
  const delivery=estimateRussianDelivery({city,lengthMm:5100});
  assert.equal(offer.rows.filter(r=>['origin','sea','delivery'].includes(r.id)).reduce((sum,r)=>sum+r.amount,0),delivery.total);
  const fob=estimateRussianOffer({...row,source_payload:{priceBasis:'FOB',fobPort:source==='Encar'?'Busan':'Horgos',fobPriceUsd:20000}},{now:new Date('2026-10-01')});
  assert.ok(!fob.rows.some(r=>r.id==='origin'));
  assert.equal(fob.rows.find(r=>r.id==='delivery').amount,offer.rows.find(r=>r.id==='delivery').amount);
 }
});
test('Brand guide computes RUB percentiles and nonoverlapping budget groups from Russian prices',()=>{
 const rows=[{brand:'BYD',model:'Seal',ids:['a','b','c'],count:3,yearMin:2020,yearMax:2024},{brand:'BYD',model:'Han',ids:['d','e'],count:2,yearMin:2022,yearMax:2025}];
 const guide=russianBrandGuide('BYD',rows,{prices:new Map([['a',2000000],['b',2500000],['c',3500000],['d',5000000]])});
 assert.equal(guide.total,5);assert.equal(guide.pricedCount,4);assert.equal(guide.priceMedian,3000000);assert.equal(guide.priceP25,2375000);
 assert.deepEqual(Object.values(guide.budgets).map(b=>b.count),[1,1,1,1]);
 assert.deepEqual(guide.budgets.over50.models,['Han']);assert.equal(guide.models[0].model,'Seal');assert.ok(!('ids' in guide.models[0]));
 assert.equal(russianBrandGuide('Missing',rows,{prices:new Map()}),null);
});

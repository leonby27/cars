import test from 'node:test';
import assert from 'node:assert/strict';
import {customsFee,personalIceDuty,personalIceUtil,estimateRussianOffer,createRussianRates} from '../server/abdrive/pricing.mjs';
import {RU_PRICING} from '../config/ru-pricing.mjs';
const now=new Date('2026-10-01T12:00:00Z');
const row={source:'Che168',price_cny:100000,model_year:2022,powertrain:'ДВС',specifications:{engineVolume:1.5,enginePower:150}};
const estimate=(input=row,options={})=>estimateRussianOffer(input,{now,...options});

test('Russian personal import: customs thresholds, age and utilization 160 hp boundary',()=>{
 assert.equal(personalIceDuty({age:2,cc:1500,valueRub:800000,eurRub:100}),432000);
 assert.equal(personalIceDuty({age:2,cc:1500,valueRub:1000000,eurRub:100}),525000);
 assert.equal(personalIceDuty({age:4,cc:1500,valueRub:1000000,eurRub:100}),255000);
 assert.equal(personalIceDuty({age:6,cc:1500,valueRub:1000000,eurRub:100}),480000);
 assert.equal(personalIceUtil({age:2,cc:1500,hp:160}),3400);
 assert.equal(personalIceUtil({age:4,cc:1500,hp:160}),5200);
 assert.equal(personalIceUtil({age:2,cc:1500,hp:161}),900000);
 assert.equal(personalIceUtil({age:4,cc:1500,hp:161}),1492800);
 assert.equal(personalIceUtil({age:2,cc:3001,hp:150}),2584000);
 assert.equal(customsFee(1200000),4924);assert.equal(customsFee(1200001),13541);
 assert.equal(customsFee(10000001),73860);
});
test('Moscow estimate sums independent RUB rows, ignores BY totals and preserves FOB coverage',()=>{
 const quote=estimate();assert.equal(quote.status,'estimated');assert.equal(quote.destinationId,'moscow');
 assert.equal(quote.rows.find(row=>row.id==='purchase').amount,1247320);
 assert.equal(quote.rows.find(row=>row.id==='duty').amount,241947);
 assert.equal(quote.rows.find(row=>row.id==='utilization').amount,5200);
 assert.equal(quote.subtotal,quote.rows.reduce((sum,row)=>sum+row.amount,0));
 assert.equal(quote.totalAmount,1990000);
 assert.deepEqual(estimate({...row,estimated_total_usd:1,source_payload:{totalUsd:1,estimatedTotalUsd:1}}),quote);
 const fob=estimate({...row,source:'Guazi',source_payload:{priceBasis:'FOB',fobPort:'Horgos',fobPriceUsd:20000}});
 assert.equal(fob.rows.some(row=>row.id==='origin'),false);
 assert.equal(fob.rows.find(row=>row.id==='purchase').amount,1671176);
 assert.equal(estimate({...row,source_payload:{priceBasis:'FOB',fobPort:'Shanghai',fobPriceUsd:20000}}).reason,'fob_quote_missing');
 const korea=estimate({...row,source:'Encar',price_cny:20000000,source_payload:{sourceCurrency:'KRW',sourcePrice:20000000}});
 assert.equal(korea.rows.find(row=>row.id==='purchase').amount,1230254);
 assert.equal(korea.rows.find(row=>row.id==='sea').amount,85000);
 assert.equal(korea.rows.find(row=>row.id==='delivery').amount,225000);
});
test('Insufficient facts, stale rates and unsupported years never produce a misleading total',()=>{
 for(const change of [{powertrain:'Электромобиль'},{powertrain:'Гибрид'},{specifications:{}},{price_cny:0},{model_year:2027},{source_payload:{sourceFuelType:'Gasoline + 48V Mild Hybrid System'}}]) {
  const quote=estimate({...row,...change});assert.equal(quote.status,'unavailable');assert.equal(quote.totalAmount,null);
 }
 assert.equal(estimate(row,{rates:{...RU_PRICING.rates,date:'2026-09-01'}}).reason,'rates_need_update');
 assert.equal(estimate(row,{now:new Date('2027-01-01')}).reason,'rules_need_update');
 const boundary=estimate({...row,model_year:2021});
 assert.equal(boundary.rows.find(row=>row.id==='duty').amount,455429);
 assert.ok(boundary.assumptions.some(text=>text.includes('границу')));
});
test('CBR refresh normalizes nominal KRW and preserves last good rates on failure',async()=>{
 let fail=false,calls=0,time=now;
 const getRates=createRussianRates({now:()=>time,fetchImpl:async()=>{calls++;if(fail)throw Error('offline');return {ok:true,text:async()=>'<ValCurs Date="01.10.2026">'+[['USD',1,84],['EUR',1,95],['CNY',1,12.5],['KRW',1000,62]].map(([c,n,v])=>`<Valute><CharCode>${c}</CharCode><Nominal>${n}</Nominal><Value>${v}</Value></Valute>`).join('')+'</ValCurs>'};}});
 const [a,b]=await Promise.all([getRates(),getRates()]);assert.equal(a.KRW,.062);assert.deepEqual(a,b);assert.equal(calls,1);
 fail=true;time=new Date(+now+3600001);assert.deepEqual(await getRates(),a);
});

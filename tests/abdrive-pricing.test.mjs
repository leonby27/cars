import test from 'node:test';
import assert from 'node:assert/strict';
import {customsFee,personalIceDuty,personalIceUtil,estimateRussianOffer,createRussianRates,personalElectricUtil,electricExcise} from '../server/abdrive/pricing.mjs';
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
 assert.equal(quote.totalAmount,1950000);
 assert.deepEqual(estimate({...row,estimated_total_usd:1,source_payload:{totalUsd:1,estimatedTotalUsd:1}}),quote);
 const fob=estimate({...row,source:'Guazi',source_payload:{priceBasis:'FOB',fobPort:'Horgos',fobPriceUsd:20000}});
 assert.equal(fob.rows.some(row=>row.id==='origin'),false);
 assert.equal(fob.rows.find(row=>row.id==='purchase').amount,1671176);
 assert.equal(estimate({...row,source_payload:{priceBasis:'FOB',fobPort:'Shanghai',fobPriceUsd:20000}}).reason,'fob_quote_missing');
 const korea=estimate({...row,source:'Encar',price_cny:20000000,source_payload:{sourceCurrency:'KRW',sourcePrice:20000000}});
 assert.equal(korea.rows.find(row=>row.id==='purchase').amount,1230254);
 assert.equal(korea.rows.find(row=>row.id==='sea').amount,84000);
 assert.equal(korea.rows.find(row=>row.id==='delivery').amount,182000);
});
test('Insufficient facts, stale rates and unsupported years never produce a misleading total',()=>{
 for(const change of [{powertrain:'Электромобиль'},{powertrain:'Гибрид'},{specifications:{}},{price_cny:0},{model_year:2027}]) {
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

test('Russian rates stay fixed for a half month and persist through a restart',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'abdrive-rates-'));
 try{
  let time=new Date('2026-10-02T00:00:00Z'),calls=0;
  const fetchImpl=async()=>{calls++;const day=time.getUTCDate()>=16?'16':'02';return {ok:true,text:async()=>`<ValCurs Date="${day}.10.2026">${[['USD',1,84],['EUR',1,95],['CNY',1,12.5],['KRW',1000,62]].map(([c,n,v])=>`<Valute><CharCode>${c}</CharCode><Nominal>${n}</Nominal><Value>${v}</Value></Valute>`).join('')}</ValCurs>`};};
  const options={now:()=>time,fetchImpl,cacheFile:join(dir,'rates.json')};
  const first=createRussianRates(options);
  assert.equal((await first()).date,'2026-10-02');
  time=new Date('2026-10-10T00:00:00Z');assert.equal((await first()).date,'2026-10-02');
  assert.equal((await createRussianRates(options)()).date,'2026-10-02');assert.equal(calls,1);
  time=new Date('2026-10-16T00:00:00Z');
  assert.equal((await createRussianRates(options)()).date,'2026-10-16');assert.equal(calls,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('M9 uses exact displacement and separate motor power, returning full price bounds',()=>{
 const m9={...row,model_year:2025,price_cny:224400,powertrain:'Гибрид',specifications:{engineVolume:1.5,enginePower:163,transmission:'3-gear DHT'},source_payload:{horsepower:707,technicalSpecs:{groups:[
  {name:'Engine',items:[{name:'Displacement (mL)',value:'1499'},{name:'Maximum power (kW)',value:'120'}]},
  {name:'Electric Motor',items:[{name:'Total Motor Power (kW)',value:'520'},{name:'System Combined Power (kW)',value:'640'}]},
 ]}}};
 const quote=estimate(m9);
 assert.equal(quote.status,'estimated');assert.equal(quote.inputs.engineCc,1499);
 assert.equal(quote.inputs.icePowerKw,120);assert.equal(quote.inputs.electricPeakKw,520);
 assert.deepEqual(quote.range,{min:5520000,max:7830000});
 const util=quote.rows.find(row=>row.id==='utilization');assert.equal(util.minAmount,900000);assert.equal(util.amount,3201600);
 assert.ok(quote.range.min<=quote.rows.reduce((sum,row)=>sum+(row.minAmount??row.amount),0));
 assert.ok(quote.range.max>=quote.rows.reduce((sum,row)=>sum+row.amount,0));
 const documented=estimate({...m9,source_payload:{...m9.source_payload,motorThirtyMinutePowerKw:100}});
 assert.equal(documented.range,null);assert.equal(documented.rows.find(row=>row.id==='utilization').amount,1291200);
 assert.ok(documented.totalAmount>=quote.range.min&&documented.totalAmount<=quote.range.max);
});

test('EV and series hybrid include duty, excise, VAT and electric utilization without an ICE duty',()=>{
 assert.equal(personalElectricUtil({age:2,kw:58.84}),3400);
 assert.equal(personalElectricUtil({age:2,kw:58.85}),991200);
 assert.equal(personalElectricUtil({age:4,kw:205.95}),4780800);
 assert.equal(electricExcise(90),0);assert.equal(electricExcise(150),9600);
 assert.equal(electricExcise(200),122600);assert.equal(electricExcise(201),201804);
 const ev={...row,model_year:2025,powertrain:'Электромобиль',specifications:{},source_payload:{horsepower:272,motorPowerKw:200}};
 const quote=estimate(ev);assert.equal(quote.status,'estimated');assert.ok(quote.range);
 assert.equal(quote.rows.find(row=>row.id==='duty').amount,187098);
 assert.equal(quote.rows.find(row=>row.id==='utilization').minAmount,3400);
 assert.equal(quote.rows.find(row=>row.id==='utilization').amount,3079200);
 const excise=quote.rows.find(row=>row.id==='excise'),vat=quote.rows.find(row=>row.id==='vat');
 assert.equal(excise.minAmount,0);assert.equal(vat.minAmount,Math.round((1247320+187098)*.22));
 assert.equal(vat.amount,Math.round((1247320+187098+excise.amount)*.22));
 const series=estimate({...ev,powertrain:'Гибрид',source_payload:{...ev.source_payload,sourceFuelType:'Range Extender',engine:'1.5T 160 HP'}});
 assert.deepEqual(series.rows,quote.rows);assert.equal(series.inputs.powertrain,'series');
 const small=estimate({...ev,source_payload:{motorPowerKw:30}});assert.equal(small.range,null);
 const invalid=estimate({...ev,source_payload:{motorPowerKw:30,motorThirtyMinutePowerKw:100}});assert.equal(invalid.status,'unavailable');
});

test('Mild hybrid no longer blocks known costs; ambiguous hybrid stays explicitly unclassified',()=>{
 const mild=estimate({...row,source_payload:{sourceFuelType:'Gasoline + 48V Mild Hybrid System'}});
 assert.equal(mild.status,'estimated');assert.ok(mild.range);assert.equal(mild.inputs.powertrain,'parallel');
 assert.equal(estimate({...row,powertrain:'Гибрид',source_payload:{sourceFuelType:'Plug-in Hybrid'}}).reason,'powertrain_type_needed');
 assert.equal(estimate({...row,powertrain:'Электромобиль',source_payload:{technicalSpecs:{groups:'invalid'}}}).reason,'motor_power_missing');
});

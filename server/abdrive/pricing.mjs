import util from '../../config/ru-utilization-2026.json' with {type:'json'};
import {RU_PRICING} from '../../config/ru-pricing.mjs';
import {enginePower,engineVolume} from '../../src/engine-spec.js';
import {originForSource,inPhrase,ORIGIN_SOURCES} from '../../src/origin.js';

const positive=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
export function customsFee(valueRub) {
  return [[200000,1231],[450000,2462],[1200000,4924],[2700000,13541],[4200000,18465],[5500000,21344],[10000000,49240],[Infinity,73860]].find(([limit])=>valueRub<=limit)[1];
}
export function personalIceDuty({age,cc,valueRub,eurRub}) {
  if(age<=3){
    const [,percent,perCc]=[[8500,.54,2.5],[16700,.48,3.5],[42300,.48,5.5],[84500,.48,7.5],[169000,.48,15],[Infinity,.48,20]].find(([limit])=>valueRub/eurRub<=limit);
    return Math.max(valueRub*percent,cc*perCc*eurRub);
  }
  const rates=age<=5?[1.5,1.7,2.5,2.7,3,3.6]:[3,3.2,3.5,4.8,5,5.7];
  return cc*rates[[1000,1500,1800,2300,3000,Infinity].findIndex(limit=>cc<=limit)]*eurRub;
}
export function personalIceUtil({cc,hp,age}) {
  const group=util.personalIce.find(group=>group.maxCc===null||cc<=group.maxCc);
  // The legal table rounds kW to two decimals; 160 hp is exactly 117.68 kW.
  const kw=Math.round(hp*.7355*100)/100;
  const row=group.rates.find(([max])=>max===null||kw<=max);
  return Math.round(row[age<=3?1:2]*util.baseRub);
}

export function estimateRussianOffer(row,{rates=RU_PRICING.rates,tariffs=RU_PRICING,now=new Date()}={}) {
  const base={currency:'RUB',destinationId:tariffs.destinationId,destinationName:tariffs.destinationName,totalAmount:null};
  const unavailable=(reason)=>({...base,status:'unavailable',reason});
  const date=new Date(now),rateDate=new Date(rates.date+'T00:00:00Z');
  if(!Number.isFinite(+date)||date.getUTCFullYear()!==2026)return unavailable('rules_need_update');
  if(!Number.isFinite(+rateDate)||+date-+rateDate>7*86400000||+rateDate-+date>86400000)return unavailable('rates_need_update');
  if(!['CNY','KRW','USD','EUR'].every(key=>positive(rates[key])))return unavailable('rates_need_update');
  if(tariffs.destinationId!=='moscow')return unavailable('destination_unavailable');
  const source=row.source_payload||{},spec=row.specifications||{};
  // A model year is only an age proxy; show the assumption in the breakdown.
  const year=Number(row.model_year);
  if(!Number.isInteger(year)||year<1990||year>date.getUTCFullYear())return unavailable('year_missing');
  if(row.powertrain!=='ДВС')return unavailable('powertrain_documents_needed');
  const car={...spec,...Object.fromEntries(Object.entries(source).filter(([,v])=>v!==null&&v!==undefined))};
  if(/hybrid|гибрид|48\s*v/i.test([car.sourceFuelType,car.fuelType,car.engine].filter(Boolean).join(' ')))return unavailable('powertrain_documents_needed');
  const liters=positive(car.engineVolume)||engineVolume(car);
  const hp=positive(car.enginePower)||enginePower(car);
  if(!liters||liters<.5||liters>8||!hp||hp<30||hp>2000)return unavailable('engine_specs_missing');
  const cc=Math.round(liters*1000),origin=originForSource(row.source);
  if(!Object.values(ORIGIN_SOURCES).flat().includes(row.source))return unavailable('origin_unavailable');
  const fob=source.priceBasis==='FOB';
  const port=origin==='china'?'Horgos':'Busan';
  if(fob&&(!positive(source.fobPriceUsd)||source.fobPort!==port))return unavailable('fob_quote_missing');
  const currency=String(source.sourceCurrency||(origin==='korea'?'KRW':'CNY')).toUpperCase();
  if(!['KRW','CNY','USD'].includes(currency))return unavailable('source_price_missing');
  const sourcePrice=positive(source.sourcePrice??row.price_cny);
  if(!fob&&!sourcePrice)return unavailable('source_price_missing');
  const purchase=Math.round(fob?Number(source.fobPriceUsd)*rates.USD:sourcePrice*rates[currency]);
  // Year-only listings can cross the 3/5-year bands. Use the more expensive
  // plausible band, explicitly disclosed, instead of silently underquoting.
  const ages=[Math.max(0,(+date-Date.UTC(year,0,1))/(365.2425*86400000)),Math.max(0,(+date-Date.UTC(year,11,31))/(365.2425*86400000))];
  const duties=ages.map(age=>personalIceDuty({age,cc,valueRub:purchase,eurRub:rates.EUR}));
  const utils=ages.map(age=>personalIceUtil({age,cc,hp}));
  const duty=Math.round(Math.max(...duties)),utilization=Math.max(...utils);
  const rows=[{id:'purchase',label:fob?'Автомобиль и расходы до '+port:`Автомобиль ${inPhrase(origin)}`,amount:purchase},
    {id:'payment',label:'Перевод денег · ориентир 2%',amount:Math.round(purchase*tariffs.paymentPercent)},
    ...(!fob?[{id:'origin',label:origin==='china'?'Доставка по Китаю и экспорт':'Расходы по Корее и экспорт',amount:tariffs[origin].domesticRub}]:[]),
    ...(origin==='korea'?[{id:'sea',label:'Море до Владивостока',amount:tariffs.korea.seaRub}]:[]),
    {id:'delivery',label:origin==='china'?'Хоргос → Москва':'Владивосток → Москва',amount:tariffs[origin].deliveryRub},
    {id:'duty',label:'Таможенная пошлина и налоги',amount:duty},
    {id:'customsFee',label:'Таможенный сбор',amount:customsFee(purchase)},
    {id:'utilization',label:'Утилизационный сбор',amount:utilization},
    {id:'clearance',label:'Брокер, СВХ, СБКТС и ЭПТС · ориентир',amount:tariffs.clearanceRub},
    {id:'service',label:'Сопровождение покупки · ориентир',amount:tariffs.serviceRub}];
  if(rows.some(row=>!Number.isFinite(row.amount)||row.amount<0))return unavailable('tariffs_invalid');
  const sum=rows.reduce((sum,row)=>sum+row.amount,0);
  return {...base,status:'estimated',totalAmount:Math.ceil(sum/10000)*10000,subtotal:sum,rows,
    ratesDate:rates.date,version:tariffs.version,calculatedAt:date.toISOString(),
    assumptions:['Предварительный расчёт для личного ввоза физическим лицом. Тарифы доставки и сопровождения — ориентиры, условия партнёра ещё не подтверждены.',
      'Возраст оценён по году модели, объём — по данным объявления. Дата выпуска, точный объём и мощность проверяются по документам.',
      ...(Math.abs(duties[0]-duties[1])>1||utils[0]!==utils[1]?['Год автомобиля попадает на границу возрастных ставок: заложен больший платёж. После проверки даты выпуска сумма может уменьшиться.']:[]),
      ...(hp<=160&&cc<=3000?['Льготный утильсбор предполагает соблюдение условий личного ввоза, включая ограничения на повторный ввоз и продажу в течение 12 месяцев.']:[]),
      ...(fob?['Расходы до указанного пункта FOB повторно не добавлены. Таможенная стоимость предварительно принята равной полной цене FOB; её состав уточняется по инвойсу.']:[]),
      'Курс оплаты, состояние и габариты машины могут изменить сумму. Регистрация в ГИБДД и ОСАГО не включены.']};
}

// Separate CBR rates; no dependency on the BY exchange updater or its database.
export function createRussianRates({fetchImpl=fetch,now=()=>new Date()}={}) {
  let current=RU_PRICING.rates,checkedAt=0,pending=null;
  return async()=>{
    if(pending)return pending;
    if(+now()-checkedAt<3600000)return current;
    if(!pending)pending=(async()=>{
      checkedAt=+now();
      try {
        const moscowDate=new Date(+now()+3*3600000).toISOString().slice(0,10);
        const requestedDate=moscowDate.split('-').reverse().join('/');
        const response=await fetchImpl('https://www.cbr.ru/scripts/XML_daily.asp?date_req='+encodeURIComponent(requestedDate),{signal:AbortSignal.timeout(2500)});
        if(!response.ok)throw new Error('cbr_unavailable');
        const xml=await response.text(),date=xml.match(/<ValCurs[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/);
        if(!date)throw new Error('invalid_cbr');
        const next={date:`${date[3]}-${date[2]}-${date[1]}`,RUB:1};
        for(const block of xml.matchAll(/<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g)) {
          const code=block[1].match(/<CharCode>([^<]+)<\/CharCode>/)?.[1];
          if(!['USD','EUR','CNY','KRW'].includes(code))continue;
          const nominal=Number(block[1].match(/<Nominal>([^<]+)<\/Nominal>/)?.[1]);
          const value=Number(block[1].match(/<Value>([^<]+)<\/Value>/)?.[1].replace(',','.'));
          if(nominal>0&&value>0)next[code]=value/nominal;
        }
        const rateTime=Date.parse(next.date+'T00:00:00Z');
        if(['USD','EUR','CNY','KRW'].every(code=>positive(next[code]))&&next.date<=moscowDate&&rateTime>=Date.parse(current.date))current=next;
      } catch { /* Keep the dated last good snapshot; the estimator checks its age. */ }
      return current;
    })().finally(()=>{pending=null;});
    return pending;
  };
}

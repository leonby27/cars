import {estimateRussianDelivery,russianDeliverySize} from '../../src/markets/ru-delivery.js';
import {RU_PRICING} from '../../config/ru-pricing.mjs';
import {russianPowertrain} from './powertrain.mjs';
import {originForSource,inPhrase,ORIGIN_SOURCES} from '../../src/origin.js';

const positive=value=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
export {customsFee,personalIceDuty,personalIceUtil,personalElectricUtil,electricExcise} from '../../src/markets/ru-customs.js';
import {customsFee,personalIceDuty,personalIceUtil,personalElectricUtil,electricExcise} from '../../src/markets/ru-customs.js';

export function estimateRussianOffer(row,{rates=RU_PRICING.rates,tariffs=RU_PRICING,now=new Date()}={}) {
  const base={currency:'RUB',destinationId:tariffs.destinationId,destinationName:tariffs.destinationName,totalAmount:null};
  const unavailable=(reason)=>({...base,status:'unavailable',reason});
  const date=new Date(now),rateDate=new Date(rates.date+'T00:00:00Z');
  if(!Number.isFinite(+date)||date.getUTCFullYear()!==2026)return unavailable('rules_need_update');
  if(!Number.isFinite(+rateDate)||+date-+rateDate>7*86400000||+rateDate-+date>86400000)return unavailable('rates_need_update');
  if(!['CNY','KRW','USD','EUR'].every(key=>positive(rates[key])))return unavailable('rates_need_update');
  if(tariffs.destinationId!=='moscow')return unavailable('destination_unavailable');
  const source=row.source_payload||{};
  // A model year is only an age proxy; show the assumption in the breakdown.
  const year=Number(row.model_year);
  if(!Number.isInteger(year)||year<1990||year>date.getUTCFullYear())return unavailable('year_missing');
  const power=russianPowertrain(row);
  const electric=['electric','series'].includes(power.kind);
  const hybrid=power.kind==='parallel';
  if(['unknown','unknown-hybrid'].includes(power.kind))return unavailable('powertrain_type_needed');
  const {cc,iceHp:hp}=power;
  if(!electric&&(!cc||cc<500||cc>8000||!hp||hp<30||hp>2000))return unavailable('engine_specs_missing');
  if(electric&&!power.continuousKw&&!power.electricPeakKw)return unavailable('motor_power_missing');
  if([power.continuousKw,power.electricPeakKw].some(value=>value!==null&&(value<1||value>3000)))return unavailable('motor_power_conflict');
  if(power.continuousKw&&power.electricPeakKw&&power.continuousKw>power.electricPeakKw)return unavailable('motor_power_conflict');
  const origin=originForSource(row.source);
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
  const motorLow=power.motorPower.minKw,motorHigh=power.motorPower.maxKw??Infinity;
  const powerLow=electric?motorLow:power.iceKw+(hybrid?motorLow:0);
  const powerHigh=electric?motorHigh:power.iceKw+(hybrid?motorHigh:0);
  const duties=ages.map(age=>electric?purchase*.15:personalIceDuty({age,cc,valueRub:purchase,eurRub:rates.EUR}));
  const duty=Math.round(Math.max(...duties));
  const utility=kw=>Math.max(...ages.map(age=>electric?personalElectricUtil({age,kw}):personalIceUtil({age,cc,hp:kw/.7355})));
  const utilLow=utility(powerLow),utilHigh=utility(powerHigh);
  const exciseLow=electric?electricExcise(powerLow/.7355):0,exciseHigh=electric?electricExcise(powerHigh/.7355):0;
  const vatLow=electric?Math.round((purchase+duty+exciseLow)*.22):0,vatHigh=electric?Math.round((purchase+duty+exciseHigh)*.22):0;
  const paymentRow=(id,label,min,max=min)=>({id,label,amount:max,...(min!==max?{minAmount:min,maxAmount:max}:{})});
  const delivery=tariffs.logistics?estimateRussianDelivery({origin,city:row.city||source.city,model:[row.brand,row.model].filter(Boolean).join(' '),...russianDeliverySize(row)},{rates,tariffs}):null;
  const deliveryAmount=id=>delivery?.rows.find(row=>row.id===id)?.amount||0;
  const rows=[{id:'purchase',label:fob?'Автомобиль и расходы до '+port:`Автомобиль ${inPhrase(origin)}`,amount:purchase},
    {id:'payment',label:'Перевод денег · ориентир 2%',amount:Math.round(purchase*tariffs.paymentPercent)},
    ...(!fob?[{id:'origin',label:origin==='china'?'Доставка по Китаю и экспорт':'Расходы по Корее и экспорт',amount:delivery?deliveryAmount('documents')+deliveryAmount('domestic'):tariffs[origin].domesticRub}]:[]),
    ...(origin==='korea'?[{id:'sea',label:'Море до Владивостока',amount:delivery?deliveryAmount('sea'):tariffs.korea.seaRub}]:[]),
    {id:'delivery',label:origin==='china'?'Хоргос → Москва':'Владивосток → Москва',amount:delivery?deliveryAmount('delivery')+deliveryAmount('large'):tariffs[origin].deliveryRub},
    {id:'duty',label:electric?'Таможенная пошлина · 15%':'Таможенная пошлина и налоги',amount:duty},
    ...(electric?[paymentRow('excise','Акциз',exciseLow,exciseHigh),paymentRow('vat','НДС · 22%',vatLow,vatHigh)]:[]),
    {id:'customsFee',label:'Таможенный сбор',amount:customsFee(purchase)},
    paymentRow('utilization','Утилизационный сбор',utilLow,utilHigh),
    {id:'clearance',label:'Брокер, СВХ, СБКТС и ЭПТС · ориентир',amount:tariffs.clearanceRub},
    {id:'service',label:'Сопровождение покупки · ориентир',amount:tariffs.serviceRub}];
  if(rows.some(row=>!Number.isFinite(row.amount)||row.amount<0))return unavailable('tariffs_invalid');
  const sum=rows.reduce((sum,row)=>sum+row.amount,0);
  const lowSum=rows.reduce((sum,row)=>sum+(row.minAmount??row.amount),0);
  const range=lowSum!==sum?{min:Math.floor(lowSum/10000)*10000,max:Math.ceil(sum/10000)*10000}:null;
  return {...base,status:'estimated',totalAmount:Math.ceil(sum/10000)*10000,subtotal:sum,rows,range,estimateKind:range?'range':'point',
    inputs:{powertrain:power.kind,engineCc:cc,icePowerKw:power.iceKw,electricPeakKw:power.electricPeakKw,continuousPowerKw:power.continuousKw,motorPower:power.motorPower},
    ratesDate:rates.date,version:tariffs.version,calculatedAt:date.toISOString(),
    assumptions:['Предварительный расчёт для личного ввоза физическим лицом. Тарифы доставки и сопровождения — ориентиры, условия партнёра ещё не подтверждены.',
      'Возраст оценён по году модели, объём — по подробной спецификации или данным объявления. Дата выпуска, объём и мощность проверяются по документам.',
      ...(power.motorPower.method==='reference'?['Мощность электромоторов для расчёта оценена по справочнику модификаций; документальное значение имеет приоритет.']:[]),
      ...(power.motorPower.method==='unknown'?['Электрическая мощность неизвестна; показаны минимальный и максимальный платежи.']:[]),
      ...(hybrid?['У параллельного гибрида для утильсбора учитываются ДВС и электромоторы вместе. Пиковая мощность не подменяет документальную 30-минутную.']:[]),
      ...(electric?['Расчёт для электрической схемы: пошлина 15%, акциз, НДС 22% и утильсбор. У последовательного гибрида тип установки подтверждается при оформлении.']:[]),
      ...(Math.abs(duties[0]-duties[1])>1||ages.some(age=>age<=3)&&ages.some(age=>age>3)?['Год автомобиля попадает на границу возрастных ставок: заложен больший платёж. После проверки даты выпуска сумма может уменьшиться.']:[]),
      ...((electric?powerLow<=58.84:powerLow<=117.68&&cc<=3000)?['Льготный утильсбор предполагает соблюдение условий личного ввоза, включая ограничения на повторный ввоз и продажу в течение 12 месяцев.']:[]),
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

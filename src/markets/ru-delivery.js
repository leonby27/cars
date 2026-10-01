import {RU_PRICING} from '../../config/ru-pricing.mjs';
import {chinaTransitFor,CHINA_TRANSIT_ZONES} from '../china-logistics.js';
import {koreaTransitZone,KOREA_TRANSIT_ZONES} from '../korea-logistics.js';
import {isLargeDeliveryModel} from '../delivery-estimate.js';
const round=value=>Math.round(value/1000)*1000;
export const KOREAN_DELIVERY_CITIES=new Set(['seoul','busan','ulsan','daegu','gwangju','incheon','daejeon','suwon','jeju','gyeonggi','gyeongnam','gyeongbuk','jeonnam','jeonbuk','chungnam','chungbuk','gangwon']);
export function estimateRussianDelivery({model='',city='',lengthMm=0,curbWeight=0,origin=KOREAN_DELIVERY_CITIES.has(city)?'korea':'china'}={}, {rates=RU_PRICING.rates,tariffs=RU_PRICING}={}) {
 const config=tariffs.logistics;
 const large=isLargeDeliveryModel(model,{lengthMm,curbWeight});
 const zone=origin==='korea'?koreaTransitZone(city):Object.keys(CHINA_TRANSIT_ZONES).find(key=>CHINA_TRANSIT_ZONES[key]===chinaTransitFor(city));
 const profile=origin==='korea'?KOREA_TRANSIT_ZONES:CHINA_TRANSIT_ZONES;
 const usd=value=>round(value*rates.USD);
 const rows=origin==='korea'?[
  {id:'documents',label:'Документы и портовые сборы',amount:usd(config.korea.documentsUsd)},
  {id:'domestic',label:'Перегон до порта Пусан',amount:usd(config.korea.transitUsd[zone])},
  {id:'sea',label:'Пусан — Владивосток',amount:usd(config.korea.seaUsd)},
  {id:'delivery',label:'Владивосток — Москва',amount:config.korea.deliveryRub},
 ]:[
  {id:'documents',label:'Документы и страхование',amount:usd(config.china.documentsInsuranceUsd)},
  {id:'domestic',label:'Автовоз по Китаю до Хоргоса',amount:usd(config.china.transitUsd[zone])},
  {id:'delivery',label:'Хоргос — Москва',amount:usd(config.china.deliveryUsd)},
 ];
 if(large)rows.push({id:'large',label:'Крупный кузов',amount:origin==='korea'?config.korea.largeRub:usd(config.china.largeUsd)});
 const total=rows.reduce((sum,row)=>sum+row.amount,0);
 return {total,low:total,high:total,rows,large,origin,transitLabel:profile[zone].label};
}

export function russianDeliverySize(row){
 const raw=row.source_payload||{},spec=row.specifications||{};
 const groups=raw.technicalSpecs?.groups;
 const items=Array.isArray(groups)?groups.flatMap(g=>Array.isArray(g.items)?g.items:[]):[];
 const find=pattern=>items.find(item=>pattern.test(item?.name||''))?.value;
 const dimensions=raw.dimensions||spec.dimensions||find(/^(Length[×*x]Width[×*x]Height|Длина.*Ширина.*Высота)/i)||'';
 const lengthMm=Number(String(dimensions).match(/^\s*(\d{4})/)?.[1])||0;
 const curbWeight=Number(raw.curbWeight||spec.curbWeight||find(/^(Curb weight \(kg\)|Снаряженная масса)/i))||0;
 return {lengthMm,curbWeight};
}

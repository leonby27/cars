import util from '../../config/ru-utilization-2026.json' with {type:'json'};
import { RU_PRICING } from '../../config/ru-pricing.mjs';

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

export function personalElectricUtil({kw,age}) {
  const row=util.personalElectric.find(([max])=>max===null||kw<=max);
  return Math.round(row[age<=3?1:2]*util.baseRub);
}
export function electricExcise(hp) {
  const rate=[[90,0],[150,64],[200,613],[300,1004],[400,1711],[500,1771],[Infinity,1829]].find(([limit])=>hp<=limit)[1];
  return Math.round(hp*rate);
}

// Standalone customs calculator and catalog use the same tariff functions.
export function russianCustomsPayment({kind='ice',priceRub,year,cc,hp,motorKw}, {rates=RU_PRICING.rates,now=new Date()}={}) {
  const value=Number(priceRub), volume=Number(cc), power=Number(hp), motor=Number(motorKw);
  const electric=['ev','erev'].includes(kind), hybrid=kind==='phev';
  if(!['ice','ev','erev','phev'].includes(kind)||!Number.isFinite(value)||value<=0||value>1e10) return null;
  if(!Number.isInteger(Number(year))||year<1990||year>now.getUTCFullYear())return null;
  if(now.getUTCFullYear()!==2026||!Number.isFinite(Date.parse(rates.date))||now-Date.parse(rates.date)>7*86400000||Date.parse(rates.date)-now>86400000||!(rates.EUR>0))return null;
  if(!electric&&(!Number.isFinite(volume)||volume<100||volume>10000||!Number.isFinite(power)||power<=0||power>2000))return null;
  if((electric||hybrid)&&(!Number.isFinite(motor)||motor<=0||motor>3000))return null;
  const ages=[Math.max(0,(+now-Date.UTC(year,0,1))/(365.2425*86400000)),Math.max(0,(+now-Date.UTC(year,11,31))/(365.2425*86400000))];
  const duty=Math.round(Math.max(...ages.map(age=>electric?value*.15:personalIceDuty({age,cc:volume,valueRub:value,eurRub:rates.EUR}))));
  const utilization=Math.max(...ages.map(age=>electric?personalElectricUtil({age,kw:motor}):personalIceUtil({age,cc:volume,hp:power+(hybrid?motor/.7355:0)})));
  const excise=electric?electricExcise(motor/.7355):0;
  const vat=electric?Math.round((value+duty+excise)*.22):0;
  const rows=[{id:'duty',label:'Ввозная пошлина',amount:duty},...(electric?[{id:'excise',label:'Акциз',amount:excise},{id:'vat',label:'НДС 22%',amount:vat}]:[]),{id:'utilization',label:'Утилизационный сбор',amount:utilization},{id:'customsFee',label:'Таможенный сбор',amount:customsFee(value)}];
  return {total:rows.reduce((sum,row)=>sum+row.amount,0),rows};
}

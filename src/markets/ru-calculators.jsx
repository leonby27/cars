import React, {useState,useEffect} from 'react';
import {LinkSimple} from '@phosphor-icons/react';
import {RU_PRICING} from '../../config/ru-pricing.mjs';
import {russianCustomsPayment} from './ru-customs.js';
const number=value=>new Intl.NumberFormat('ru-RU').format(Math.round(value));
const kinds=[{id:'ice',name:'Бензин / дизель'},{id:'phev',name:'Гибрид с приводом от ДВС'},{id:'erev',name:'Гибрид с генератором'},{id:'ev',name:'Электромобиль'}];
function useCalculationLink(values) {
 const [copied,setCopied]=useState(false);
 const search=new URLSearchParams(values).toString();
 useEffect(()=>{setCopied(false);try{window.history.replaceState(window.history.state,'',window.location.pathname+'?'+search);}catch{}},[search]);
 return {copied,copy:async()=>{try{await navigator.clipboard.writeText(window.location.origin+window.location.pathname+'?'+search);setCopied(true);}catch{setCopied(false);}}};
}
function CalculatorSelect({SelectField,label,...props}) {return <div className="tool-calc-field tool-calc-field-select"><span className="tool-calc-label">{label}</span><SelectField className="tool-calc-select" label={label} {...props}/></div>;}
function NumericField({label,unit,value,onChange,min,max}) {
 return <div className="tool-calc-field"><label className="tool-calc-main"><span className="tool-calc-label">{label}</span><input className="tool-calc-input" type="number" inputMode="decimal" aria-label={`${label}, ${unit}`} value={value} onChange={e=>onChange(e.target.value)} min={min} max={max}/></label><span className="tool-calc-unit tool-calc-unit-text">{unit}</span></div>;
}
function ShareCalculation({share}) {return <button type="button" className={`primary tool-calc-share${share.copied?' copied':''}`} onClick={share.copy}><LinkSimple size={17}/><span>{share.copied?'Ссылка скопирована':'Поделиться расчётом'}</span></button>;}
export function RussianCustomsCalculator({SelectField}) {
 const [params]=useState(()=>new URLSearchParams(window.location.search));
 const [kind,setKind]=useState(()=>kinds.some(k=>k.id===params.get('kind'))?params.get('kind'):'ice');
 const [price,setPrice]=useState(()=>params.get('price')??'1500000');
 const [year,setYear]=useState(()=>params.get('year')??String(new Date().getFullYear()-3));
 const [cc,setCc]=useState(()=>params.get('cc')??'1500');
 const [hp,setHp]=useState(()=>params.get('hp')??'150');
 const [motor,setMotor]=useState(()=>params.get('motor')??'');
 const [rates,setRates]=useState(()=>window.__boot?.ruRates||RU_PRICING.rates);
 useEffect(()=>{const controller=new AbortController();fetch('/api/rates',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(data?.EUR>0&&data?.date)setRates(data);}).catch(()=>{});return()=>controller.abort();},[]);
 const electric=kind==='ev'||kind==='erev';
 const payment=russianCustomsPayment({kind,priceRub:price,year:Number(year),cc,hp,motorKw:motor},{rates});
 const share=useCalculationLink({kind,price,year,cc,hp,motor});
 const years=Array.from({length:37},(_,i)=>String(new Date().getFullYear()-i));
 return <section className="tool-calc" aria-label="Калькулятор растаможки в России">
  <div className="tool-calc-fields">
   <CalculatorSelect SelectField={SelectField} label="Тип двигателя" value={kinds.find(k=>k.id===kind).name} options={kinds.map(k=>k.name)} onChange={name=>setKind(kinds.find(k=>k.name===name).id)}/>
   <CalculatorSelect SelectField={SelectField} label="Год выпуска" value={year} options={years} onChange={setYear}/>
   <NumericField label="Стоимость автомобиля" unit="₽" value={price} onChange={setPrice} min="1" max="10000000000"/>
   {!electric&&<NumericField label="Объём двигателя" unit="см³" value={cc} onChange={setCc} min="100" max="10000"/>}
   {!electric&&<NumericField label="Мощность ДВС" unit="л.с." value={hp} onChange={setHp} min="1" max="2000"/>}
   {kind!=='ice'&&<NumericField label="30-минутная мощность электромоторов" unit="кВт" value={motor} onChange={setMotor} min="0.01" max="3000"/>}
  </div>
  {payment?<div className="tool-calc-result"><div className="tool-calc-summary"><div className="tool-calc-total"><span>Таможенный платёж</span><span className="tool-calc-sum"><strong>{number(payment.total)}</strong><span>₽</span></span><small>Курс ЦБ РФ на {rates.date.split('-').reverse().join('.')}. Расчёт для личного ввоза физическим лицом.</small></div><dl className="tool-calc-rows">{payment.rows.map(row=><div key={row.id}><dt>{row.label}</dt><dd>{number(row.amount)} ₽</dd></div>)}</dl><ShareCalculation share={share}/></div><p className="tool-calc-why">{electric?'Пошлина 15%, акциз и НДС 22% начисляются отдельно.':'Пошлина зависит от возраста и объёма двигателя, а у машин до трёх лет — также от стоимости.'} Утильсбор зависит от мощности и возраста. На границе возрастных ставок по указанному году принят больший платёж; точная дата выпуска уточняет сумму. Льготные коэффициенты действуют при соблюдении условий личного ввоза и ограничений на продажу и повторный ввоз в течение 12 месяцев.</p></div>:<p className="tool-calc-empty" role="status">{kind!=='ice'&&!motor?'Укажите 30-минутную мощность электромоторов по документам. Пиковая мощность из объявления для этого расчёта не подходит.':'Укажите корректные стоимость и характеристики автомобиля. Для расчёта нужны действующие ставки 2026 года и курс не старше семи дней.'}</p>}
 </section>;
}

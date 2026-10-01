// Only known vehicle characteristics. Never spread the source payload into public data.
import {normalizeSourceBodyType} from './body-types.js';
import {normalizeDrive,UNKNOWN_DRIVE} from './drive-types.js';
import {translateColor} from './colors.js';
import {engineVolume,enginePower,gearboxType,fuelType,GEARBOX_TYPES,FUEL_TYPES} from './engine-spec.js';

const text=value=>typeof value==='string'&&value.trim()&&value.trim()!=='--'?value.trim().slice(0,160):null;
const positive=(value,max=10000)=>['string','number'].includes(typeof value)&&value!==''&&Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=max?Number(value):null;
const number=value=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1}).format(value);
const unit=(value,suffix)=>value===null?null:`${number(value)} ${suffix}`;

export function vehiclePublicFacts(row){
 const raw=row.source_payload&&typeof row.source_payload==='object'?row.source_payload:{};
 const spec=row.specifications&&typeof row.specifications==='object'?row.specifications:{};
 const engine=text(raw.engine)||text(spec.engine);
 const transmission=text(raw.transmission)||text(spec.transmission);
 const drive=normalizeDrive(row.drivetrain);
 const fuel=fuelType({sourceFuelType:text(raw.sourceFuelType)})||(FUEL_TYPES.includes(spec.fuelType)?spec.fuelType:null);
 const combustion=row.powertrain==='ДВС'||row.powertrain==='Гибрид';
 const volume=combustion?(engineVolume({engine})??positive(spec.engineVolume,8)):null;
 const power=positive(raw.horsepower,3000)??(combustion?(enginePower({engine})??positive(spec.enginePower,3000)):null);
 const gearbox=GEARBOX_TYPES.includes(spec.gearbox)?spec.gearbox:gearboxType({transmission});
 const mileage=row.mileage_km!=null&&Number.isFinite(Number(row.mileage_km))&&Number(row.mileage_km)>=0?Number(row.mileage_km):null;
 const electric=positive(row.electric_range_km,3000),combined=positive(row.combined_range_km,5000);
 return [
  ['Год выпуска',positive(row.model_year,2100)],
  ['Пробег',unit(mileage,'км')],
  ['Тип двигателя',text(row.powertrain)],
  ['Топливо',combustion?fuel:null],
  ['Объём двигателя',unit(volume,'л')],
  ['Мощность',unit(power,'л. с.')],
  ['Привод',drive!==UNKNOWN_DRIVE?drive:null],
  ['Коробка передач',combustion?gearbox:null],
  ['Кузов',normalizeSourceBodyType(text(raw.bodyType)||text(spec.bodyType))],
  ['Цвет кузова',translateColor(text(raw.bodyColor)||text(spec.bodyColor))],
  ['Батарея',unit(positive(row.battery_kwh,500),'кВт·ч')],
  ['Запас хода на электричестве',unit(electric,'км')],
  ['Общий запас хода',combined!==electric?unit(combined,'км'):null],
  ['Разгон до 100 км/ч',unit(positive(raw.acceleration,60)??positive(spec.acceleration,60),'с')],
 ].filter(([,value])=>value!==null&&value!==undefined&&value!=='').map(([label,value])=>({label,value:String(value)}));
}

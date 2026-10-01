import {resolveRussianMotorPower} from './power-reference.mjs';
import {enginePower,engineVolume} from '../../src/engine-spec.js';
const number=value=>{const n=Number(String(value??'').trim().replace(',','.'));return Number.isFinite(n)&&n>0?n:null;};
const first=(...values)=>values.map(number).find(value=>value!==null)??null;

// Source groups distinguish combustion power, electric peak power and system power.
// Keep source/document power separate from the estimated quotation window.
export function russianPowertrain(row) {
 const car={...row.specifications,...Object.fromEntries(Object.entries(row.source_payload||{}).filter(([,v])=>v!=null))};
 const groups=Array.isArray(car.technicalSpecs?.groups)?car.technicalSpecs.groups:[];
 const items=groups.flatMap(group=>(Array.isArray(group?.items)?group.items:[]).filter(item=>item&&typeof item==='object').map(item=>({...item,group:group.name})));
 const spec=(name,group)=>first(...items.filter(item=>name.test(item.name)&&(!group||group.test(item.group))).map(item=>item.value));
 const textSpec=name=>items.find(item=>name.test(item.name))?.value||'';
 const cc=first(car.engineCc,spec(/^(Displacement \(mL\)|Объем двигателя \(см[³3]\)|Рабочий объем.*см)/i))||Math.round((first(car.engineVolume,engineVolume(car))||0)*1000)||null;
 const iceKw=first(car.enginePowerKw,spec(/^Maximum power \(kW\)$/i,/^Engine$/i));
 const iceHp=first(car.engineHorsepower,car.enginePower,enginePower(car),spec(/^Maximum horsepower \(Ps\)$/i,/^Engine$/i));
 const netIceKw=first(car.engineNetPowerKw,spec(/^Maximum Net Power \(kW\)$/i,/^Engine$/i));
 const engineKw=netIceKw||iceKw||(iceHp?iceHp*.7355:null);
 const electricPeakKw=first(car.motorPowerKw,spec(/^(Total Motor Power \(kW\)|Суммарная мощность электродвигателей.*кВт)/i),row.powertrain==='Электромобиль'?spec(/^Maximum power \(kW\)$/i):null)
  ||((first(car.motorHorsepower,row.powertrain==='Электромобиль'?car.horsepower:null))||0)*.7355||null;
 const continuousKw=first(car.motorThirtyMinutePowerKw,spec(/^(Total maximum 30.minute power \(kW\)|Суммарная максимальная 30.минутная мощность.*кВт)/i));
 const fuel=[car.sourceFuelType,car.fuelType,car.engine].filter(Boolean).join(' ');
 const hybrid=row.powertrain==='Гибрид'||/hybrid|гибрид|48\s*v/i.test(fuel);
 let kind=row.powertrain==='Электромобиль'?'electric':hybrid?'unknown-hybrid':row.powertrain==='ДВС'?'ice':'unknown';
 if(hybrid){
  if(/range.?exten|extended.?range|\bEREV\b|\bREEV\b|gasoline electric drive|последовательн|увеличител.*хода|增程/i.test(fuel))kind='series';
  else if(/DHT|E.?CVT|dual.?clutch|automatic|\b[6789].?(?:AT|DCT)\b|автомат|робот/i.test(car.transmission||'')||/mild.hybrid|48\s*v/i.test(fuel))kind='parallel';
 }
 const description=[car.modification,car.trim,textSpec(/^Model Name$/i)].filter(Boolean).join(' ');
 const driveText=[row.drivetrain,car.drive,car.driveType,textSpec(/^(Drive (Mode|Type)|Driving method|Привод)$/i)].filter(Boolean).join(' ');
 const drive=/all.?wheel|four.?wheel|\b[4a]wd\b|полный/i.test(driveText)?'all':/front|\bfwd\b|передн/i.test(driveText)?'front':/rear|\brwd\b|задн/i.test(driveText)?'rear':null;
 const motorCountText=textSpec(/^Number of Drive Motors$/i);
 const motorCount=/single|один/i.test(motorCountText)?1:/dual|two|два/i.test(motorCountText)?2:first(car.motorCount,motorCountText);
 const variant=/performance|性能/i.test(description)?'performance':/long.?range|maximum.?range|дальн|长续航/i.test(description)?'long-range':/standard|стандарт|rear.?wheel|\bRWD\b|后轮/i.test(description)?'standard':null;
 const power={kind,cc,iceHp:iceHp||(iceKw?iceKw/.7355:null),iceKw:engineKw,electricPeakKw,continuousKw};
 const motorPower=resolveRussianMotorPower({...power,brand:row.brand||car.brand,model:row.model||car.model,year:Number(description.match(/\b(20\d{2})\b/)?.[1]||row.model_year),
  motorCode:car.motorModel||textSpec(/^Front Motor Model$/i),motorCount,drive,variant,battery:first(row.battery_kwh,car.battery,car.batteryCapacity,spec(/^Battery (Capacity|Energy).*kWh/i))});
 return {...power,motorPower};
}

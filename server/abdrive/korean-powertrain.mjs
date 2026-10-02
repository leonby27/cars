import {fileURLToPath} from 'node:url';
import {loadKoreaSpecs,matchKoreaSpec} from '../../scripts/lib/korea-specs.mjs';

// Reuse the importer's versioned catalog without rewriting shared vehicle records.
const catalog=await loadKoreaSpecs(fileURLToPath(new URL('../../config/korea-specs/',import.meta.url)));
const cache=new Map();
const numeric=value=>{const match=String(value??'').replace(',','.').match(/^\s*(\d+(?:\.\d+)?)/);return match?Number(match[1]):null;};
const drive=value=>value==='Полный'?'all':value==='Передний'?'front':value==='Задний'?'rear':null;

export function koreanPowertrainCandidates(row) {
 if(row.source!=='Encar')return [];
 const raw={...row.specifications,...Object.fromEntries(Object.entries(row.source_payload||{}).filter(([,v])=>v!=null))};
 const car={brand:row.brand,model:row.model,year:Number(row.model_year),type:row.powertrain,engineCc:raw.engineCc||Number(raw.engineVolume)*1000,
  drive:row.drivetrain||raw.drive,sourceFuelType:raw.sourceFuelType,rawSeries:raw.rawSeries,rawModelGroup:raw.rawModelGroup,rawModel:raw.rawModel,seats:raw.seats};
 // Invalid identifiers must not pick the latest generation as a default.
 if(!Number.isInteger(car.year)||car.year<1990||!car.type)return [];
 const key=JSON.stringify(car);if(cache.has(key))return cache.get(key);
 const match=matchKoreaSpec(car,catalog);
 const explicitPhev=/plug.?in|\bPHEV\b/i.test([raw.sourceFuelType,raw.rawModel,raw.rawSeries].join(' '));
 const explicitHev=/\bHEV\b/i.test(raw.rawModel||'')&&!explicitPhev;
 const candidates=(match?.candidates||[]).filter(mod=>{
  if(car.type==='Гибрид'&&((explicitPhev&&!mod.summary.plugIn)||(explicitHev&&mod.summary.plugIn)))return false;
  // Encar gives precise cubic centimetres; the importer's 60 cc tolerance mixed
  // naturally aspirated 1598 cc engines with 1591 cc turbo versions.
  if(raw.engineCc&&mod.summary.engineCc&&Math.abs(raw.engineCc-mod.summary.engineCc)>5&&Number(raw.engineCc)%100!==0)return false;
  return true;
 }).map(mod=>{
  const sections=mod.sections||[],engine=sections.filter(s=>/^(Internal combustion engine specs|Engine specs)$/i.test(s.name)).flatMap(s=>s.rows||[]);
  const motors=sections.filter(s=>/electric/i.test(s.name)).flatMap(s=>s.rows||[]).filter(r=>/^Electric motor power$/i.test(r.name)).map(r=>numeric(r.value)).filter(v=>v>0);
  const iceHp=numeric(engine.find(r=>r.name==='Power')?.value)||(mod.summary.powertrain==='ДВС'?mod.summary.horsepower:null);
  // System power is a peak value; it never becomes documentary continuous power.
  const peakHp=mod.summary.powertrain==='Электромобиль'?mod.summary.horsepower:motors.length?motors.reduce((a,b)=>a+b,0):null;
  return {id:mod.path,source:'https://www.auto-data.net'+mod.path,name:mod.name,
   iceHp,iceKw:iceHp?iceHp*.7355:null,electricPeakKw:peakHp?peakHp*.7355:null,
   drive:drive(mod.summary.drive),battery:mod.summary.battery,motorCount:motors.length||null,
   mild:mod.summary.mild,plugIn:mod.summary.plugIn};
 });
 if(cache.size>=5000)cache.clear();cache.set(key,candidates);return candidates;
}

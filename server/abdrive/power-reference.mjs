import {RU_POWER_REFERENCE,RU_POWER_SOURCES,RU_POWER_REFERENCE_VERSION} from '../../config/ru-power-reference.mjs';
const normalize=value=>String(value??'').toLowerCase().replace(/[^a-zа-я0-9]/g,'');
const near=(a,b,tolerance)=>Number.isFinite(a)&&Math.abs(a-b)<=tolerance;
const bounds=value=>Array.isArray(value)?value:[value,value];
const matchesVariant=(facts,entry)=>{
 if(normalize(facts.brand)!==normalize(entry.brand)||facts.kind!==entry.kind)return false;
 if(!Number.isInteger(facts.year)||facts.year<entry.years[0]||facts.year>entry.years[1])return false;
 if(entry.models&&!entry.models.some(model=>normalize(model)===normalize(facts.model)))return false;
 if(entry.sources&&!entry.sources.includes(facts.source))return false;
 if(entry.trim&&!entry.trim.test(facts.description||''))return false;
 if(entry.maxBattery&&/plug.?in|\bPHEV\b/i.test(facts.fuel||''))return false;
 if(entry.cc&&!near(facts.cc,entry.cc,5))return false;
 if(entry.maxBattery&&facts.battery>entry.maxBattery)return false;
 if(entry.engine&&facts.iceKw!=null&&!near(facts.iceKw,entry.engine.iceKw,1))return false;
 if(entry.engine&&facts.iceHp!=null&&!near(facts.iceHp,entry.engine.iceHp,1.5))return false;
 if(entry.motorCode&&normalize(facts.motorCode)!==normalize(entry.motorCode))return false;
 if(entry.compatibleMotorCodes&&facts.motorCode&&!entry.compatibleMotorCodes.some(code=>normalize(code)===normalize(facts.motorCode)))return false;
 if(entry.compatibleMotorCounts&&facts.motorCount&&!entry.compatibleMotorCounts.includes(facts.motorCount))return false;
 if(entry.motorCount&&facts.motorCount!==entry.motorCount)return false;
 if(entry.drive&&facts.drive!==entry.drive)return false;
 if(entry.peak&&!near(facts.electricPeakKw,entry.peak,1)&&!(facts.electricPeakKw==null&&entry.models&&(entry.battery||entry.engine)))return false;
 if(entry.battery&&!near(facts.battery,entry.battery,.15))return false;
 if(entry.variant&&facts.variant&&entry.variant!==facts.variant)return false;
 if(facts.electricPeakKw&&bounds(entry.kw)[1]>facts.electricPeakKw)return false;
 return true;
};

// Fill only missing source specifications, and only when every compatible entry agrees.
// Keep these estimates and their provenance separate from documentary motor power.
export function completeRussianPowertrain(facts,{entries=RU_POWER_REFERENCE}={}) {
 const matches=entries.filter(entry=>entry.engine&&matchesVariant(facts,entry));
 const completed={...facts},fields=[];
 for(const field of ['iceHp','iceKw','electricPeakKw']){
  const values=[...new Set(matches.map(entry=>field==='electricPeakKw'?entry.peak:entry.engine[field]))];
  if(facts[field]==null&&values.length===1&&Number.isFinite(values[0])){completed[field]=values[0];fields.push(field);}
 }
 return {...completed,engineReference:fields.length?{fields,referenceIds:matches.map(e=>e.id),sources:[...new Set(matches.map(e=>e.engine.source))],referenceVersion:RU_POWER_REFERENCE_VERSION}:null};
}

export function resolveRussianMotorPower(facts,{entries=RU_POWER_REFERENCE}={}) {
 const result=(min,max,method,matches=[])=>({minKw:min,maxKw:max,method,referenceVersion:RU_POWER_REFERENCE_VERSION,referenceIds:matches.map(entry=>entry.id),sources:[...new Set(matches.map(entry=>entry.source))]});
 // Do not overwrite this field with an estimate: it represents document/source data.
 if(facts.continuousKw)return result(facts.continuousKw,facts.continuousKw,'document');
 if(!['electric','parallel','series'].includes(facts.kind))return result(0,0,'not-applicable');
 const matches=entries.filter(entry=>matchesVariant(facts,entry));
 if(matches.length)return result(Math.min(...matches.map(e=>bounds(e.kw)[0])),Math.max(...matches.map(e=>bounds(e.kw)[1])),'reference',matches);
 // No defensible electrical input: retain the broad existing bound, never fabricate a motor.
 return result(0,facts.electricPeakKw||null,'unknown');
}
export {RU_POWER_SOURCES};

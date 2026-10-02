// Built during the same full scan as the price index; no extra database query.
// Keep only public variant identifiers, counts and example listing IDs.
export function createPricingCoverage({version,date}) {
 const summary={total:0,point:0,range:0,wideRange:0,unavailable:0,reasons:{}};
 const groups=new Map();
 return {
  add(row,offer){
   summary.total++;
   const status=offer.status==='estimated'?(offer.range?'range':'point'):'unavailable';summary[status]++;
   const spread=offer.range?offer.range.max-offer.range.min:0;
   const wide=status==='range'&&spread>Math.max(250000,offer.range.min*.1);if(wide)summary.wideRange++;
   const reason=offer.reason||(wide?'power_range_wide':status==='range'?'power_range':'');
   if(reason)summary.reasons[reason]=(summary.reasons[reason]||0)+1;
   if(status==='point')return;
   const raw=row.source_payload||{};
   const variant={source:row.source||null,brand:row.brand||null,model:row.model||null,year:Number(row.model_year)||null,powertrain:row.powertrain||null,drive:row.drivetrain||null,
    engineCc:offer.inputs?.engineCc||raw.engineCc||null,batteryKwh:Number(row.battery_kwh)||Number(raw.battery)||null,
    motorCode:raw.motorModel||null,electricPeakKw:offer.inputs?.electricPeakKw||raw.motorPowerKw||null,
    trim:String(raw.rawModel||raw.modification||raw.trim||'').slice(0,160),reason};
   const key=JSON.stringify(variant);let group=groups.get(key);
   if(!group){group={...variant,count:0,examples:[],maxSpreadRub:0};groups.set(key,group);}
   group.count++;group.maxSpreadRub=Math.max(group.maxSpreadRub,spread);
   if(group.examples.length<3)group.examples.push(row.id);
  },
  finish(){return {version,date:new Date(date).toISOString(),summary,groups:[...groups.values()].sort((a,b)=>b.count-a.count||JSON.stringify(a).localeCompare(JSON.stringify(b)))};},
 };
}

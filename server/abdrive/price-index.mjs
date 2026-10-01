import {createAsyncCache} from '../async-cache.mjs';
import {estimateRussianOffer} from './pricing.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {RU_PRICING} from '../../config/ru-pricing.mjs';

export function createRussianPriceIndex(db,{getRates,now,cacheFile,forceRefresh=false,onProgress=()=>{}}) {
 const initialize=async()=>{
 let initial;
 if(cacheFile&&!forceRefresh)try{
  const saved=JSON.parse(await readFile(cacheFile,'utf8')),date=new Date(saved.date),age=now()-date;
  if(saved.format===1&&saved.version===RU_PRICING.version&&age>=0&&age<900000&&date.getFullYear()===now().getFullYear()&&Array.isArray(saved.prices)&&saved.prices.every(([id,price])=>typeof id==='string'&&Number.isFinite(price)&&price>0))initial={prices:new Map(saved.prices),rates:saved.rates,date};
 }catch{ /* A missing or interrupted snapshot is rebuilt from the catalog. */ }
 return createAsyncCache(async()=>{
  const rates=await getRates(),date=now();
  const result=new Map();let after='',scanned=0;
  for(;;){
   const rows=await db.query(`SELECT l.id,l.source,l.city,l.price_cny,v.brand,v.model,v.model_year,v.powertrain,l.source_payload,v.specifications FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active' AND l.id>$1 ORDER BY l.id LIMIT 1000`,[after]);
   for(const row of rows.rows){const offer=estimateRussianOffer(row,{rates,now:date});if(offer.status==='estimated')result.set(row.id,offer.totalAmount);}
   scanned+=rows.rows.length;onProgress(scanned);
   if(rows.rows.length<1000)break;after=rows.rows.at(-1).id;
  }
  if(cacheFile){
   const temporary=cacheFile+'.'+process.pid+'.tmp';
   await writeFile(temporary,JSON.stringify({format:1,version:RU_PRICING.version,prices:[...result],rates,date}),{mode:0o600});
   await rename(temporary,cacheFile);
  }
  return {prices:result,rates,date};
 },{ttl:300000,initial,initialAt:initial?+initial.date:0,now:()=>+now(),onError:error=>console.error('[abdrive] price refresh failed',error.code||error.message)});
 };
 let ready;
 return async()=>{const cached=await (ready??=initialize()),index=await cached(),current=now();if(current-index.date>900000||current.getFullYear()!==index.date.getFullYear())throw new Error('price_index_stale');return index;};
}
export function selectRussianPrices(ids,prices,{min=null,max=null,sort='newest',offset=0,limit=24}){
 const filtered=ids.filter(id=>{const price=prices.get(id);return (min===null&&max===null)||Number.isFinite(price)&&(min===null||price>=min)&&(max===null||price<=max);});
 if(['price','price_asc','price_desc'].includes(sort))filtered.sort((a,b)=>{
  const x=prices.get(a),y=prices.get(b);if(x===undefined||y===undefined)return x===y?a.localeCompare(b):x===undefined?1:-1;
  return (sort==='price_desc'?y-x:x-y)||a.localeCompare(b);
 });
 return {ids:filtered.slice(offset,offset+limit),total:filtered.length};
}

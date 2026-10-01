import {createAsyncCache} from '../async-cache.mjs';
import {estimateRussianOffer} from './pricing.mjs';

export function createRussianPriceIndex(db,{getRates,now}) {
 const cached=createAsyncCache(async()=>{
  const rates=await getRates(),date=now();
  const result=new Map();let after='';
  for(;;){
   const rows=await db.query(`SELECT l.id,l.source,l.city,l.price_cny,v.brand,v.model,v.model_year,v.powertrain,l.source_payload,v.specifications FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active' AND l.id>$1 ORDER BY l.id LIMIT 1000`,[after]);
   for(const row of rows.rows){const offer=estimateRussianOffer(row,{rates,now:date});if(offer.status==='estimated')result.set(row.id,offer.totalAmount);}
   if(rows.rows.length<1000)break;after=rows.rows.at(-1).id;
  }
  return {prices:result,rates,date};
 },{ttl:300000,onError:()=>{}});
 return async()=>{const index=await cached(),current=now();if(current-index.date>900000||current.getFullYear()!==index.date.getFullYear())throw new Error('price_index_stale');return index;};
}
export function selectRussianPrices(ids,prices,{min=null,max=null,sort='newest',offset=0,limit=24}){
 const filtered=ids.filter(id=>{const price=prices.get(id);return (min===null&&max===null)||Number.isFinite(price)&&(min===null||price>=min)&&(max===null||price<=max);});
 if(['price','price_asc','price_desc'].includes(sort))filtered.sort((a,b)=>{
  const x=prices.get(a),y=prices.get(b);if(x===undefined||y===undefined)return x===y?a.localeCompare(b):x===undefined?1:-1;
  return (sort==='price_desc'?y-x:x-y)||a.localeCompare(b);
 });
 return {ids:filtered.slice(offset,offset+limit),total:filtered.length};
}

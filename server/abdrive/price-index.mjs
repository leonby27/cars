import {estimateRussianOffer} from './pricing.mjs';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {createPricingCoverage} from './pricing-coverage.mjs';
import {RU_PRICING} from '../../config/ru-pricing.mjs';

export const PRICE_INDEX_CHECK_MS=60_000;
// Avoid reading records still being written by an importer. Its transactions
// complete before this cutoff, and the next check picks up newer records.
export const PRICE_INDEX_SETTLE_MS=5*60_000;
const columns='l.id,l.status,l.source,l.city,l.price_cny,v.brand,v.model,v.model_year,v.powertrain,v.drivetrain,v.battery_kwh,l.source_payload,v.specifications';

export function createRussianPriceIndex(db,{getRates,now,cacheFile,forceRefresh=false,onProgress=()=>{}}) {
 let current,loading,pending,lastChecked=-Infinity;
 const validPrices=prices=>Array.isArray(prices)&&prices.every(([id,price])=>typeof id==='string'&&Number.isFinite(price)&&price>0);
 const load=async()=>{
  if(!cacheFile||forceRefresh)return;
  try{
   const saved=JSON.parse(await readFile(cacheFile,'utf8'));
   const date=new Date(saved.date),syncedAt=new Date(saved.syncedAt||saved.date);
   if([1,2].includes(saved.format)&&saved.version===RU_PRICING.version&&validPrices(saved.prices)
      &&typeof saved.rates?.date==='string'&&['USD','EUR','CNY','KRW'].every(key=>Number(saved.rates[key])>0)
      &&Number.isFinite(+date)&&Number.isFinite(+syncedAt)&&date<=now()&&syncedAt<=now()
      &&date.getUTCFullYear()===now().getUTCFullYear())
    {current={prices:new Map(saved.prices),rates:saved.rates,date,syncedAt,coverage:saved.coverage,legacy:saved.format===1};lastChecked=+now();}
  }catch{ /* A missing or interrupted snapshot is rebuilt once. */ }
 };
 const persist=async index=>{
  if(!cacheFile)return;
  const temporary=cacheFile+'.'+process.pid+'.tmp';
  await writeFile(temporary,JSON.stringify({format:2,version:RU_PRICING.version,prices:[...index.prices],rates:index.rates,date:index.date,syncedAt:index.syncedAt,coverage:index.coverage}),{mode:0o600});
  await rename(temporary,cacheFile);
 };
 const calculate=(row,rates,date,prices,coverage)=>{
  if(row.status&&row.status!=='active'){prices.delete(row.id);return;}
  const offer=estimateRussianOffer(row,{rates,now:date});
  coverage?.add(row,offer);
  if(offer.status==='estimated')prices.set(row.id,offer.totalAmount);
  else prices.delete(row.id);
 };
 const full=async rates=>{
  const date=now(),prices=new Map(),coverage=createPricingCoverage({version:RU_PRICING.version,date});
  let after='',scanned=0;
  for(;;){
   const {rows}=await db.query(`SELECT ${columns} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active' AND l.id>$1 ORDER BY l.id LIMIT 1000`,[after]);
   for(const row of rows)calculate(row,rates,date,prices,coverage);
   scanned+=rows.length;onProgress(scanned);
   if(rows.length<1000)break;
   after=rows.at(-1).id;
  }
  // A transaction started just before the scan can commit after its ID has
  // passed. Revisit a small overlap on the next incremental check.
  const next={prices,rates,date,syncedAt:new Date(+date-PRICE_INDEX_SETTLE_MS),coverage:coverage.finish(),legacy:false};
  await persist(next);current=next;return next;
 };
 const incremental=async rates=>{
  const cutoff=new Date(+now()-PRICE_INDEX_SETTLE_MS);
  if(cutoff<=current.syncedAt&&!current.legacy)return current;
  const revision=await db.query(`SELECT
    (SELECT max(content_changed_at) FROM listings) AS listing_changed,
    (SELECT max(updated_at) FROM vehicles) AS vehicle_changed,
    (SELECT max(sold_at) FROM listings WHERE status='unavailable') AS sold_changed`);
  const latest=Math.max(...['listing_changed','vehicle_changed','sold_changed'].map(key=>+new Date(revision.rows[0]?.[key]||0)));
  if(!current.legacy&&latest<=+current.syncedAt)return current;
  // During a long import, publish a partial update at most every 15 minutes.
  if(!current.legacy&&latest>+cutoff&&+now()-+current.syncedAt<15*60_000)return current;
  const prices=new Map(current.prices);
  let changed=0;
  // Old five-minute snapshots contain only visible listings. Fill prices for
  // hidden active records once, so enabling a source never requires a rebuild.
  if(current.legacy){
   const {rows}=await db.query(`SELECT l.id FROM listings l WHERE l.status='active'
     AND NOT EXISTS (SELECT 1 FROM catalog_listings visible WHERE visible.id=l.id)`);
   const missing=rows.map(row=>row.id).filter(id=>!prices.has(id));
   for(let offset=0;offset<missing.length;offset+=1000){
    const batch=await db.query(`SELECT ${columns} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id=ANY($1::text[])`,[missing.slice(offset,offset+1000)]);
    for(const row of batch.rows){calculate(row,rates,current.date,prices);changed++;}
   }
  }
  // Separate indexed ranges avoid repeatedly scanning a joined catalog for
  // every 1,000-row page. Fetch detailed payloads only for affected IDs.
  const changes=await db.query(`SELECT l.id FROM listings l
     WHERE l.content_changed_at>$1 AND l.content_changed_at<=$2
     UNION SELECT l.id FROM vehicles v JOIN listings l ON l.vehicle_id=v.id
     WHERE v.updated_at>$1 AND v.updated_at<=$2
     UNION SELECT l.id FROM listings l
     WHERE l.status='unavailable' AND l.sold_at>$1 AND l.sold_at<=$2`,[current.syncedAt,cutoff]);
  const ids=changes.rows.map(row=>row.id);
  for(let offset=0;offset<ids.length;offset+=1000){
   const {rows}=await db.query(`SELECT ${columns} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id=ANY($1::text[])`,[ids.slice(offset,offset+1000)]);
   for(const row of rows){calculate(row,rates,current.date,prices);changed++;}
  }
  const next={...current,prices,syncedAt:cutoff>current.syncedAt?cutoff:current.syncedAt,legacy:false};
  await persist(next);current=next;
  if(changed)console.log('[abdrive] updated prices for',changed,'changed listings');
  return next;
 };
 const update=async()=>{
  const rates=await getRates();
  if(!current||current.rates?.date!==rates.date||current.date.getUTCFullYear()!==now().getUTCFullYear())return full(rates);
  return incremental(rates);
 };
 const check=()=>{
  if(!pending)pending=update().finally(()=>{pending=null;});
  return pending;
 };
 return async({requireFresh=false}={})=>{
  await (loading??=load());
  if(!current||requireFresh){lastChecked=+now();await check();}
  else if(+now()-lastChecked>=PRICE_INDEX_CHECK_MS){
   lastChecked=+now();void check().catch(error=>console.error('[abdrive] price refresh failed',error.code||error.message));
  }
  if(!current||now().getUTCFullYear()!==current.date.getUTCFullYear()
     ||+now()-Date.parse(current.rates.date+'T00:00:00Z')>21*86400_000)throw new Error('price_index_stale');
  return current;
 };
}
export function selectRussianPrices(ids,prices,{min=null,max=null,sort='newest',offset=0,limit=24}){
 const filtered=ids.filter(id=>{const price=prices.get(id);return (min===null&&max===null)||Number.isFinite(price)&&(min===null||price>=min)&&(max===null||price<=max);});
 if(['price','price_asc','price_desc'].includes(sort))filtered.sort((a,b)=>{
  const x=prices.get(a),y=prices.get(b);if(x===undefined||y===undefined)return x===y?a.localeCompare(b):x===undefined?1:-1;
  return (sort==='price_desc'?y-x:x-y)||a.localeCompare(b);
 });
 return {ids:filtered.slice(offset,offset+limit),total:filtered.length};
}

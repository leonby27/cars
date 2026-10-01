import {createAsyncCache} from "../async-cache.mjs";
import {originForSource,ORIGIN_SOURCES} from '../../src/origin.js';
import {listingNumber,koreanListingId} from '../../src/listing-id.js';
import {sourceVersion} from '../catalog/offer-repository.mjs';

const columns=`l.id,l.source,l.external_id,l.source_url,l.title,l.city,l.mileage_km,l.price_cny,
 l.source_payload,l.last_checked_at,l.last_seen_at,l.status,
 v.brand,v.model,v.model_year,v.powertrain,v.drivetrain,v.battery_kwh,v.electric_range_km,v.specifications,
 ARRAY(SELECT m.url FROM listing_media m WHERE m.listing_id=l.id ORDER BY m.position) AS images`;
const from='FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id';

export function catalogSelection(params) {
 const args=[];const clauses=["l.status='active'"];
 const add=(sql,value)=>{args.push(value);clauses.push(sql.replace('?',`$${args.length}`));};
 for(const [param,column] of [['brand','v.brand'],['model','v.model'],['type','v.powertrain']]){
  const value=params.get(param);if(value){if(value.length>100)throw new Error('invalid_filter');add(`${column}=?`,value);}
 }
 const text=(params.get('q')||'').trim();
 if(text){if(text.length>100)throw new Error('invalid_filter');add("(v.brand||' '||v.model||' '||v.model_year::text) ILIKE ?",'%'+text.replace(/[\\%_]/g,'\\$&')+'%');}
 const country=params.get('country');
 if(country==='china'||country==='korea')add('l.source=ANY(?::text[])',ORIGIN_SOURCES[country]);
 else if(country)throw new Error('invalid_country');
 for(const [key,column,op,min,max] of [['yearMin','v.model_year','>=',1990,2100],['yearMax','v.model_year','<=',1990,2100],['mileageMax','l.mileage_km','<=',0,1000000]]){
  const raw=params.get(key);if(raw){const n=Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw new Error('invalid_filter');add(`${column}${op}?`,n);}
 }
 if(params.get('yearMin')&&params.get('yearMax')&&Number(params.get('yearMin'))>Number(params.get('yearMax')))throw new Error('invalid_filter');
 if(params.has('priceMin')||params.has('priceMax')||['price','price_asc','price_desc'].includes(params.get('sort')))throw new Error('price_filter_unavailable');
 const sort={newest:'l.first_seen_at DESC',year_desc:'v.model_year DESC',mileage_asc:'l.mileage_km ASC'}[params.get('sort')||'newest'];
 if(!sort)throw new Error('invalid_sort');
 const page=Number(params.get('page')||1);
 if(!Number.isInteger(page)||page<1||page>100)throw new Error('invalid_page');
 return {where:clauses.join(' AND '),args,order:sort+',l.id',page,limit:24,offset:(page-1)*24};
}

export function publicCar(row) {
 return {
  id:row.id,number:listingNumber(row.id),brand:row.brand,model:row.model,year:row.model_year,
  title:[row.brand,row.model,row.model_year].filter(Boolean).join(' '),
  origin:originForSource(row.source),type:row.powertrain,drive:row.drivetrain,
  mileage:row.mileage_km==null?null:Number(row.mileage_km),battery:Number(row.battery_kwh)||null,range:Number(row.electric_range_km)||null,
  images:(row.images||[]).filter(url=>/^https?:\/\//.test(url)),
  checkedAt:row.last_checked_at||row.last_seen_at,
  offer:{status:'unavailable',currency:'RUB',destinationId:'moscow',destinationName:'Москва',totalAmount:null,reason:'tariffs_pending'},
 };
}

export function createRussianCatalog(db) {
 const pages=new Map();
 const metadata=createAsyncCache(async()=>{
   const result=await db.query(`SELECT v.brand,v.model,count(*)::int AS count ${from} WHERE l.status='active' GROUP BY v.brand,v.model ORDER BY v.brand,v.model`);
   const counts=new Map();
   for(const row of result.rows)counts.set(row.brand,(counts.get(row.brand)||0)+row.count);
   return {brands:[...counts].map(([brand,count])=>({brand,count})),models:result.rows,total:result.rows.reduce((sum,r)=>sum+r.count,0)};
 },{ttl:60000,onError:()=>{}});
 return {
  async list(params) {
   const q=catalogSelection(params);
   const key=JSON.stringify(q);
   if(!pages.has(key)){
    if(pages.size>=100)pages.delete(pages.keys().next().value);
    pages.set(key,createAsyncCache(async()=>{
   const count=await db.query(`SELECT count(*)::int AS total ${from} WHERE ${q.where}`,q.args);
   const cars=await db.query(`SELECT ${columns} ${from} WHERE ${q.where} ORDER BY ${q.order} LIMIT $${q.args.length+1} OFFSET $${q.args.length+2}`,[...q.args,q.limit,q.offset]);
   const total=count.rows[0].total;
   return {cars:cars.rows.map(publicCar),total,page:q.page,hasMore:q.page<100&&q.offset+cars.rowCount<total};
    },{ttl:30000,onError:()=>{}}));
   }
   return pages.get(key)();
  },
  async get(number) {
   if(!/^[a-zA-Z0-9-]{1,100}$/.test(number))return null;
   const korea=koreanListingId(number);
   const ids=korea?[korea]:[number,`che168-${number}`,`guazi-${number}`];
   const result=await db.query(`SELECT ${columns} ${from} WHERE l.status='active' AND l.id=ANY($1::text[])
     ORDER BY CASE WHEN l.id=$2 THEN 0 ELSE 1 END,l.id LIMIT 1`,[ids,number]);
   const row=result.rows[0];
   return row?{car:publicCar(row),sourceVersion:sourceVersion(row),sourceUrl:row.source_url}:null;
  },
  async meta(brand='') {
   if(typeof brand!=='string'||brand.length>100)throw new Error('invalid_filter');
   const all=await metadata();
   return {...all,models:brand?all.models.filter(row=>row.brand===brand&&row.model):[]};
  },
 };
}

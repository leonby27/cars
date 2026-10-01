import {russianDeliverySize} from '../../src/markets/ru-delivery.js';
import {publicCarWithoutReport,reportGroupsForCar} from '../report-access.mjs';
import {russianBrandGuide} from './brand-guide.mjs';
import {createRussianPriceIndex,selectRussianPrices} from './price-index.mjs';
import {buildCarFilters, buildCarOrder, queryCatalogMeta} from "../catalog-query.mjs";
import {createAsyncCache} from "../async-cache.mjs";
import {originForSource,ORIGIN_SOURCES} from '../../src/origin.js';
import {listingNumber,koreanListingId} from '../../src/listing-id.js';
import {vehiclePublicFacts} from '../../src/vehicle-public-facts.js';
import {listSearchVariants,findBrandInText,HERO_BRAND_RU} from '../../src/search-dictionary.js';
import {sourceVersion} from '../catalog/offer-repository.mjs';
import {createRussianRates,estimateRussianOffer} from './pricing.mjs';

const columns=`l.id,l.source,l.external_id,l.source_url,l.title,l.city,l.mileage_km,l.price_cny,
 l.source_payload,l.last_checked_at,l.last_seen_at,l.first_seen_at,l.status,
 v.brand,v.model,v.model_year,v.powertrain,v.drivetrain,v.battery_kwh,v.electric_range_km,v.combined_range_km,v.specifications,
 ARRAY(SELECT m.url FROM listing_media m WHERE m.listing_id=l.id ORDER BY m.position) AS images`;
const brandNames=[...new Set(HERO_BRAND_RU.map(([,name])=>name))];
const from='FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id';

export function catalogSelection(params) {
 const sharedParams=new URLSearchParams(params);
 for(const key of ['priceMin','priceMax','landedMin','landedMax'])sharedParams.delete(key);
 const shared=buildCarFilters(sharedParams);
 const args=[...shared.values];const clauses=[shared.where.replace(/^WHERE /,'')];
 const add=(sql,value)=>{args.push(value);clauses.push(sql.replace('?',`$${args.length}`));};
 const text=(params.get('q')||'').trim();
 if(text){
  if(text.length>100)throw new Error('invalid_filter');
  // Match names in either word order. Currency/price parsing is deliberately separate.
  const candidates=/[%_]/.test(text)?[text]:listSearchVariants(text);
  const recognized=candidates.filter(value=>findBrandInText(value,brandNames));
  const variants=(recognized.length?recognized:candidates).slice(0,12);
  if(!variants.length)throw new Error('invalid_filter');
  const alternatives=variants.map(variant=>{
   const words=variant.split(/\s+/).filter(Boolean).slice(0,8);
   return '('+words.map(word=>{
    args.push('%'+word.replace(/[\\%_]/g,'\\$&')+'%');
    return `(v.brand||' '||v.model||' '||v.model_year::text) ILIKE $${args.length}`;
   }).join(' AND ')+')';
  });
  clauses.push('('+alternatives.join(' OR ')+')');
 }
 const country=params.get('country');
 if(country==='china'||country==='korea')add('l.source=ANY(?::text[])',ORIGIN_SOURCES[country]);
 else if(country)throw new Error('invalid_country');
 for(const [key,column,op,min,max] of [['yearMin','v.model_year','>=',1990,2100],['yearMax','v.model_year','<=',1990,2100],['mileageMax','l.mileage_km','<=',0,1000000]]){
  const raw=params.get(key);if(raw){const n=Number(raw);if(!Number.isInteger(n)||n<min||n>max)throw new Error('invalid_filter');add(`${column}${op}?`,n);}
 }
 if(params.get('yearMin')&&params.get('yearMax')&&Number(params.get('yearMin'))>Number(params.get('yearMax')))throw new Error('invalid_filter');
 const priceBound=(key,alias)=>{const raw=params.get(key)??params.get(alias);if(raw===null)return null;const n=Number(raw);if(!Number.isFinite(n)||n<0||n>1e10||!raw.trim())throw new Error('invalid_filter');return n;};
 const min=priceBound('landedMin','priceMin'),max=priceBound('landedMax','priceMax');
 if(min!==null&&max!==null&&min>max)throw new Error('invalid_filter');
 if(params.has('priceCnyMax'))throw new Error('invalid_filter');
 if(['quota','refund50','quotaOver'].some(key=>params.has(key))||(params.has('currency')&&params.get('currency')!=='RUB'))throw new Error('invalid_filter');
 const orders={accel_asc:buildCarOrder(new URLSearchParams({sort:'accel_asc'})),price:'l.id',price_asc:'l.id',price_desc:'l.id',newest:'l.first_seen_at DESC',year_desc:'v.model_year DESC',year_asc:'v.model_year ASC',mileage_asc:'l.mileage_km ASC NULLS LAST',range_desc:'COALESCE(v.electric_range_km,v.combined_range_km) DESC NULLS LAST',default:buildCarOrder(new URLSearchParams({sort:'default',seed:params.get('seed')||'s0'})),variety:buildCarOrder(new URLSearchParams({sort:'default',seed:params.get('seed')||'s0'}))};
 const sortKey=params.get('sort')||'newest';
 if(!Object.hasOwn(orders,sortKey))throw new Error('invalid_sort');
 const sort=orders[sortKey];
 const page=Number(params.get('page')||1);
 if(!Number.isInteger(page)||page<1||page>100)throw new Error('invalid_page');
 const limit=Number(params.get('limit')||24),offset=Number(params.get('offset')??((page-1)*limit));
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>5000)throw new Error('invalid_page');
 return {where:clauses.join(' AND '),args,order:sort+',l.id',page,limit,offset,min,max,sort:sortKey,priced:min!==null||max!==null||sortKey.startsWith('price')};
}

export function publicCar(row,{detail=false,rates,now}={}) {
 return {
  ...sharedVehicleFields(row),
  _summary:!detail,
  sourcePrice:Number(row.source_payload?.sourcePrice??row.price_cny)||null,sourceCurrency:row.source_payload?.sourceCurrency||(originForSource(row.source)==='korea'?'KRW':'CNY'),
  id:row.id,number:listingNumber(row.id),brand:row.brand,model:row.model,year:row.model_year,
  title:[row.brand,row.model,row.model_year].filter(Boolean).join(' '),
  origin:originForSource(row.source),type:row.powertrain,drive:row.drivetrain,
  mileage:row.mileage_km==null?null:Number(row.mileage_km),battery:Number(row.battery_kwh)||null,range:Number(row.electric_range_km)||null,
  images:(row.images||[]).filter(url=>/^https?:\/\//.test(url)),
  ...(detail?{facts:vehiclePublicFacts(row),...publicCarWithoutReport({technicalSpecs:listingTechnicalSpecs(row)})}:{}),
  checkedAt:row.last_checked_at||row.last_seen_at,
  offer:estimateRussianOffer(row,{rates,now}),
 };
}

export function createRussianCatalog(db,{getRates=createRussianRates(),now=()=>new Date()}={}) {
 const pages=new Map();
 const priceIndex=createRussianPriceIndex(db,{getRates,now});
 const sharedMeta=new Map();
 const metadata=createAsyncCache(async()=>{
   const result=await db.query(`SELECT v.brand,v.model,count(*)::int AS count,min(l.id) AS sample_id,min(v.model_year) AS "yearMin",max(v.model_year) AS "yearMax",array_agg(l.id) AS ids,array_agg(DISTINCT v.powertrain) AS powertrains,array_agg(DISTINCT v.specifications->>'bodyType') AS "bodyTypes",max(COALESCE(v.electric_range_km,v.combined_range_km)) AS range,min(CASE WHEN v.specifications->>'acceleration' ~ '^[0-9]+([.][0-9]+)?$' THEN (v.specifications->>'acceleration')::numeric END) AS accel ${from} WHERE l.status='active' GROUP BY v.brand,v.model ORDER BY v.brand,v.model`);
   const photos=await db.query('SELECT DISTINCT ON (listing_id) listing_id,url FROM listing_media WHERE listing_id=ANY($1::text[]) ORDER BY listing_id,position',[result.rows.map(row=>row.sample_id)]);
   const imageById=new Map(photos.rows.map(row=>[row.listing_id,row.url]));
   result.rows=result.rows.map(({sample_id,...row})=>({...row,image:imageById.get(sample_id)||null}));
   const counts=new Map();
   for(const row of result.rows)counts.set(row.brand,(counts.get(row.brand)||0)+row.count);
   return {brands:[...counts].map(([brand,count])=>({brand,count})),models:result.rows,total:result.rows.reduce((sum,r)=>sum+r.count,0)};
 },{ttl:60000,onError:()=>{}});
 return {
  warmPrices:priceIndex,
  async list(params) {
   const q=catalogSelection(params);
   const key=JSON.stringify(q);
   if(!pages.has(key)){
    if(pages.size>=100)pages.delete(pages.keys().next().value);
    pages.set(key,createAsyncCache(async()=>{
   if(q.priced){
    const [candidates,index]=await Promise.all([db.query(`SELECT l.id ${from} WHERE ${q.where} ORDER BY ${q.order}`,q.args),priceIndex()]);
    const selection=selectRussianPrices(candidates.rows.map(row=>row.id),index.prices,q);
    const selected=selection.ids.length?await db.query(`SELECT ${columns} ${from} WHERE l.status='active' AND l.id=ANY($1::text[])`,[selection.ids]):{rows:[]};
    const positions=new Map(selection.ids.map((id,i)=>[id,i]));
    const items=selected.rows.sort((a,b)=>positions.get(a.id)-positions.get(b.id)).map(row=>publicCar(row,{rates:index.rates,now:index.date}));
    return {cars:items,items,total:selection.total,page:q.page,limit:q.limit,offset:q.offset,hasMore:q.offset+q.limit<Math.min(selection.total,5000)};
   }
   const count=await db.query(`SELECT count(*)::int AS total ${from} WHERE ${q.where}`,q.args);
   const cars=await db.query(`SELECT ${columns} ${from} WHERE ${q.where} ORDER BY ${q.order} LIMIT $${q.args.length+1} OFFSET $${q.args.length+2}`,[...q.args,q.limit,q.offset]);
   const total=count.rows[0].total;
   const rates=await getRates();
   const items=cars.rows.map(row=>publicCar(row,{rates,now:now()}));return {cars:items,items,total,page:q.page,limit:q.limit,offset:q.offset,hasMore:q.offset+cars.rowCount<Math.min(total,5000),refreshedAt:items.reduce((date,car)=>String(car.checkedAt||'')>date?String(car.checkedAt):date,'')};
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
   return row?{car:publicCar(row,{detail:true,rates:await getRates(),now:now()}),sourceVersion:sourceVersion(row),sourceUrl:row.source_url}:null;
  },
  async report(number) {
   if(!/^[a-zA-Z0-9-]{1,100}$/.test(number))return null;
   const korea=koreanListingId(number),ids=korea?[korea]:[number,`che168-${number}`,`guazi-${number}`];
   const result=await db.query(`SELECT l.source_payload ${from} WHERE l.status='active' AND l.id=ANY($1::text[]) ORDER BY CASE WHEN l.id=$2 THEN 0 ELSE 1 END,l.id LIMIT 1`,[ids,number]);
   return result.rows[0]?reportGroupsForCar({technicalSpecs:listingTechnicalSpecs(result.rows[0])}):null;
  },
  async brandGuide(brand) {
   if(typeof brand!=='string'||brand.length>100)throw new Error('invalid_filter');
   const [meta,index]=await Promise.all([metadata(),priceIndex()]);return russianBrandGuide(brand,meta.models,index,now());
  },
  async modelFacts() {
   const [meta,index]=await Promise.all([metadata(),priceIndex()]);
   return {models:meta.models.map(({ids,...row})=>{const prices=ids.map(id=>index.prices.get(id)).filter(Number.isFinite);return {...row,priceMin:prices.length?Math.min(...prices):null,priceMax:prices.length?Math.max(...prices):null};})};
  },
  async summary(params) {
   const q=catalogSelection(params);
   if(q.min!==null||q.max!==null){
    const [candidates,index]=await Promise.all([db.query(`SELECT l.id ${from} WHERE ${q.where}`,q.args),priceIndex()]);
    const selected=selectRussianPrices(candidates.rows.map(row=>row.id),index.prices,{min:q.min,max:q.max,limit:candidates.rows.length});
    q.args.push(selected.ids);q.where+=` AND l.id=ANY($${q.args.length}::text[])`;
   }
   const numeric=name=>`CASE WHEN v.specifications->>'${name}' ~ '^[0-9]+([.][0-9]+)?$' THEN (v.specifications->>'${name}')::numeric END`;
   const result=await db.query(`SELECT count(*)::int AS total,min(v.model_year) AS "yearMin",max(v.model_year) AS "yearMax",min(l.mileage_km) AS "mileageMin",max(v.battery_kwh) AS "batteryMax",max(COALESCE(v.electric_range_km,v.combined_range_km)) AS "rangeMax",max(${numeric('enginePower')}) AS "powerMax",min(${numeric('acceleration')}) AS "accelMin",max(${numeric('torqueNm')}) AS "torqueMax",max(l.last_checked_at) AS "changedAt" ${from} WHERE ${q.where}`,q.args);
   const groups=await db.query(`SELECT v.powertrain AS type,count(*)::int AS count ${from} WHERE ${q.where} GROUP BY v.powertrain ORDER BY count DESC`,q.args);
   const bodies=await db.query(`SELECT v.specifications->>'bodyType' AS name,count(*)::int AS count ${from} WHERE ${q.where} AND v.specifications->>'bodyType' IS NOT NULL GROUP BY 1 ORDER BY count DESC`,q.args);
   return {...result.rows[0],powertrains:groups.rows,bodyTypes:bodies.rows};
  },
  async sharedMeta(params) {
   const key=params.toString();
   if(!sharedMeta.has(key)) {if(sharedMeta.size>=100)sharedMeta.delete(sharedMeta.keys().next().value); sharedMeta.set(key,createAsyncCache(()=>queryCatalogMeta(db,params.get('type'),params.get('brand'),params.getAll('bodyType'),params.get('country')),{ttl:60000,onError:()=>{}}));}
   return sharedMeta.get(key)();
  },
  async meta(brand='') {
   if(typeof brand!=='string'||brand.length>100)throw new Error('invalid_filter');
   const all=await metadata();
   return {...all,models:brand?all.models.filter(row=>row.brand===brand&&row.model).map(({ids,...row})=>row):[]};
  },
 };
}

// Explicit public contract for the shared UI; never spread source_payload.
function sharedVehicleFields(row) {
 const spec=row.specifications||{}, raw=row.source_payload||{};
 const allowed=['bodyType','bodyColor','engine','engineVolume','enginePower','transmission','gearbox','fuelType','sourceFuelType','acceleration','tireRim','dimensions','curbWeight','batteryType','batteryBrand','vehicleClass'];
 const fields={};
 for(const key of allowed) {const value=raw[key]??spec[key];if(typeof value==='string'||typeof value==='number')fields[key]=typeof value==='string'?value.slice(0,160):value;}
 const size=russianDeliverySize(row);
 return {...fields,...(size.lengthMm?{dimensions:fields.dimensions||String(size.lengthMm)}:{}),...(size.curbWeight?{curbWeight:size.curbWeight}:{}),source:row.source,city:row.city,image:row.images?.[0]||null,electricRange:row.electric_range_km,combinedRange:row.combined_range_km,firstSeenAt:row.first_seen_at,available:true};
}

// Project only the published specification shape; omit upstream metadata and contacts.
function listingTechnicalSpecs(row){
 const raw=row.source_payload?.technicalSpecs;
 if(!Array.isArray(raw?.groups))return null;
 const groups=raw.groups.slice(0,100).filter(g=>g&&typeof g.name==='string'&&Array.isArray(g.items)).map(g=>({name:g.name.slice(0,160),items:g.items.slice(0,500).filter(item=>item&&typeof item.name==='string'&&['string','number'].includes(typeof item.value)).map(item=>({name:item.name.slice(0,300),value:String(item.value).slice(0,2000)}))})).filter(g=>g.items.length);
 return {groups,count:groups.reduce((n,g)=>n+g.items.length,0)};
}

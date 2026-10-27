import {readFileSync,statSync} from 'node:fs';
import {CATALOG_LANDINGS} from '../src/catalog-landings.js';
const file=new URL('../dist/catalog-page-facts.json',import.meta.url);
let stamp=null,saved=null;
export function prepareCatalogPageFacts(live) {
  const routes={'/catalog':{total:live.activeCars||0,changedAt:live.changed?.get('/catalog')||null}};
  for(const landing of CATALOG_LANDINGS) routes[landing.path]={total:live.stock?.get(landing.path)||0,changedAt:live.changed?.get(landing.path)||null};
  return {version:1,routes,models:live.modelRows||[]};
}
function snapshot(){
  try{
    const current=statSync(file).mtimeMs;
    if(current!==stamp){const next=JSON.parse(readFileSync(file,'utf8'));saved=next.version===1?next:null;stamp=current;}
    return saved;
  }catch{return null;}
}
export const preparedCatalogFacts=path=>snapshot()?.routes?.[path]||null;
export function preparedModelFacts(brand,model){
  const row=snapshot()?.models?.find(item=>item.brand===brand&&item.model===model);
  return row?{total:row.count,priceFrom:row.priceMin,yearMin:row.yearMin,yearMax:row.yearMax,changedAt:row.changedAt||null}:null;
}
export const preparedBrandModels=brand=>(snapshot()?.models||[]).filter(row=>row.brand===brand).map(({model,count})=>({model,count}));
export function preparedBrandStock(){
  const routes=snapshot()?.routes||{};
  return new Map(CATALOG_LANDINGS.filter(item=>item.kind==='brand').map(item=>[item.brand,routes[item.path]?.total??1]));
}

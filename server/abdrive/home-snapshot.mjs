import {readFile,writeFile,rename} from 'node:fs/promises';
import {homePopularModels} from '../../src/home-popular-models.js';
import {RU_PRICING} from '../../config/ru-pricing.mjs';

export const EMPTY_RUSSIAN_HOME=Object.freeze({homeShowcase:[],popularModels:[],brandModelTabs:[],catalogFacts:{total:0,updatedAt:''}});
// The homepage needs one batch and preview photos, not three copies of 60 galleries.
export function compactRussianShowcase(cars=[]) {
 return cars.slice(0,20).map(car=>{
  const {assumptions,...offer}=car.offer||{};
  return {...car,_summary:true,images:(car.images||[]).slice(0,5),offer};
 });
}
export async function prepareRussianHome(catalog,{now=Date.now}={}) {
 const [page,meta,facts]=await Promise.all([
  catalog.list(new URLSearchParams({limit:'20',sort:'variety',seed:'s0'})),
  catalog.sharedMeta?catalog.sharedMeta(new URLSearchParams()):catalog.meta(''),
  catalog.modelFacts?catalog.modelFacts():Promise.resolve({models:[]}),
 ]);
 const models=homePopularModels(facts.models||[]);
 return {format:1,version:RU_PRICING.version,savedAt:now(),boot:{
  homeShowcase:compactRussianShowcase(page.items||page.cars),popularModels:models.models,brandModelTabs:models.brands,
  catalogFacts:{total:page.total,updatedAt:page.refreshedAt||''},
  metaValue:{bodyTypes:[],drives:[],countries:[],availability:{},...meta},metaQuery:'',
 }};
}
export async function writeRussianHome(file,snapshot) {
 const temporary=file+'.'+process.pid+'.tmp';
 await writeFile(temporary,JSON.stringify(snapshot),{mode:0o600});await rename(temporary,file);
}
export async function createRussianHomeSnapshot({catalog,file,now=Date.now,onError=console.error,refreshMs=300000}) {
 let saved=null,pending=null,retryAt=0;
 const valid=value=>value?.format===1&&value.version===RU_PRICING.version&&Number.isFinite(value.savedAt)&&now()-value.savedAt>=0&&now()-value.savedAt<86400000&&Array.isArray(value.boot?.homeShowcase)&&Array.isArray(value.boot?.popularModels)&&Array.isArray(value.boot?.brandModelTabs);
 if(file)try{const value=JSON.parse(await readFile(file,'utf8'));if(valid(value))saved=value;}catch{}
 const refresh=()=>pending??=(async()=>{
  const next=await prepareRussianHome(catalog,{now});
  if(file)await writeRussianHome(file,next);
  saved=next;retryAt=0;return next.boot;
 })().catch(error=>{retryAt=now()+30000;throw error;}).finally(()=>{pending=null;});
 const due=()=>!saved||now()-saved.savedAt>=refreshMs;
 return {
  refresh,
  get(){
   if(due()&&now()>=retryAt&&!pending) {
    // Starts after the current response, never waits for a cold catalog or price index.
    setImmediate(()=>{if(due()&&!pending&&now()>=retryAt)refresh().catch(onError);});
   }
   return saved&&valid(saved)?saved.boot:EMPTY_RUSSIAN_HOME;
  },
 };
}

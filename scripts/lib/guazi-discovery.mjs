// The public catalogue caps each result set at 500 positions. Its recommendId
// keeps pagination tied to the same result set. Split larger sets, not filters.
export const DISCOVERY_VERSION=2;
export function splitDiscoveryNode(node,minYear,currentYear=new Date().getUTCFullYear()){
 const f=node.filters;
 if(node.axis===undefined)return Array.from({length:currentYear-minYear+1},(_,i)=>{const year=minYear+i;return{filters:{...f,licenseYearStart:year,...(year<currentYear?{licenseYearEnd:year}:{})},axis:'mileage',low:0,high:null};});
 const field=node.axis==='mileage'?'roadHaul':'price';const low=node.low??0,high=node.high;
 if(high===low){if(node.axis==='mileage')return[{filters:{...f},axis:'price',low:0,high:null}];throw Error('Unsplittable dense Guazi result set');}
 const mid=high===null?Math.max(50000,low*2)-1:Math.floor((low+high)/2);
 if(mid>1e9)throw Error('Guazi result split exceeded supported range');
 return[{filters:{...f,[field+'Start']:low,[field+'End']:mid},axis:node.axis,low,high:mid},{filters:{...f,[field+'Start']:mid+1,...(high===null?{}:{[field+'End']:high})},axis:node.axis,low:mid+1,high}];
}
export function compactCandidate(x){return Object.fromEntries(['productId','seoUri','brandId','fuelTypeName','licenseDate','mileage','seriesId'].map(k=>[k,x[k]]));}
export function validateDiscoveryItem(item,filters){
 if(!/^[a-z0-9]{10}$/.test(item.productId||'')||typeof item.seoUri!=='string')throw Error('Invalid Guazi discovery identity');
 const year=Number(String(item.licenseDate||'').slice(0,4));
 if((filters.licenseYearStart!==undefined||filters.licenseYearEnd!==undefined)&&(!Number.isInteger(year)||year<filters.licenseYearStart||(filters.licenseYearEnd!==undefined&&year>filters.licenseYearEnd)))throw Object.assign(Error(`Guazi ignored registration subdivision: ${item.productId} date=${item.licenseDate}`),{code:'GUAZI_REGISTRATION_SUBDIVISION',id:item.productId});
 if(filters.priceStart!==undefined||filters.priceEnd!==undefined){const price=Number(String(item.price||'').replace(/[$,\s]/g,''));if(!Number.isFinite(price)||price<filters.priceStart||(filters.priceEnd!==undefined&&price>filters.priceEnd))throw Error('Guazi ignored price subdivision');}
 if(filters.roadHaulStart!==undefined||filters.roadHaulEnd!==undefined){const mileage=Number(String(item.mileage).replace(/km|,/gi,'').trim());if(!Number.isFinite(mileage)||mileage<filters.roadHaulStart||(filters.roadHaulEnd!==undefined&&mileage>filters.roadHaulEnd))throw Error('Guazi ignored mileage subdivision');}
}
export async function discoverPartition({search,body,state,save,event=async()=>{},leafLimit=400,currentYear=new Date().getUTCFullYear()}){
 if(state.version!==DISCOVERY_VERSION)throw Error('Unexpected discovery version');
 state.candidates||={};state.root||={filters:{}};
 async function walk(node,depth=0){
  if(depth>50)throw Error('Guazi discovery subdivision limit');
  if(node.done)return;
  if(node.children){for(const c of node.children)await walk(c,depth+1);node.done=true;await save();return;}
  for(let attempt=0;attempt<2;attempt++){
   let recommendId,expected=0;const seen=new Set();let incomplete=false;
   for(let page=1;page<=25;page++){
    const request={...body,...node.filters,sort:'created_at desc',pageNum:page,...(recommendId?{recommendId}:{})};
    const data=(await search(request)).data;expected=Math.max(expected,data.totalCount);node.total=data.totalCount;
    if(data.totalCount>leafLimit){incomplete=true;break;}
    if(data.recommendId)recommendId=data.recommendId;
    const oldSize=seen.size;
    for(const item of data.list){validateDiscoveryItem(item,node.filters);seen.add(item.productId);state.candidates[item.productId]=compactCandidate(item);}
    node.lastPage=page;node.observedUnique=seen.size;await save();
    await event({event:'discovery_page',filters:node.filters,page,total:expected,unique:seen.size});
    if(seen.size>=expected){node.done=true;node.completedIds=[...seen];node.completedAt=new Date().toISOString();await save();return;}
    if(!data.list.length||seen.size===oldSize||page*body.pageSize>=expected){incomplete=true;break;}
   }
   if(!incomplete)incomplete=true;
   if(node.total>leafLimit)break;
   await event({event:'discovery_retry',filters:node.filters,attempt:attempt+1,expected,unique:seen.size});
  }
  node.children=splitDiscoveryNode(node,body.licenseYearStart,currentYear);await save();
  await event({event:'discovery_split',filters:node.filters,total:node.total,children:node.children.length});
  for(const c of node.children)await walk(c,depth+1);
  node.done=true;await save();
 }
 try{await walk(state.root);}catch(error){
  if(error.code!=='GUAZI_REGISTRATION_SUBDIVISION'||state.registrationFallback)throw error;
  // List licenseDate can contradict the registration date used by source search.
  // Restart the whole partition using mileage, retaining the original base filter.
  // Do not silently accept unreliable year partitions or drop the anomalous ID.
  state.registrationFallback={at:new Date().toISOString(),id:error.id,previousRoot:state.root};
  state.root={filters:{},axis:'mileage',low:0,high:null};state.complete=false;await save();
  await event({event:'discovery_fallback',reason:'registration_subdivision_mismatch',id:error.id,axis:'mileage'});
  await walk(state.root);
 }
 if(state.registrationFallback){
  const ids=new Set();
  const collect=node=>{if(node.children){for(const child of node.children)collect(child);}else{if(!node.done||!Array.isArray(node.completedIds))throw Error('Unverified Guazi fallback leaf');for(const id of node.completedIds)ids.add(id);}};
  collect(state.root);
  // Count only this completed traversal, not IDs cached by the abandoned year scan.
  state.fallbackCoverage={expected:state.root.total,unique:ids.size};
  if(ids.size<state.root.total){await save();throw Error(`Incomplete Guazi fallback coverage: ${ids.size}/${state.root.total}`);}
 }
 state.complete=true;await save();return Object.values(state.candidates);
}

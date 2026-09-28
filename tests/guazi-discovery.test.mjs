import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverPartition,splitDiscoveryNode,validateDiscoveryItem,DISCOVERY_VERSION} from '../scripts/lib/guazi-discovery.mjs';
const base={pageNum:1,pageSize:20,licenseYearStart:2021};
const item=(i,year=2024,mileage=20000)=>({productId:String(i).padStart(10,'0'),seoUri:`test-${String(i).padStart(10,'0')}.html`,licenseDate:`${year}0101`,mileage:`${mileage}km`});
test('large result set is subdivided without ever requesting position beyond 500, tokens prevent shuffled duplicates',async()=>{
 const cars=Array.from({length:528},(_,i)=>item(i,2021+i%6));const requests=[];const state={version:DISCOVERY_VERSION};
 const search=async b=>{requests.push(b);const selected=cars.filter(x=>+x.licenseDate.slice(0,4)>=b.licenseYearStart&&(!b.licenseYearEnd||+x.licenseDate.slice(0,4)<=b.licenseYearEnd));if(b.pageNum>1)assert.equal(b.recommendId,`token-${b.licenseYearStart}`);assert.ok(b.pageNum*b.pageSize<=500);return{data:{totalCount:selected.length,recommendId:`token-${b.licenseYearStart}`,list:selected.slice((b.pageNum-1)*b.pageSize,b.pageNum*b.pageSize)}};};
 const result=await discoverPartition({search,body:base,state,save:async()=>{},currentYear:2026});assert.equal(result.length,528);assert.equal(state.complete,true);assert.equal(state.root.children.length,6);assert.equal(new Set(result.map(x=>x.productId)).size,528);
 const count=requests.length;await discoverPartition({search,body:base,state,save:async()=>{},currentYear:2026});assert.equal(requests.length,count);
});
test('an interrupted scan restarts its unfinished subset and keeps all discovered IDs',async()=>{
 const state={version:DISCOVERY_VERSION};let fail=true,calls=0;
 const search=async b=>{calls++;if(b.pageNum===2&&fail)throw Object.assign(Error('access check'),{code:'SOURCE_BLOCKED'});return{data:{totalCount:21,recommendId:'token',list:Array.from({length:21},(_,i)=>item(i)).slice((b.pageNum-1)*20,b.pageNum*20)}};};
 await assert.rejects(discoverPartition({search,body:base,state,save:async()=>{}}),/access check/);assert.equal(Object.keys(state.candidates).length,20);assert.notEqual(state.complete,true);
 fail=false;const result=await discoverPartition({search,body:base,state,save:async()=>{}});assert.equal(result.length,21);assert.equal(calls,4);
});
test('repeating incomplete pages cause subdivision, not silent completion or endless pagination',async()=>{
 const state={version:DISCOVERY_VERSION};let rootCalls=0;
 const search=async b=>{const year=b.licenseYearStart;const isRoot=b.licenseYearEnd===undefined&&year===2021;if(isRoot){rootCalls++;return{data:{totalCount:21,list:Array.from({length:20},(_,i)=>item(i)),recommendId:'r'}};}return{data:{totalCount:year===2024?21:0,list:year===2024?Array.from({length:21},(_,i)=>item(i)).slice((b.pageNum-1)*20,b.pageNum*20):[],recommendId:'r'}};};
 const result=await discoverPartition({search,body:base,state,save:async()=>{},currentYear:2026});assert.equal(result.length,21);assert.equal(rootCalls,4);assert.equal(state.root.children.length,6);
});
test('mileage ranges cover zero, boundaries and unbounded tail without gaps; ignored subdivision is rejected',()=>{
 const [a,b]=splitDiscoveryNode({filters:{licenseYearStart:2024,licenseYearEnd:2024},axis:'mileage',low:0,high:null},2021);assert.equal(a.filters.roadHaulStart,0);assert.equal(a.filters.roadHaulEnd,49999);assert.equal(b.filters.roadHaulStart,50000);assert.equal(b.filters.roadHaulEnd,undefined);
 validateDiscoveryItem(item(1,2024,0),a.filters);validateDiscoveryItem(item(1,2024,50000),b.filters);assert.throws(()=>validateDiscoveryItem(item(1,2024,50000),a.filters),/ignored mileage/);assert.throws(()=>validateDiscoveryItem(item(1,2025),a.filters),/ignored registration/);
});

test('root discovery retains malformed registration for normal candidate rejection, not false subdivision failure',async()=>{
 const state={version:DISCOVERY_VERSION},bad={...item(1),licenseDate:null};
 const result=await discoverPartition({search:async()=>({data:{totalCount:1,list:[bad]}}),body:base,state,save:async()=>{}});assert.equal(result.length,1);assert.equal(result[0].licenseDate,null);assert.throws(()=>validateDiscoveryItem(bad,{licenseYearStart:2024,licenseYearEnd:2024}),/ignored registration/);
});

function registrationMismatchSource({omitFromMileage=false,ignoreMileage=false}={}){
 const cars=Array.from({length:437},(_,i)=>({...item(i,i===60?2013:2023,i%2?70000:20000),actualRegistrationYear:2023}));
 const requests=[];
 return {requests,search:async b=>{
  requests.push(b);
  let selected=cars.filter(x=>x.actualRegistrationYear>=b.licenseYearStart&&(!b.licenseYearEnd||x.actualRegistrationYear<=b.licenseYearEnd));
  if(b.roadHaulStart!==undefined){
   selected=selected.filter(x=>+x.mileage.replace('km','')>=b.roadHaulStart&&(!b.roadHaulEnd||+x.mileage.replace('km','')<=b.roadHaulEnd));
   if(omitFromMileage)selected=selected.filter(x=>x.productId!==item(436).productId);
   if(ignoreMileage&&b.roadHaulStart===0)selected[0]={...selected[0],mileage:'70000km'};
  }
  // The anomalous year scan is small, so it reaches the contradictory item.
  if(b.licenseYearEnd)selected=selected.slice(0,144);
  return{data:{totalCount:selected.length,recommendId:'test',list:selected.slice((b.pageNum-1)*20,b.pageNum*20)}};
 }};
}
test('contradictory registration switches whole partition to mileage and proves complete unique coverage',async()=>{
 const source=registrationMismatchSource(),state={version:DISCOVERY_VERSION};const events=[];
 const result=await discoverPartition({...source,body:{...base,licenseYearStart:2022},state,save:async()=>{},event:async e=>events.push(e),currentYear:2026});
 assert.equal(result.length,437);assert.equal(state.complete,true);assert.equal(state.registrationFallback.id,item(60).productId);
 assert.deepEqual(state.fallbackCoverage,{expected:437,unique:437});
 assert.ok(source.requests.filter(x=>x.roadHaulStart!==undefined).every(x=>x.licenseYearStart===2022&&x.licenseYearEnd===undefined));
 assert.equal(events.filter(e=>e.event==='discovery_fallback').length,1);
 const resumed=JSON.parse(JSON.stringify(state));await discoverPartition({search:async()=>{throw Error('Must reuse completed scan');},body:base,state:resumed,save:async()=>{}});
});
test('fallback still rejects missing coverage and ignored mileage filters',async()=>{
 const state={version:DISCOVERY_VERSION,candidates:{[item(436).productId]:item(436)}};
 await assert.rejects(discoverPartition({...registrationMismatchSource({omitFromMileage:true}),body:base,state,save:async()=>{},currentYear:2026}),/Incomplete Guazi fallback coverage: 436\/437/);
 assert.notEqual(state.complete,true);
 await assert.rejects(discoverPartition({...registrationMismatchSource({ignoreMileage:true}),body:base,state:{version:DISCOVERY_VERSION},save:async()=>{},currentYear:2026}),/ignored mileage/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {openGuaziBrowser} from '../scripts/lib/guazi-pilot-browser.mjs';

const api='https://en.guazi.com/os/facade/search/product/list?language=en';
const car='https://en.guazi.com/products/tesla-y2ud7mtru4.html';
const payload={code:0,success:true,data:{totalCount:1,list:[{productId:'y2ud7mtru4'}]}};
async function fixture(mode='recover'){
 let current='',visits=0,challenge=false,listener,posts=0,disposed=0,clicks=0,launches=0;
 const requests=[],events=[];
 const response=(status=200,json=true,body=payload)=>({status:()=>status,ok:()=>status===200,url:()=>api,headers:()=>({'content-type':json?'application/json':'text/html'}),body:async()=>Buffer.from(json?JSON.stringify(body):'<title>Security Verification</title>'),dispose:async()=>{disposed++;},request:()=>({method:()=> 'POST',postDataJSON:()=>({guid:'visitor-'+visits,did:'device-'+visits})})});
 const observe=()=>listener?.(response());
 const page={route:async()=>{},setDefaultTimeout:()=>{},url:()=>current,on:(_,fn)=>{listener=fn;},off:()=>{listener=null;},
  goto:async url=>{current=url;visits++;challenge=visits>1;if(!challenge)observe();return{status:()=>200};},reload:async()=>{},
  evaluate:async()=>({url:current,title:challenge?'Security Verification':'Catalog',text:'',scripts:[],products:challenge?[]:[car],pages:[],listingLinks:[]}),
  frames:()=>[{url:()=> 'https://gcaptcha.eo.gtimg.com/static/template/widget_ele_global_eo.test.html',locator:()=>({isVisible:async()=>true,click:async()=>{clicks++;challenge=false;observe();}})}],close:async()=>{}};
 const context={route:async()=>{},newPage:async()=>page,close:async()=>{},request:{post:async(url,options)=>{
  posts++;requests.push(structuredClone(options.data));
  if(mode==='auth')return response(401,false);
  if(mode==='bad-json')return response(200,true,{code:0,success:true,data:{totalCount:1,list:null}});
  return posts===1||mode==='persistent'?response(200,false):response();
 }}};
 const browser=await openGuaziBrowser({publicOnly:true,transport:'session-http',verifyCheckbox:true,timeout:1500,delay:0,requestInterval:0,onEvent:async e=>events.push(e)},{browserEngine:{launch:async()=>{launches++;return{newContext:async()=>context,close:async()=>{}};}}});
 await browser.publicBootstrap();
 return{browser,requests,events,stats:()=>({visits,posts,disposed,clicks,launches})};
}
test('list HTML challenge renews anonymous identity in the same browser and retries identical selection once',async()=>{
 const f=await fixture();const body={brandId:'103865',licenseYearStart:2022,licenseYearEnd:2022,pageNum:3,recommendId:'same-pagination-token',fuelTypes:[2]};
 try{
  assert.deepEqual(await f.browser.publicSearch(body),payload);
  assert.deepEqual(f.requests,[{...body,did:'device-1',guid:'visitor-1'},{...body,did:'device-2',guid:'visitor-2'}]);
  assert.deepEqual(f.stats(),{visits:2,posts:2,disposed:2,clicks:1,launches:1});
  assert.equal(f.events.filter(e=>e.stage==='session_refreshed').length,1);
  assert.ok(!JSON.stringify(f.events).includes('visitor-'));
 }finally{await f.browser.close();}
});
test('a second list check stops; authentication or malformed JSON never triggers catalog recovery',async()=>{
 for(const mode of ['persistent','auth','bad-json']){
  const f=await fixture(mode);
  try{
   await assert.rejects(f.browser.publicSearch({pageNum:1}),mode==='bad-json'?/Unrecognized public list/:{code:'SOURCE_BLOCKED'});
   assert.equal(f.stats().posts,mode==='persistent'?2:1);assert.equal(f.stats().visits,mode==='persistent'?2:1);assert.equal(f.stats().disposed,f.stats().posts);
  }finally{await f.browser.close();}
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {openGuaziBrowser,verificationBudget} from '../scripts/lib/guazi-pilot-browser.mjs';
const url='https://en.guazi.com/products/tesla-y2ud7mtru4.html';
const raw={productId:'y2ud7mtru4',clueId:172877314,title:'Tesla Model Y',images:[]};
const script=`self.__next_f.push([1,${JSON.stringify('0:'+JSON.stringify({rawData:raw})+'\n')}])`;
test('verification budget permits later checks but stops rapid checks and excessive hourly attempts',()=>{
 let now=0;const b=verificationBudget({now:()=>now});assert.equal(b.take(),null);assert.equal(b.take(),'verification_too_frequent');
 for(let i=1;i<4;i++){now=i*60000;assert.equal(b.take(),null);}
 now=240000;assert.equal(b.take(),'verification_hourly_limit');now=3600000;assert.equal(b.take(),null);
});
test('same anonymous context can pass a second later checkbox, without rotating the browser',async()=>{
 const realNow=Date.now;let offset=0;Date.now=()=>realNow()+offset;
 let current='',challenge=false,blockNext=false,clicks=0,launches=0,closed=false;
 const events=[];
 const page={route:async()=>{},setDefaultTimeout:()=>{},url:()=>current,
  goto:async u=>{current=u;challenge=true;return{status:()=>200};},reload:async()=>{},
  evaluate:async()=>challenge?{url:current,title:'Security Verification',text:'Security Verification',scripts:[],products:[]}:{url:current,title:'Car',text:'Car',scripts:[script],products:[url],pages:[],listingLinks:[]},
  frames:()=>[{url:()=> 'https://gcaptcha.eo.gtimg.com/static/template/widget_ele_global_eo.test.html',locator:()=>({isVisible:async()=>true,click:async()=>{clicks++;challenge=false;}})}],close:async()=>{}};
 const context={route:async()=>{},newPage:async()=>page,close:async()=>{closed=true;},request:{get:async()=>{
  const denied=blockNext;blockNext=false;
  return{status:()=>200,url:()=>url,headers:()=>({}),body:async()=>Buffer.from(denied?'<title>Security Verification</title>':`<script>${script}</script>`),dispose:async()=>{}};
 }}};
 const browserEngine={launch:async()=>{launches++;return{newContext:async()=>context,close:async()=>{}};}};
 let browser;
 try{
  browser=await openGuaziBrowser({publicOnly:true,transport:'session-http',verifyCheckbox:true,timeout:2000,delay:0,requestInterval:0,onEvent:async e=>events.push(e)},{browserEngine});
  await browser.listing('https://en.guazi.com/used-cars/');assert.equal(clicks,1);
  offset=61000;blockNext=true;const reader=await browser.worker();const car=await reader.card(url);assert.equal(car.rawData.productId,raw.productId);
  assert.equal(clicks,2);assert.equal(browser.metrics.verificationPassed,2);assert.equal(browser.metrics.sessionRefreshes,1);assert.equal(launches,1);
  assert.equal(events.filter(e=>e.stage==='verification_passed').length,2);
  blockNext=true;await assert.rejects(reader.card(url),{code:'SOURCE_BLOCKED',reason:'verification_too_frequent'});assert.equal(clicks,2);
 }finally{Date.now=realNow;await browser?.close();}
 assert.equal(closed,true);
});

async function recoveryFixture({ persistent = false, concurrentFailures = 1 } = {}) {
 const otherUrl = url.replace('y2ud7mtru4', 'aaaaaaaaaa');
 const requests = new Map();
 let current = '', visits = 0, disposed = 0;
 let initialRequests = 0, releaseRequests;
 const initialBarrier = new Promise(resolve => { releaseRequests = resolve; });
 const cardScript = target => script.replaceAll('y2ud7mtru4', target === otherUrl ? 'aaaaaaaaaa' : 'y2ud7mtru4');
 const page = {
  route: async () => {}, setDefaultTimeout: () => {},
  goto: async target => { current = target; visits++; return { status: () => 200 }; },
  evaluate: async () => ({ url: current, title: 'Car', text: 'Car', scripts: [cardScript(current)], products: [url], pages: [], listingLinks: [] }),
 };
 const context = {
  route: async () => {}, newPage: async () => page, close: async () => {},
  request: { get: async target => {
   const count = (requests.get(target) || 0) + 1; requests.set(target, count);
   if (count === 1) {
    if (++initialRequests === concurrentFailures) releaseRequests();
    await initialBarrier;
   }
   const html = persistent || count === 1 ? '<script>obfuscatedProtection()</script>' : `<script>${cardScript(target)}</script>`;
   return { status: () => 200, url: () => target, headers: () => ({}), body: async () => Buffer.from(html), dispose: async () => { disposed++; } };
  } },
 };
 const browser = await openGuaziBrowser({ publicOnly: true, transport: 'session-http', delay: 0, requestInterval: 0, timeout: 1000 }, {
  browserEngine: { launch: async () => ({ newContext: async () => context, close: async () => {} }) },
 });
 await browser.listing('https://en.guazi.com/used-cars/');
 return { browser, otherUrl, requests, stats: () => ({ visits, disposed }) };
}

test('card recovery keeps the verified browser capture when session HTTP remains intercepted', async () => {
 const f = await recoveryFixture({ persistent: true });
 try {
  const reader = await f.browser.worker();
  assert.equal((await reader.card(url)).rawData.productId, raw.productId);
  assert.equal(f.requests.get(url), 1);
  assert.deepEqual(f.stats(), { visits: 2, disposed: 1 });
  assert.equal(f.browser.metrics.sessionRefreshes, 1);
 } finally { await f.browser.close(); }
});

test('parallel recovery never returns another car from the shared browser refresh', async () => {
 const f = await recoveryFixture({ concurrentFailures: 2 });
 try {
  const reader = await f.browser.worker();
  const cards = await Promise.all([reader.card(url), reader.card(f.otherUrl)]);
  assert.deepEqual(cards.map(card => card.rawData.productId), [raw.productId, 'aaaaaaaaaa']);
  assert.equal(f.browser.metrics.sessionRefreshes, 1);
  assert.equal([...f.requests.values()].reduce((sum, count) => sum + count, 0), 3);
  assert.deepEqual(f.stats(), { visits: 2, disposed: 3 });
 } finally { await f.browser.close(); }
});

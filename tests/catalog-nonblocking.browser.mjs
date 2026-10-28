// DOM/network checks only. Isolated fixtures; no screenshots or production requests.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {catalogMetaBoot} from '../server/app-render.mjs';
const root=resolve(process.env.TEST_BUILD_DIR||'dist'),build=pathToFileURL(root+'/');
if(root.startsWith('/tmp/'))try{await symlink(resolve('node_modules'),resolve(root,'node_modules'));}catch(e){if(e.code!=='EEXIST')throw e;}
const {renderCatalogApp}=await import(new URL('ssr/entry-server.js',build));
const client=new URL('client/',build),shell=await readFile(new URL('index.html',client),'utf8');
const entry=shell.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/)[0]+'</script>';
const styles=[...shell.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('');
const cars=Array.from({length:48},(_,i)=>({id:`encar-${i+1}`,externalId:String(i+1),source:'Encar',origin:'korea',brand:'Kia',model:'K5',title:'Kia K5 2023',year:2023,type:'ДВС',mileage:10000,sourceCurrency:'KRW',sourcePrice:20000000+i*100000,usdPrice:15000+i*100,images:[],_summary:true}));
const meta={total:240,brands:[{brand:'Kia',count:240}],models:[{model:'K5',count:240}],bodyTypes:[],drives:[],countries:[{origin:'korea',count:240}],availability:{total:240}};
const requests=[],waiting=[];let hold=true,fail=false;
const server=createServer(async(req,res)=>{
 try{
 const u=new URL(req.url,'http://local');requests.push(u.pathname+u.search);
 const json=(body,status=200)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(body));};
 if(u.pathname==='/catalog'){
  const boot={catalogPath:'/catalog',catalogSearch:u.searchParams.toString(),catalogSeed:null,catalogSummaryPending:true,catalogValue:{items:cars,total:null,hasMore:true,summaryPending:true},...catalogMetaBoot('',null)};
  res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8">${styles}</head><body><div id="root" data-prerender="/catalog">${renderCatalogApp('/catalog',u.searchParams.toString(),boot)}</div><script>window.__boot=${JSON.stringify(boot)}</script>${entry}</body></html>`);return;
 }
 if(u.pathname==='/api/catalog/meta'||(u.pathname==='/api/cars'&&u.searchParams.get('summary')==='only')){
  const kind=u.pathname.endsWith('/meta')?'meta':'summary';
  const send=()=>{if(!res.writableEnded)json(kind==='meta'?meta:{total:240,refreshedAt:'2026-10-27',yearMin:2020,yearMax:2026},fail?503:200);};
  if(hold)waiting.push({kind,send});else send();return;
 }
 if(u.pathname==='/api/cars'){
  assert.notEqual(u.searchParams.get('sort'),'default');
  const items=u.searchParams.get('sort')==='price_desc'?[...cars].reverse():cars;
  json({items:items.slice(0,Number(u.searchParams.get('limit'))||48),total:null,hasMore:true,summaryPending:true});return;
 }
 if(u.pathname==='/api/auth/me'){json({user:null});return;}
 if(u.pathname.startsWith('/assets/')){
  const data=await readFile(new URL('.'+u.pathname,client));res.setHeader('content-type',u.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(data);return;
 }
 res.statusCode=404;res.end();
 }catch(e){res.statusCode=500;res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true}),base=`http://127.0.0.1:${server.address().port}`;
const waitFor=async predicate=>{const start=Date.now();while(!predicate()){if(Date.now()-start>15000)throw new Error('fixture wait timed out');await new Promise(r=>setTimeout(r,20));}};
const uniqueCards=page=>page.evaluate(()=>new Set([...document.querySelectorAll('main.catalog a[href^="/cars/"]')].map(n=>n.getAttribute('href'))).size);
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 if(process.env.TEST_SLOW==='1'){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:1600000/8,uploadThroughput:750000/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 }
 await page.addInitScript(()=>{
  new MutationObserver(()=>{
   if(!window.__cardsReadyAt&&document.querySelectorAll('main.catalog [data-car-id]').length===48)window.__cardsReadyAt=performance.now();
  }).observe(document,{childList:true,subtree:true});
 });
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Minified React|Hydration|hydration/.test(m.text()))errors.push(m.text())});
 await page.goto(base+'/catalog',{waitUntil:'domcontentloaded'});
 await waitFor(()=>waiting.some(w=>w.kind==='meta')&&waiting.some(w=>w.kind==='summary'));
 assert.equal(await uniqueCards(page),48);
 assert.equal(await page.locator('main.catalog .skeleton-card').count(),0);
 assert.equal(await page.locator('.result-summary [aria-label="Загружаем количество автомобилей"]').count(),1);
 assert.match(await page.locator('.sort-custom-select .select-trigger').innerText(),/Свежие\s+и\s+разные/);
 assert.equal(new URL(page.url()).search,'');
 const timing=await page.evaluate(()=>({cardsReadyAt:window.__cardsReadyAt,appEntryEnd:performance.getEntriesByType('resource').find(r=>r.name.includes('/app-entry-'))?.responseEnd}));
 assert.ok(timing.cardsReadyAt>0&&timing.cardsReadyAt<timing.appEntryEnd,'SSR cards must precede application download');
 console.log(JSON.stringify({ssrCardTiming:timing,slow:process.env.TEST_SLOW==='1'}));
 waiting.filter(w=>w.kind==='summary').forEach(w=>w.send());
 await page.waitForFunction(()=>document.querySelector('.result-summary b')?.textContent==='240 шт.');
 assert.equal(await uniqueCards(page),48);
 assert.equal(await page.locator('[aria-label^="Марка:"].select-data-pending').count(),1);
 waiting.filter(w=>w.kind==='meta').forEach(w=>w.send());hold=false;
 await page.waitForFunction(()=>!document.querySelector('[aria-label^="Марка:"]')?.hasAttribute('aria-busy'));
 await page.locator('.sort-custom-select .select-trigger').click();
 assert.equal(await page.getByRole('option',{name:'По умолчанию',exact:true}).count(),0);
 await page.getByRole('option',{name:'Дорогие',exact:true}).click();
 await page.waitForURL('**/catalog?sort=price_desc');
 await page.locator('.sort-custom-select .select-trigger').click();
 await page.getByRole('option',{name:'Дешёвые',exact:true}).click();
 await page.waitForURL('**/catalog?sort=price_asc');
 await page.locator('.sort-custom-select .select-trigger').click();
 await page.getByRole('option',{name:'Свежие и разные',exact:true}).click();
 await page.waitForURL('**/catalog');assert.equal(new URL(page.url()).search,'');
 assert.deepEqual(errors,[]);await page.close();
 const other=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),failed=await other.newPage();fail=true;
 await failed.goto(base+'/catalog',{waitUntil:'domcontentloaded'});
 await failed.waitForFunction(()=>[...document.querySelectorAll('.catalog-message')].some(n=>/Не\s+удалось\s+обновить/.test(n.textContent)),null,{timeout:15000}).catch(async error=>{console.log(JSON.stringify({messages:await failed.locator('.catalog-message').allTextContents(),body:(await failed.locator('body').innerText()).slice(0,600),requests:requests.slice(-12)}));throw error;});
 assert.equal(await uniqueCards(failed),48);assert.equal(await failed.locator('main.catalog .skeleton-card').count(),0);
 assert.ok(!requests.some(r=>r.includes('sort=default')));
 await other.close();
 console.log(JSON.stringify({cardsBeforeSummary:48,cardsBeforeMetadata:48,independentSummary:true,cleanDefaultUrl:true,hiddenMixedSort:true,detailsFailurePreservesCards:true,hydrationErrors:errors.length}));
}finally{hold=false;waiting.forEach(w=>{try{if(!w.done)w.send()}catch{}});await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

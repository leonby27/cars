// Nonvisual checks of cold home hydration, route navigation and deferred chunks.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
process.env.SITE_ID='abdrive';
const {createFrontend}=await import('../server/abdrive/frontend.mjs');
const {createAbdriveHandler}=await import('../server/abdrive/handler.mjs');
const {prepareRussianHome}=await import('../server/abdrive/home-snapshot.mjs');
const {getSiteProfile}=await import('../config/sites/index.mjs');
const car={id:'che168-1',brand:'BMW',model:'X3',title:'BMW X3',year:2024,type:'ДВС',source:'Che168',origin:'china',priceYuan:250000,mileage:15000,engineVolume:2,enginePower:184,images:[],offer:{status:'estimated',totalAmount:4500000,currency:'RUB',ratesDate:'2026-10-02',rows:[]}};
const meta={brands:[{brand:'BMW',count:30}],models:[{model:'X3',count:30}],bodyTypes:[],drives:[],countries:[],availability:{},total:30};
const catalog={list:async params=>{const matches=(!params.get('brand')||params.get('brand')==='BMW')&&(!params.get('model')||params.get('model')==='X3');return {items:matches?Array.from({length:Math.min(30,Number(params.get('limit'))||20)},(_,i)=>({...car,id:'che168-'+(i+1)})):[],total:matches?30:0,page:1,hasMore:false,refreshedAt:'2026-10-02'};},get:async id=>({car:{...car,id:String(id).startsWith('che168-')?String(id):'che168-'+id}}),sharedMeta:async()=>meta,meta:async()=>meta,modelFacts:async()=>({models:[{brand:'BMW',model:'X3',count:30,priceMin:4500000}]}),summary:async()=>({total:30,powertrains:[],bodyTypes:[]})};
const snapshot=await prepareRussianHome(catalog);
const frontend=await createFrontend({buildDirectory:resolve(process.env.ABDRIVE_BUILD_DIR||'dist-abdrive'),catalog,site:getSiteProfile('abdrive'),homeSnapshot:{get:()=>snapshot.boot}});
const server=http.createServer(createAbdriveHandler({catalog,siteDatabase:{query:async()=>({rows:[]})},site:getSiteProfile('abdrive'),frontend,log:console.error}));
server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext();const page=await context.newPage();
 const errors=[],chunks=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});
 page.on('request',r=>{if(r.url().includes('/assets/secondary-pages-'))chunks.push(r.url());});
 const ready=()=>page.waitForFunction(()=>Object.keys(document.querySelector('.favorites-link')||{}).some(key=>key.startsWith('__reactProps$')));
 await page.goto(base+'/?utm_source=test&nocount=1');await ready();
 assert.equal(chunks.length,0,'home must not fetch route-only code');
 assert.ok(await page.locator('h1').count());
 await page.locator('a[href="/how-it-works"]').first().dispatchEvent('click');await page.locator('.service-purchase-flow').waitFor({state:'attached'});
 assert.equal(chunks.length,1);assert.equal(errors.length,0,errors.join('\n'));
 for(const route of ['/customs','/range','/catalog/bmw/x3','/cars/1']){
  const navigation=await page.goto(base+route);assert.equal(navigation.status(),200,route+' '+(await navigation.text()).slice(0,700));try{await ready();}catch(error){console.log('browser errors',errors);console.log('page text',(await page.locator('body').textContent()).slice(0,1000));throw error;}assert.ok(await page.locator('h1').count());
 }
 assert.equal(errors.length,0,errors.join('\n'));
 // Opening a preview from a cold homepage loads the card module on demand.
 const fresh=await context.newPage();fresh.on('pageerror',e=>errors.push(e.message));fresh.on('console',m=>{if(m.type()==='error'&&!m.text().startsWith('Failed to load resource'))errors.push(m.text());});await fresh.goto(base+'/');
 await fresh.waitForFunction(()=>Object.keys(document.querySelector('.favorites-link')||{}).some(key=>key.startsWith('__reactProps$')));
 await fresh.getByText('Быстрый просмотр',{exact:true}).first().click();
 await fresh.locator('.featured-card .card-link-overlay').first().dispatchEvent('click');await fresh.locator('.quick-view-modal').waitFor();
 await fresh.getByRole('button',{name:'Закрыть быстрый просмотр'}).click();
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('Cold home: no deferred route download; hydration, navigation, calculators, catalog, card and preview passed.');
 await context.close();
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

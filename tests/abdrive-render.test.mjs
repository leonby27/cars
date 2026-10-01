import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import http from 'node:http';
import {once} from 'node:events';
import {resolve} from 'node:path';
process.env.SITE_ID='abdrive';
const {createFrontend}=await import('../server/abdrive/frontend.mjs');
const {createAbdriveHandler}=await import('../server/abdrive/handler.mjs');
import {getSiteProfile} from '../config/sites/index.mjs';
const site=getSiteProfile('abdrive');
const directory=resolve(process.env.ABDRIVE_BUILD_DIR||'dist-abdrive');

test('RU uses shared pages, own metadata and safe data; BY tools and documents stay unavailable', {skip:!existsSync(resolve(directory,'ssr/entry-server.js'))},async()=>{
 const car={id:'che168-1',number:'1',title:'Test $& </script><script>alert(1)</script>',brand:'BYD',model:'Seal',year:2024,type:'Электромобиль',mileage:123,origin:'china',source:'Che168',bodyColor:'Black',battery:80,electricRange:550,checkedAt:'2026-10-01T09:00:00Z',facts:[{label:'Цвет кузова',value:'Чёрный'}],images:[],offer:{status:'unavailable',totalAmount:null,currency:'RUB'}};
 const catalog={list:async params=>{if(params.get('yearMin')==='invalid')throw new Error('invalid_filter');return {cars:[car],items:[car],total:1,page:1,hasMore:false};},get:async id=>['1','che168-1'].includes(id)?{car}:null,meta:async()=>({brands:[{brand:'BYD',count:1}],models:[{model:'Seal',count:1}],total:1}),sharedMeta:async()=>({brands:[{brand:'BYD',count:1}],models:[{model:'Seal',count:1}],bodyTypes:[],drives:[],countries:[],availability:{},total:1})};
 const frontend=await createFrontend({buildDirectory:directory,catalog,site});
 const server=http.createServer(createAbdriveHandler({catalog,site,siteDatabase:{},frontend,log:()=>{}}));
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const path of ['/','/catalog','/catalog/byd','/catalog/byd/seal','/how-it-works','/faq','/favorites','/searches']){
   const response=await fetch(base+path);assert.equal(response.status,200,path);const html=await response.text();
   if(!["/favorites","/searches"].includes(path))assert.match(html,/<h1[ >]/);assert.match(html,/ABDrive/);assert.match(html,/https:\/\/abdrive.ru/);
   assert.match(html,/class="site-header"/);assert.match(html,/class="site-footer"/);
   assert.match(html,/<select aria-label="Город доставки"/);assert.match(html,/<option value="moscow" selected="">Москва<\/option>/);
   assert.doesNotMatch(html,/aria-label="Валюта цен"|До Москвы · ₽/);
   assert.match(html,/src="\/abdrive\/logo-light\.svg\?v=3"/);assert.match(html,/src="\/abdrive\/logo-dark\.svg\?v=3"/);
   assert.match(html,/<link rel="icon" href="\/favicon\.svg\?v=3"/);
   assert.doesNotMatch(html,/Беларус|Минск|BYN|Указ № 140|<!--abdrive-app-->|class="ab-header"/);
  }
  const filtered=await fetch(base+'/catalog?brand=BYD&model=Seal&yearMax=2025&mileageMax=20000').then(r=>r.text());
  assert.match(filtered,/class="car-row"/);assert.match(filtered,/BYD Seal/);assert.match(filtered,/data-prerender="\/catalog"/);
  const faq=await fetch(base+'/faq').then(r=>r.text());assert.match(faq,/home-faq-item/);assert.match(faq,/Сколько занимает доставка до Москвы/);
  const service=await fetch(base+'/how-it-works').then(r=>r.text());
  for(const marker of ['service-video-shell','service-video-story','info-proof-section','service-opportunities-grid','service-catalog-section','service-assurance-section','service-purchase-flow','service-report','service-faq'])assert.ok(service.includes(marker),marker);
  assert.equal((service.match(/class="info-proof-icon /g)||[]).length,8);
  assert.equal((service.match(/class="service-purchase-flow-number"/g)||[]).length,6);
  assert.equal((service.match(/class="faq-group"/g)||[]).length,4);
  assert.equal((service.match(/class="home-faq-item"/g)||[]).length,13);
  assert.doesNotMatch(service,/скоро появятся|телефон уточняется|чат готовится/i);
  assert.match(service,/Выдача в Москве/);assert.match(service,/Полная смета до Москвы/);
  assert.doesNotMatch(service,/tel:undefined|mailto:undefined|href="[^" ]*(?:ev-quota|price-belarus)|64900|64 000/);
  // Request every initially rendered illustration and both video encodes through the RU server.
  const media=new Set([...service.matchAll(/(?:src|srcSet)="(\/[^" ]+)"/g)].map(match=>match[1]));
  media.add('/videos/how-it-works-mobile-v2.mp4');media.add('/videos/how-it-works-desktop-v2.mp4');
  for(const path of media){const asset=await fetch(base+path);assert.equal(asset.status,200,path);assert.doesNotMatch(asset.headers.get('content-type'),/text\/html/,path);await asset.arrayBuffer();}
  const invalid=await fetch(base+'/catalog?yearMin=invalid');assert.equal(invalid.status,400);assert.match(await invalid.text(),/Проверьте параметры поиска/);
  const response=await fetch(base+'/cars/1');const html=await response.text();
  assert.equal(response.status,200);assert.match(html,/Расчёт уточняется/);assert.match(html,/detail-main/);assert.match(html,/Стоимость до Москвы/);assert.match(html,/noindex,follow/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|Минск|Беларус|НБРБ/);
  assert.match(html,/delivery-card-heading/);assert.match(html,/Срок доставки до.*Москвы/);assert.match(html,/availability-primary-cta/);assert.match(html,/account-link/);assert.doesNotMatch(html,/market-cost-rows/);
  for(const path of ['/account','/login','/register']){const res=await fetch(base+path);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');assert.match(await res.text(),/noindex,follow/);}
  const raw=html.match(/<script id="abdrive-data" type="application\/json">([\s\S]*?)<\/script>/)[1];assert.equal(JSON.parse(raw).car.title,car.title);
  assert.equal((await fetch(base+'/api/cars/1').then(r=>r.json())).id,car.id);
  assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
  for(const path of ['/ev-quota','/price-belarus','/privacy','/cars/missing','/documents/privacy-policy.pdf','/orders/draft/1','/assets/nope.js'])assert.equal((await fetch(base+path)).status,404,path);
  for(const [path,type] of [['abdrive/logo-light.svg','image/svg+xml'],['abdrive/logo-dark.svg','image/svg+xml'],['favicon.svg','image/svg+xml'],['favicon-96.png','image/png'],['favicon.ico','image/x-icon'],['apple-touch-icon.png','image/png']]){
   const asset=await fetch(base+'/'+path+'?v=3');assert.equal(asset.status,200,path);assert.equal(asset.headers.get('content-type'),type,path);
   assert.deepEqual(Buffer.from(await asset.arrayBuffer()),readFileSync(resolve('public',path)),path);
  }
  assert.equal((await fetch(base+'/abdrive/missing.svg')).status,404);
  const script=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const asset=await fetch(base+script);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);
  const xml=await fetch(base+'/sitemap.xml').then(r=>r.text());assert.doesNotMatch(xml,/abcars|ev-quota|price-belarus/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

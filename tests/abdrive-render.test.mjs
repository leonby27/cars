import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import http from 'node:http';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {createFrontend} from '../server/abdrive/frontend.mjs';
import {createAbdriveHandler} from '../server/abdrive/handler.mjs';
import {getSiteProfile} from '../config/sites/index.mjs';
const site=getSiteProfile('abdrive');
const directory=resolve('dist-abdrive');

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
   assert.doesNotMatch(html,/Беларус|Минск|BYN|Указ № 140|<!--abdrive-app-->|class="ab-header"/);
  }
  const filtered=await fetch(base+'/catalog?brand=BYD&model=Seal&yearMax=2025&mileageMax=20000').then(r=>r.text());
  assert.match(filtered,/class="car-row"/);assert.match(filtered,/BYD Seal/);assert.match(filtered,/data-prerender="\/catalog"/);
  const faq=await fetch(base+'/faq').then(r=>r.text());assert.match(faq,/home-faq-item/);assert.match(faq,/не адрес офиса/);
  const invalid=await fetch(base+'/catalog?yearMin=invalid');assert.equal(invalid.status,400);assert.match(await invalid.text(),/Проверьте параметры поиска/);
  const response=await fetch(base+'/cars/1');const html=await response.text();
  assert.equal(response.status,200);assert.match(html,/Цена по запросу/);assert.match(html,/detail-main/);assert.match(html,/Стоимость до Москвы/);assert.match(html,/noindex,follow/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>|Минск|Беларус|НБРБ/);
  const raw=html.match(/<script id="abdrive-data" type="application\/json">([\s\S]*?)<\/script>/)[1];assert.equal(JSON.parse(raw).car.title,car.title);
  assert.equal((await fetch(base+'/api/cars/1').then(r=>r.json())).id,car.id);
  assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
  for(const path of ['/ev-quota','/price-belarus','/privacy','/cars/missing','/documents/privacy-policy.pdf','/assets/nope.js'])assert.equal((await fetch(base+path)).status,404,path);
  const script=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  const asset=await fetch(base+script);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);
  const xml=await fetch(base+'/sitemap.xml').then(r=>r.text());assert.doesNotMatch(xml,/abcars|ev-quota|price-belarus/);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

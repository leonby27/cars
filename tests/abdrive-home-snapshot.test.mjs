import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import http from 'node:http';
import {prepareRussianHome,createRussianHomeSnapshot,writeRussianHome,EMPTY_RUSSIAN_HOME} from '../server/abdrive/home-snapshot.mjs';
import {RU_PRICING} from '../config/ru-pricing.mjs';
import {getSiteProfile} from '../config/sites/index.mjs';
const date=Date.parse('2026-10-02T10:00:00Z');
const car={id:'che168-1',brand:'BYD',model:'Qin PLUS',year:2026,type:'Гибрид',source:'Che168',images:Array.from({length:60},(_,i)=>`https://example.com/${i}.webp`),offer:{status:'estimated',totalAmount:2840000,currency:'RUB',rows:[],assumptions:['internal quote assumption']}};
const catalog={list:async()=>({items:Array.from({length:60},(_,i)=>({...car,id:'che168-'+(i+1)})),total:132856,refreshedAt:'2026-10-02'}),sharedMeta:async()=>({brands:[{brand:'BYD',count:123}],total:132856}),modelFacts:async()=>({models:[{brand:'BYD',model:'Qin PLUS',count:123,priceMin:2840000,image:car.images[0]}]})};
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('Home snapshot keeps real RUB cards and model links without duplicate lists or full galleries',async()=>{
 const saved=await prepareRussianHome(catalog,{now:()=>date});const boot=saved.boot;
 assert.equal(boot.homeShowcase.length,20);assert.equal(boot.homeShowcase[0].images.length,5);
 assert.equal(boot.homeShowcase[0].offer.totalAmount,2840000);assert.equal(boot.homeShowcase[0].offer.assumptions,undefined);
 assert.equal(boot.catalogValue,undefined);assert.equal(boot.api,undefined);
 assert.equal(boot.catalogFacts.total,132856);assert.equal(boot.popularModels[0].path,'/catalog/byd/qin-plus');
 assert.equal(car.images.length,60);assert.equal(car.offer.assumptions.length,1);
 assert.ok(JSON.stringify(saved).length<35000);
});

test('A saved homepage is synchronous during slow refresh; failed refresh keeps the last good data',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ru-home-'));
 try{
  const file=join(dir,'home.json');await writeRussianHome(file,await prepareRussianHome(catalog,{now:()=>date}));
  let calls=0,reject;const stalled=new Promise((_,no)=>{reject=no;});let clock=date+300001;
  const state=await createRussianHomeSnapshot({file,now:()=>clock,catalog:{...catalog,list:()=>{calls++;return stalled;}},onError:()=>{}});
  const initial=state.get();assert.equal(initial.homeShowcase.length,20);assert.equal(calls,0);
  state.get();await turn();assert.equal(calls,1);
  reject(new Error('database offline'));await turn();
  assert.equal(state.get(),initial);assert.equal(calls,1);
  assert.equal(JSON.parse(await readFile(file,'utf8')).boot.catalogFacts.total,132856);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Missing, corrupt or incompatible snapshot returns a shell immediately and can recover',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ru-home-'));
 try{
  const file=join(dir,'home.json');
  for(const value of ['not json',JSON.stringify({format:1,version:'old',savedAt:date,boot:{homeShowcase:[car]}})]){
   await writeFile(file,value);
   const state=await createRussianHomeSnapshot({file,catalog,now:()=>date,onError:()=>{}});
   assert.equal(state.get(),EMPTY_RUSSIAN_HOME);await state.refresh();
   assert.equal(state.get().homeShowcase.length,20);
   assert.equal(JSON.parse(await readFile(file,'utf8')).version,RU_PRICING.version);
  }
 }finally{await turn();await rm(dir,{recursive:true,force:true});}
});

test('Home HTTP response never waits for catalog; query state, metadata and current saved links survive',async()=>{
 process.env.SITE_ID='abdrive';
 const {createFrontend}=await import('../server/abdrive/frontend.mjs');
 const saved=await prepareRussianHome(catalog,{now:()=>date});let reads=0;
 const never=()=>{reads++;return new Promise(()=>{});};
 const frontend=await createFrontend({buildDirectory:process.env.ABDRIVE_BUILD_DIR||'dist-abdrive',catalog:{list:never,sharedMeta:never,modelFacts:never},site:getSiteProfile('abdrive'),homeSnapshot:{get:()=>saved.boot}});
 const server=http.createServer((req,res)=>frontend(req,res,new URL(req.url,'https://abdrive.ru')));server.listen(0,'127.0.0.1');await once(server,'listening');
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/',{signal:AbortSignal.timeout(3000)});assert.equal(response.status,200);const html=await response.text();
  assert.match(html,/<h1[ >]/);assert.match(html,/href="\/catalog\/byd\/qin-plus"/);assert.match(html,/2 840 000/);assert.equal(reads,0);
  const second=await fetch(base+'/').then(r=>r.text());assert.equal(second,html);
  const searched=await fetch(base+'/?q=Tesla').then(r=>r.text());const boot=JSON.parse(searched.match(/id="abdrive-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(boot.search,'?q=Tesla');assert.equal(boot.catalogValue,undefined);assert.equal(reads,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

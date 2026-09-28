import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {orderGuaziBrands} from '../scripts/guazi-census.mjs';
import {evaluateCoreCard} from '../scripts/lib/guazi-core.mjs';
import {sameOriginSettingRequest,setCatalogSource} from '../server/catalog-sources.mjs';
import {cachedGuaziImage} from '../server/guazi-image-cache.mjs';
test('brand census orders summed fuel/partition counts smallest first, unknown counts fail',()=>{
 const segments=[{id:'a-electric',brand:'A'},{id:'a-gas',brand:'A'},{id:'b-electric',brand:'B'}];const counts={'a-electric:0':1,'a-electric:1':2,'a-gas:0':3,'a-gas:1':4,'b-electric:0':2,'b-electric:1':0};assert.deepEqual(orderGuaziBrands(segments,counts).map(b=>[b.brand,b.total]),[['B',2],['A',10]]);delete counts['a-gas:0'];assert.throws(()=>orderGuaziBrands(segments,counts),/Missing count/);
});
test('FOB import requires Horgos, works without domestic listing and marks source internally',()=>{
 const card={selection:{eligible:true},catalogIdentity:{brand:'Tesla',model:'Model Y',sourceBrand:'Tesla',type:'Электромобиль'},modelYear:2024,firstRegistration:'2024.09',fuel:'BEV',productId:'y2ud7mtru4',sourceUrl:'https://en.guazi.com/products/tesla-y2ud7mtru4.html',prices:[{basis:'FOB',currency:'USD',port:'Horgos, China',amount:28748}],catalogFields:{},specifications:{},technicalSpecs:{groups:[]},inspection:{exportGrade:'A'},images:[{sourceUrl:'https://global-image-pub.guazistatic-global.com/a.jpg'}]};
 const segment={brand:'Tesla',sourceFuelNames:['BEV'],minRegistrationYear:2022,minVehicleUsd:7000,maxVehicleUsd:100000};
 const r=evaluateCoreCard(card,segment,{priceBasis:'FOB'});assert.equal(r.status,'accepted');assert.equal(r.car.source,'Guazi');assert.equal(r.car.externalId,card.productId);assert.equal(r.car.fobPriceUsd,28748);assert.equal(r.car.priceBasis,'FOB');assert.equal(r.car.chinaPriceBasis,'converted_fob');assert.ok(r.car.chinaPrice>0);
 card.prices[0].port='Shanghai, China';assert.equal(evaluateCoreCard(card,segment,{priceBasis:'FOB'}).reason,'fob_horgos_missing');
});
test('visibility changes require valid source, boolean and same origin',async()=>{
 assert.equal(sameOriginSettingRequest({origin:'https://abcars.by',host:'abcars.by'}),true);assert.equal(sameOriginSettingRequest({origin:'https://evil.example',host:'abcars.by'}),false);assert.equal(sameOriginSettingRequest({host:'abcars.by'}),false);
 await assert.rejects(setCatalogSource('Guazi','false'),/Invalid/);await assert.rejects(setCatalogSource('Che168',false),/Invalid/);
});
test('Guazi cache stores verified images, reuses bytes and coalesces simultaneous requests',async t=>{
 const dir=await fs.mkdtemp(new URL('../runtime/guazi-cache-test-',import.meta.url));const prior=process.env.GUAZI_IMAGE_CACHE_DIR;process.env.GUAZI_IMAGE_CACHE_DIR=dir;t.after(async()=>{if(prior===undefined)delete process.env.GUAZI_IMAGE_CACHE_DIR;else process.env.GUAZI_IMAGE_CACHE_DIR=prior;await fs.rm(dir,{recursive:true,force:true});});
 let requests=0;const fetchImpl=async()=>{requests++;return new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});};
 const url='https://global-image-pub.guazistatic-global.com/example.jpg';await Promise.all([cachedGuaziImage(url,{fetchImpl}),cachedGuaziImage(url,{fetchImpl})]);assert.equal(requests,1);const hit=await cachedGuaziImage(url,{fetchImpl});assert.equal(hit.cached,true);assert.equal(requests,1);
 await assert.rejects(cachedGuaziImage('http://127.0.0.1/private',{fetchImpl}));
});
test('Guazi images are served without persistence when the disk reserve would be crossed',async t=>{
 const dir=await fs.mkdtemp(new URL('../runtime/guazi-cache-disk-test-',import.meta.url));const prior=process.env.GUAZI_IMAGE_CACHE_DIR;process.env.GUAZI_IMAGE_CACHE_DIR=dir;t.after(async()=>{if(prior===undefined)delete process.env.GUAZI_IMAGE_CACHE_DIR;else process.env.GUAZI_IMAGE_CACHE_DIR=prior;await fs.rm(dir,{recursive:true,force:true});});
 let requests=0;const fetchImpl=async()=>{requests++;return new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});};const statfsImpl=async()=>({bavail:1,bsize:1024});
 const url='https://global-image-pub.guazistatic-global.com/disk-guard.jpg';
 assert.equal((await cachedGuaziImage(url,{fetchImpl,statfsImpl,minFreeBytes:2048})).cached,false);
 assert.equal((await cachedGuaziImage(url,{fetchImpl,statfsImpl,minFreeBytes:2048})).cached,false);
 assert.equal(requests,2);assert.deepEqual(await fs.readdir(dir),[]);
});
test('bulk stops on a failed detail, resumes the same page and replays accepted cars without refetching',async t=>{
 const {runBulk}=await import('../scripts/guazi-bulk.mjs');
 const {makeSegments}=await import('../scripts/lib/guazi-core.mjs');
 const config=JSON.parse(await fs.readFile(new URL('../config/guazi-core.json',import.meta.url)));
 const {filters}=JSON.parse(await fs.readFile(new URL('../config/refresh-order.json',import.meta.url)));
 const segment=makeSegments([{id:'102715',name:'Tesla'}],filters,config)[0];
 const out=await fs.mkdtemp(new URL('../runtime/guazi-bulk-test-',import.meta.url));t.after(()=>fs.rm(out,{recursive:true,force:true}));
 await fs.writeFile(out+'/census.json',JSON.stringify({status:'complete',finishedAt:new Date().toISOString(),counts:{[segment.id+':1']:1,[segment.id+':0']:0},order:[{brand:'Tesla',total:1,segments:[segment]}]}));
 await fs.writeFile(out+'/china-index.json',JSON.stringify({complete:true,fetchedAt:new Date().toISOString(),entries:{}}));
 const id='y2ud7mtru4',url='https://en.guazi.com/products/tesla-y2ud7mtru4.html';
 const raw={productId:id,clueId:172877314,makeNameEn:'Tesla',modelName:'Model Y',title:'Tesla Model Y',vehicleDetails:[{key:'modelYear',value:'2024'},{key:'fuel',value:'BEV'},{key:'regDate',value:'2024.09'},{key:'mileage',value:'60300'}],images:[{imgUrl:'https://global-image-pub.guazistatic-global.com/car.jpg'}],prices:[{price:'$28,748',enName:'Horgos, China'}]};
 let fail=true,details=0,lists=0,closed=0;const events=[];
 const deps={emit:async e=>events.push(e),browserFactory:async options=>{assert.equal(options.publicOnly,true);return{publicBootstrap:async()=>{},publicSearch:async body=>{lists++;assert.equal(body.pageNum,1);return{data:{totalCount:1,list:[{productId:id,seoUri:'tesla-y2ud7mtru4.html',brandId:102715,fuelTypeName:'BEV',licenseDate:'20240901'}]}};},worker:async()=>({card:async()=>{details++;if(fail)throw Error('temporary detail failure');return{url,rawData:raw,observedAt:new Date().toISOString()};}}),close:async()=>{closed++;}};}};
 await assert.rejects(runBulk(out,deps),/Detail failure/);
 let state=JSON.parse(await fs.readFile(out+'/bulk-state.json'));assert.equal(state.pages[segment.id+':1'].page,0);assert.equal(state.status,'error');assert.equal(closed,1);await assert.rejects(fs.stat(out+'/bulk.lock'),{code:'ENOENT'});
 const controller=new AbortController();controller.abort();await assert.rejects(runBulk(out,{...deps,signal:controller.signal}),{code:'GUAZI_PAUSED'});state=JSON.parse(await fs.readFile(out+'/bulk-state.json'));assert.equal(state.status,'paused');assert.equal(state.pages[segment.id+':1'].page,0);await assert.rejects(fs.stat(out+'/bulk.lock'),{code:'ENOENT'});
 fail=false;await runBulk(out,deps);state=JSON.parse(await fs.readFile(out+'/bulk-state.json'));assert.equal(state.status,'complete');assert.equal(state.results[id].status,'accepted');assert.equal(details,2);assert.equal(lists,1);
 await runBulk(out,deps);assert.equal(details,2);assert.equal(lists,1);assert.equal(events.filter(e=>e.event==='accepted').length,2);assert.equal(events.filter(e=>e.event==='accepted').at(-1).replayed,true);
});

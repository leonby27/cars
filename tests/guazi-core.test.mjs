import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {makeSegments,searchBody,listCandidate,vehiclePriceCny,registrationYear,normalizeCoreCard,evaluateCoreCard} from '../scripts/lib/guazi-core.mjs';
import {options,runCore} from '../scripts/guazi-core.mjs';
import {openGuaziBrowser} from '../scripts/lib/guazi-pilot-browser.mjs';
const config=JSON.parse(await fs.readFile(new URL('../config/guazi-core.json',import.meta.url)));
const {filters}=JSON.parse(await fs.readFile(new URL('../config/refresh-order.json',import.meta.url)));
const segments=makeSegments([{id:'102715',name:'Tesla'},{id:'1212',name:'BYD'}],filters,config);
const segment=segments.find(s=>s.id==='102715-electric');
const url='https://en.guazi.com/products/tesla-y2ud7mtru4.html';
const raw={productId:'y2ud7mtru4',clueId:172877314,title:'Tesla Model Y',makeNameEn:'Tesla',modelName:'Model Y',vehicleDetails:[{key:'modelYear',value:'2024'},{key:'fuel',value:'BEV'},{key:'regDate',value:'2024.09'},{key:'mileage',value:'60300'}],images:[{imgUrl:'https://global-image-pub.guazistatic-global.com/car.jpg'}],prices:[{price:'$29,106'}]};
function card(){const c=normalizeCoreCard({url,rawData:raw,observedAt:'2026-09-26'},config);c.china={status:'matched',fields:{full_payment:'181000元'},sourceUrl:'https://www.guazi.com/car-detail/c172877314440982.md'};return c;}
test('segments inherit vehicle price and registration policy, never FOB price filters',()=>{
 assert.equal(segments.length,8);assert.equal(segment.minRegistrationYear,2022);assert.equal(segments.find(s=>s.brand==='BYD').minRegistrationYear,2021);
 for(const s of segments){assert.equal(s.minVehicleUsd,7000);assert.equal(s.maxVehicleUsd,100000);assert.ok(!s.url.includes('price'));const body=searchBody(s,config,1,0);assert.ok(!Object.keys(body).some(k=>/price/i.test(k)));assert.equal(body.licenseYearStart,s.minRegistrationYear);}
});
test('strict domestic price units, registration and identity gates',()=>{
 for(const [s,n]of [['18.1万',181000],['181,000元',181000],['181000',181000],['$29,106',null],['面议',null],['0元',null]])assert.equal(vehiclePriceCny(s),n);
 assert.equal(registrationYear('20220411'),2022);assert.equal(registrationYear('2022.13'),null);
 const c=listCandidate({productId:'y2ud7mtru4',seoUri:'tesla-y2ud7mtru4.html',brandId:102715,fuelTypeName:'BEV',licenseDate:'20210911'},segment);assert.deepEqual(c.violations,['registration_year']);
 assert.throws(()=>listCandidate({productId:'y2ud7mtru4',seoUri:'tesla-xxxxxxxxxx.html'},segment),/identity/);
});
test('FOB is never used when domestic price is missing or matching failed',()=>{
 const c=card();const good=evaluateCoreCard(c,segment,config);assert.equal(good.status,'accepted');assert.equal(good.car.chinaPrice,181000);assert.equal(good.car.usdPrice,undefined);
 c.china.fields={};assert.equal(evaluateCoreCard(c,segment,config).reason,'vehicle_price_missing');c.china.status='needs_review';assert.equal(evaluateCoreCard(c,segment,config).status,'needs_review');
});
test('public core cannot use account or existing browser options',async()=>{
 assert.throws(()=>options(['--auth-state','secret.json']));assert.throws(()=>options(['--reports']));assert.throws(()=>options(['--out','/tmp/not-runtime']));
 await assert.rejects(openGuaziBrowser({publicOnly:true,authState:'secret.json'}),/authentication/);
 await assert.rejects(openGuaziBrowser({publicOnly:true,cdp:'http://localhost:9222'}),/existing browser/);
});
test('checkpoint resumes captures, deduplicates lists and keeps unmatched prices out',async t=>{
 const root=new URL('../runtime/',import.meta.url);await fs.mkdir(root,{recursive:true});const out=await fs.mkdtemp(new URL('guazi-core-test-',root));t.after(()=>fs.rm(out,{recursive:true,force:true}));
 await fs.writeFile(out+'/china-index.json',JSON.stringify({complete:true,fetchedAt:new Date().toISOString(),entries:{172877314:['https://www.guazi.com/car-detail/c172877314440982.md']}}));
 let detail=0,lists=0,md=0;const browserFactory=async o=>{assert.equal(o.publicOnly,true);assert.equal(o.authState,undefined);return{publicBootstrap:async()=>{},publicSearch:async()=>{lists++;return{data:{totalCount:1,list:[{productId:raw.productId,seoUri:'tesla-y2ud7mtru4.html',brandId:102715,fuelTypeName:'BEV',licenseDate:'20240901'}]}};},worker:async()=>({card:async()=>{detail++;return{url,rawData:raw,observedAt:new Date().toISOString()};}}),close:async()=>{}};};
 const deps={browserFactory,textLoader:async()=>{md++;return'id:c172877314440982\nmodel:Tesla\nfull_payment:181000元\nfirst_register:2024-09\nmileage:60300公里\n';},log:()=>{}};
 const o=options(['--run','--out',out,'--segments',segment.id,'--photos','0']);
 const r=await runCore(o,deps);assert.equal(r.accepted,1);assert.equal(r.candidates,1);assert.equal(r.accountRequests,0);
 await runCore(o,deps);assert.equal(detail,1);assert.equal(md,1);assert.equal(lists,2);
});
test('hybrid displacement reaches the pricing calculator and Hima sub-brand is retained',()=>{
 const data=structuredClone(raw);data.makeNameEn='Hima';data.modelName='H5';data.vehicleDetails.find(x=>x.key==='fuel').value='REEV';data.variantDetailDto={specifications:{groupList:[{groupTitle:'Engine',itemList:[{name:'Engine Model',value:'15FMC'},{name:'Displacement (L)',value:'1.5'}]}]}};
 const c=normalizeCoreCard({url,rawData:data,observedAt:'2026-09-26'},config);assert.equal(c.catalogIdentity.brand,'Shangjie');c.china=card().china;
 const seg={...segment,brand:'AITO',sourceFuelNames:['REEV']};const r=evaluateCoreCard(c,seg,config);assert.equal(r.status,'accepted');assert.equal(r.car.engine,'1.5L');assert.equal(r.car.engineCc,1500);assert.equal(r.car.engineModel,'15FMC');
 c.technicalSpecs.groups=[];assert.equal(evaluateCoreCard(c,seg,config).reason,'engine_volume_unknown');
});
test('HEV motor power is not mislabeled as whole-car horsepower',()=>{
 const c=card();c.fuel='HEV';c.catalogIdentity.type='Гибрид';c.specifications.engine='2.0L';c.catalogFields.horsepower=113;
 const r=evaluateCoreCard(c,{...segment,sourceFuelNames:['HEV']},config);assert.equal(r.status,'accepted');assert.equal(r.car.horsepower,null);assert.equal(r.car.motorHorsepower,113);
});
test('blocked discovery is resumable and cannot be counted as complete inventory',async t=>{
 const root=new URL('../runtime/',import.meta.url);const out=await fs.mkdtemp(new URL('guazi-core-block-',root));t.after(()=>fs.rm(out,{recursive:true,force:true}));let closed=false;
 const r=await runCore(options(['--run','--out',out,'--segments',segment.id]),{browserFactory:async()=>({publicBootstrap:async()=>{},publicSearch:async()=>{throw Object.assign(new Error('Access check'),{code:'SOURCE_BLOCKED'});},close:async()=>{closed=true;}}),log:()=>{}});
 assert.equal(r.status,'blocked');assert.equal(r.coverageComplete,false);assert.equal(r.accepted,0);assert.ok(closed);await assert.rejects(fs.stat(out+'/.lock'),{code:'ENOENT'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCard,parseChinaMarkdown } from '../scripts/lib/guazi-pilot-data.mjs';
import { normalizeGuaziReport } from '../scripts/lib/guazi-pilot-report.mjs';
import { reprocessCard } from '../scripts/guazi-pilot-reprocess.mjs';
import { translateTechnicalSpecs } from '../src/spec-translations.js';
const url='https://en.guazi.com/products/tesla-model-y-y2ud7mtru4.html';
const mdUrl='https://www.guazi.com/car-detail/c172877314440982.md';
const img='https://global-image-pub.guazistatic-global.com/test.jpg';
const raw={productId:'y2ud7mtru4',clueId:172877314,makeNameEn:'Tesla',images:[{imgUrl:img}],vehicleDetails:[{key:'modelYear',value:'2024'},{key:'fuel',value:'BEV'},{key:'regDate',value:'2024.09'},{key:'mileage',value:'60,300'}],variantDetailDto:{specifications:{groupList:[{groupTitle:'Motor',itemList:[{name:'Total Motor Power (kw)',value:'220'},{name:'Total Motor Torque (N·m)',value:'440'},{name:'Rear Motor Max Torque (N·m)',value:'220'},{name:'Minimum Ground Clearance (mm)',value:'0'},{name:'Fast Charging',value:'Supported'}]}]}},reportDetailLite:{baseInfo:{taskId:123,vinMask:'TEST****123',level:'A'}}};
const md=`id:c172877314440982
model:测试
mileage:60300公里
first_register:2024-09
description: >-
  первая строка
  вторая строка
highlights: |-
  左前翼子板喷漆修复。
  车架无损伤。
appearance_score:85分(满分100分)
condition_desc:基础车况优秀/理赔0次/过户1次
transfer_times:1次
condition_grade:B
`;
function capture(){return {sourceUrl:'https://en.guazi.com/report/?productId=y2ud7mtru4',payload:{code:0,success:true,data:{taskId:123,baseInfo:{taskId:123,vinMask:'TEST****123',level:'A'},categoryList:[{categoryId:101,categoryName:'Exterior Design',itemList:[{itemId:1,itemName:'Trunk lid',imageDetailList:[{url:img,positionList:[{resultNames:'Sheet metal',normal:0,x:50,y:11}]}]},{itemId:2,itemName:'Left door',imageDetailList:[{url:'',positionList:[{resultNames:'Normal',normal:1}]}]},{itemId:3,itemName:'Unknown',imageDetailList:[]}]}]}}};}
test('Guazi preserves full specs, converts kW to metric HP and never substitutes rear torque',()=>{
 const c=normalizeCard(raw,url);assert.equal(c.technicalSpecs.count,5);assert.equal(c.catalogFields.horsepower,299);assert.equal(c.catalogFields.torqueNm,440);assert.equal(c.catalogFields.groundClearanceMm,null);assert.equal(c.catalogFields.electricRange,null);assert.equal(c.technicalSpecs.groups[0].items[2].value,'220');
 const ru=translateTechnicalSpecs(c.technicalSpecs);assert.equal(ru[0].name,'Электромотор');assert.equal(ru[0].items[4].value,'Есть');
});
test('Chinese folded/literal blocks and zero claims survive; source negations are not reversed',()=>{
 const c=parseChinaMarkdown(md,mdUrl,'172877314');assert.equal(c.fields.description,'первая строка вторая строка');assert.match(c.fields.highlights,/\n/);assert.equal(c.condition.insuranceClaimCount,0);assert.equal(c.condition.transferCount,1);assert.equal(c.condition.appearanceScore,85);assert.deepEqual(c.condition.repairExcerpts,['左前翼子板喷漆修复。','车架无损伤。']);assert.equal(c.condition.translation.status,'repair_text_pending');
 assert.equal(parseChinaMarkdown(md.replace('理赔0次/',''),mdUrl,'172877314').condition.insuranceClaimCount,null);
});
test('Offline enrichment preserves photo hashes, report payload, timestamps and grade conflicts',()=>{
 const old=normalizeCard(raw,url,'2026-09-01');old.photos=[{file:'photos/test.jpg',sha256:'abc'}];old.inspection.full={status:'validated',groups:['retained']};old.china={sourceUrl:mdUrl,fetchedAt:'2026-09-02'};
 const next=reprocessCard(old,{url,rawData:raw,observedAt:'2026-09-03'},md);assert.deepEqual(next.photos,old.photos);assert.deepEqual(next.inspection.full,old.inspection.full);assert.equal(next.observedAt,old.observedAt);assert.equal(next.china.fetchedAt,old.china.fetchedAt);assert.equal(next.china.status,'matched');assert.equal(next.conflicts[0].china,'B');
 assert.throws(()=>reprocessCard({...old,clueId:'111111111'},{url,rawData:raw},md),/identity/);
});
test('Full report keeps exact photo-to-part and marker links, while rejecting wrong cars and error payloads',()=>{
 const card=normalizeCard(raw,url);const full=normalizeGuaziReport(capture(),card);assert.equal(full.itemCount,3);assert.equal(full.abnormalItemCount,1);assert.equal(full.images.length,1);assert.equal(full.images[0].evidence[0].itemId,1);assert.equal(full.images[0].evidence[0].positions[0].x,50);assert.equal(full.groups[0].items[2].status,'unknown');
 const wrong=capture();wrong.payload.data.taskId=321;assert.throws(()=>normalizeGuaziReport(wrong,card),/identity/);
 const denied=capture();denied.payload.success=false;assert.throws(()=>normalizeGuaziReport(denied,card),/successful/);
 const evil=capture();evil.payload.data.categoryList[0].itemList[0].imageDetailList[0].url='https://evil.test/photo';assert.throws(()=>normalizeGuaziReport(evil,card),/image URL/);
});

test('Legacy taskId zero requires matching photo and title as well as VIN and product request',()=>{
 const card=normalizeCard(raw,url);const c=capture();
 Object.assign(card.inspection.lite.baseInfo,{taskId:0,title:'Test car',vehicleMainImage:img});
 Object.assign(c.payload.data.baseInfo,{taskId:0,title:'Test car',vehicleMainImage:img});c.payload.data.taskId=0;
 assert.equal(normalizeGuaziReport(c,card).status,'validated');
 c.payload.data.baseInfo.vehicleMainImage=img+'?other';assert.throws(()=>normalizeGuaziReport(c,card),/identity/);
 c.payload.data.baseInfo.vehicleMainImage=img;c.sourceUrl='https://en.guazi.com/report/?productId=aaaaaaaaaa';assert.throws(()=>normalizeGuaziReport(c,card),/identity/);
});

test('Report integration downloads linked evidence and resumes without requesting the report again',async t=>{
 const fs=await import('node:fs/promises');const path=await import('node:path');
 const {runPilot,options}=await import('../scripts/guazi-pilot.mjs');
 const {verifiedPhoto}=await import('../scripts/lib/guazi-pilot-io.mjs');
 const out=await fs.mkdtemp(path.resolve('runtime/guazi-report-test-'));t.after(()=>fs.rm(out,{recursive:true,force:true}));
 let reports=0,downloads=0;
 const r=structuredClone(raw);r.reportDetailLite.baseInfo={taskId:123,vinMask:'TEST****123',level:'A'};
 const o=options(['--url',url,'--limit','1','--photos','0','--skip-china','--reports','--out',out]);
 const dependencies={log:()=>{},browserFactory:async()=>({card:async()=>({url,rawData:r}),report:async()=>{reports++;return capture();},close:async()=>{}}),fetchImpl:async()=>{downloads++;return new Response(Buffer.from([255,216,255,0,255,217]),{headers:{'content-type':'image/jpeg'}});}};
 const first=await runPilot(o,dependencies);assert.equal(first.fullReports.validated,1);assert.equal(first.inspectionPhotosSaved,1);
 const saved=JSON.parse(await fs.readFile(path.join(out,'cards/y2ud7mtru4.json'),'utf8'));
 assert.equal(await verifiedPhoto(path.join(out,'inspection'),saved.inspection.full.photos[0]),true);
 assert.equal((await runPilot(o,dependencies)).status,'complete');assert.equal(reports,1);assert.equal(downloads,1);
});

test('Truncated report is rejected even when identity and success code match',()=>{
 const card=normalizeCard(structuredClone(raw),url);card.inspection.lite.baseInfo={taskId:123,vinMask:'TEST****123'};
 card.inspection.lite.categoryList=[{categoryId:101,normalCount:2,abnormalCount:1}];
 assert.equal(normalizeGuaziReport(capture(),card).itemCount,3);
 const c=capture();c.payload.data.categoryList[0].itemList.pop();assert.throws(()=>normalizeGuaziReport(c,card),/item counts/);
});

test('Offline directory validates every input before replacing cards and preserves originals in backups',async t=>{
 const fs=await import('node:fs/promises');const path=await import('node:path');const {reprocessDirectory}=await import('../scripts/guazi-pilot-reprocess.mjs');
 const out=await fs.mkdtemp(path.resolve('runtime/guazi-backfill-test-'));t.after(()=>fs.rm(out,{recursive:true,force:true}));
 await fs.mkdir(path.join(out,'cards'));await fs.mkdir(path.join(out,'raw'));
 const old=normalizeCard(raw,url);old.schemaVersion=1;old.china={status:'not_found'};old.photos=[];
 const original=JSON.stringify(old);await fs.writeFile(path.join(out,'cards/y2ud7mtru4.json'),original);
 await fs.writeFile(path.join(out,'raw/y2ud7mtru4.json'),JSON.stringify({url,rawData:raw}));
 await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify({cards:['y2ud7mtru4','aaaaaaaaaa']}));
 await assert.rejects(reprocessDirectory(out));assert.equal(await fs.readFile(path.join(out,'cards/y2ud7mtru4.json'),'utf8'),original);
 await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify({cards:['y2ud7mtru4']}));
 const summary=await reprocessDirectory(out);assert.equal(summary.networkRequests,0);assert.equal(summary.cards,1);
 assert.equal(JSON.parse(await fs.readFile(path.join(summary.backup,'y2ud7mtru4.json'),'utf8')).schemaVersion,1);
 assert.equal(JSON.parse(await fs.readFile(path.join(out,'cards/y2ud7mtru4.json'),'utf8')).schemaVersion,2);
});

#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { makeSegments, searchBody, listCandidate, normalizeCoreCard, evaluateCoreCard } from './lib/guazi-core.mjs';
import { parseChinaMarkdown, matchChina } from './lib/guazi-pilot-data.mjs';
import { openGuaziBrowser } from './lib/guazi-pilot-browser.mjs';
import { readJson, writeJson, atomicWrite, getText, loadChinaIndex, mapLimit, limiter, downloadPhotos } from './lib/guazi-pilot-io.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function options(args) {
  const {values:v}=parseArgs({args,options:{run:{type:'boolean'},segments:{type:'string'},pages:{type:'string',default:'1'},take:{type:'string',default:'5'},photos:{type:'string',default:'3'},out:{type:'string',default:'runtime/guazi-core'},headless:{type:'boolean'},'verify-checkbox':{type:'boolean'},help:{type:'boolean'}}});
  const n=(s,max)=>{const x=Number(s);if(!Number.isInteger(x)||x<1||x>max)throw new Error('Invalid limit');return x;};
  const out=path.resolve(ROOT,v.out);if(!out.startsWith(path.join(ROOT,'runtime')+path.sep))throw new Error('Output must be inside runtime');
  return {...v,out,pages:n(v.pages,10000),take:n(v.take,100000),photos:v.photos==='all'?'all':v.photos==='0'?0:n(v.photos,1000),segments:v.segments?.split(',')};
}
export async function runCore(o,{browserFactory=openGuaziBrowser,textLoader=getText,fetchImpl=fetch,log=console.log}={}) {
  const config=await readJson(path.join(ROOT,'config/guazi-core.json'));
  const {filters}=await readJson(path.join(ROOT,config.sharedFilterFile));
  const dictionary=await readJson(path.join(ROOT,'config/guazi-core-brands.json'));
  const all=makeSegments(dictionary.brands,filters,config);
  const segments=o.segments?all.filter(s=>o.segments.includes(s.id)):all;
  if(!segments.length || o.segments?.some(id=>!segments.some(s=>s.id===id)))throw new Error('Unknown segment ID');
  await fs.mkdir(o.out,{recursive:true,mode:0o700});
  if(!(await fs.realpath(o.out)).startsWith((await fs.realpath(path.join(ROOT,'runtime')))+path.sep))throw new Error('Output resolves outside runtime');
  const lockPath=path.join(o.out,'.lock');const lock=await fs.open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));
  let browser, state;const started=Date.now();const errors=[];let blocked=false;let writes=Promise.resolve();
  let lastCheckpoint = 0;
  const checkpoint=(force=false)=>{
    if(!force && Date.now()-lastCheckpoint<1000)return writes;
    lastCheckpoint=Date.now();
    return writes=writes.then(()=>writeJson(path.join(o.out,'checkpoint.json'),state));
  };
  const counters={chinaRequests:0,photoRequests:0,photoBytes:0,accountRequests:0};
  const loadText=async(...args)=>{counters.chinaRequests++;return textLoader(...args);};
  const photoFetch=async(...args)=>{counters.photoRequests++;return fetchImpl(...args);};
  try {
  try {
    await writeJson(path.join(o.out,'plan.json'),{createdAt:new Date().toISOString(),priceBasis:config.priceBasis,publicOnly:true,dictionaryObservedAt:dictionary.observedAt,segments});
    if(!o.run)return {status:'plan_only',segments:segments.length,output:o.out};
    const signature=createHash('sha256').update(JSON.stringify({config,segments})).digest('hex');
    state=await readJson(path.join(o.out,'checkpoint.json'),{signature,candidates:[],discovery:{},results:{},createdAt:new Date().toISOString()});
    if(state.signature!==signature)throw new Error('Filters changed; use a new output directory');
    const known=new Set(state.candidates.map(c=>c.id));
    browser=await browserFactory({publicOnly:true,transport:'session-http',headless:!!o.headless,verifyCheckbox:!!o['verify-checkbox'],requestInterval:config.requestIntervalMs,delay:250});
    await browser.publicBootstrap();
    for(const segment of segments) {
      for(const partition of config.exportEligibilityPartitions) {
        const key=`${segment.id}:${partition}`;
        const d=state.discovery[key] ||= {pages:0,total:null,exhausted:false,fingerprints:[]};
        while(!d.exhausted && d.pages<o.pages) {
          const payload=await browser.publicSearch(searchBody(segment,config,d.pages+1,partition));
          const list=payload.data.list;d.total=payload.data.totalCount;
          const fingerprint=list.map(x=>x.productId).join(',');
          if((!list.length && d.pages*config.pageSize<d.total)|| (list.length && d.fingerprints.includes(fingerprint)))throw new Error(`Incomplete or repeating list: ${key}`);
          for(const item of list) {
            const candidate={...listCandidate(item,segment),exportPolicyEligible:partition};
            if(!known.has(candidate.id)){known.add(candidate.id);state.candidates.push(candidate);}
          }
          d.pages++;d.fingerprints.push(fingerprint);d.exhausted=d.pages*config.pageSize>=d.total;
          await checkpoint();
        }
      }
      log(JSON.stringify({stage:'discovery',segment:segment.id,candidates:state.candidates.length}));
    }
    const index=await loadChinaIndex(o.out,{textLoader:loadText});
    log(JSON.stringify({stage:'china-index',complete:index.complete,identities:Object.keys(index.entries).length}));
    const photos=limiter(config.photoWorkers);
    // Bound the trial by segment; raising --take resumes already discovered candidates.
    const selected=segments.flatMap(s=>state.candidates.filter(c=>c.segmentId===s.id && !c.violations.length).slice(0,o.take));
    let consecutiveErrors=0;
    await mapLimit(selected,config.cardWorkers,async candidate=>{
      if(blocked)return;
      const id=candidate.id, file=path.join(o.out,'cards',`${id}.json`);
      try {
        const segment=segments.find(s=>s.id===candidate.segmentId);
        let capture=await readJson(path.join(o.out,'raw',`${id}.json`));
        if(!capture){const reader=await browser.worker();capture=await reader.card(candidate.url);await writeJson(path.join(o.out,'raw',`${id}.json`),capture);}
        const card=normalizeCoreCard(capture,config);
        const previous=await readJson(file);card.photos=previous?.photos||[];
        const urls=index.entries[card.clueId]||[];
        if(urls.length!==1)card.china={status:urls.length?'ambiguous':index.complete?'not_found':'index_incomplete'};
        else {
          const mdFile=path.join(o.out,'china',`${id}.md`);
          let md;try{md=await fs.readFile(mdFile,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;md=await loadText(urls[0],'markdown');await atomicWrite(mdFile,md);}
          card.china=matchChina(card,parseChinaMarkdown(md,urls[0],card.clueId));
          card.china.fetchedAt=(await fs.stat(mdFile)).mtime.toISOString();
        }
        const evaluation=evaluateCoreCard(card,segment,config);
        if(evaluation.car) evaluation.car.sourceExportPolicyEligible=candidate.exportPolicyEligible ?? null;
        await writeJson(file,card);
        if(evaluation.status==='accepted') {
          card.photos=await downloadPhotos(card,o.out,{count:o.photos,mode:'large',fetchImpl:photoFetch,schedule:photos});
          await writeJson(file,card);
          evaluation.car.localPhotos=card.photos.filter(p=>p.status==='saved').map(p=>p.file);
          evaluation.car.photoStatus=card.photos.some(p=>p.status!=='saved')?'partial':o.photos===0?'not_requested':'selected_photos_saved';
          await writeJson(path.join(o.out,'accepted',`${id}.json`),evaluation.car);
          counters.photoBytes+=card.photos.filter(p=>p.status==='saved'&&!p.reused).reduce((s,p)=>s+p.bytes,0);
        } else await fs.rm(path.join(o.out,'accepted',`${id}.json`),{force:true});
        const {car,...result}=evaluation;
        state.results[id]={...result,segmentId:segment.id,photos:card.photos.map(p=>({status:p.status,file:p.file})),observedAt:card.observedAt};
        consecutiveErrors=0;
        await checkpoint();log(JSON.stringify({stage:'card',id,status:evaluation.status,reason:evaluation.reason}));
      } catch(e){
        await fs.rm(path.join(o.out,'accepted',`${id}.json`),{force:true});
        state.results[id]={status:'error',reason:String(e.message).split('\n')[0],segmentId:candidate.segmentId};
        errors.push({id,error:state.results[id].reason});
        if(e.code==='SOURCE_BLOCKED'||++consecutiveErrors>=3)blocked=true;
        await checkpoint();
      }
    });
  } catch(e) {errors.push({error:String(e.message).split('\n')[0]});blocked ||= e.code==='SOURCE_BLOCKED';if(!state)throw e;}
  finally {if(state)await checkpoint(true);await writes;await browser?.close();}
  const results=Object.values(state.results), count=status=>results.filter(r=>r.status===status).length;
  const photoErrors=results.flatMap(r=>r.photos||[]).filter(p=>p.status!=='saved').length;
  const report={photoErrors,startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),seconds:(Date.now()-started)/1000,status:blocked?'blocked':errors.length||photoErrors?'partial':'trial_complete',accountRequests:0,fullReportsRequested:0,priceBasis:config.priceBasis,segments:segments.length,candidates:state.candidates.length,listRejected:state.candidates.filter(c=>c.violations.length).length,accepted:count('accepted'),needsReview:count('needs_review'),rejected:count('rejected'),errors,requests:{...counters,...browser?.metrics},coverageComplete:Object.values(state.discovery).length===segments.length*config.exportEligibilityPartitions.length&&Object.values(state.discovery).every(d=>d.exhausted)&&state.candidates.every(c=>c.violations.length||(state.results[c.id]&&state.results[c.id].status!=='error')),coverage:state.discovery,output:o.out};
  await writeJson(path.join(o.out,'report.json'),report);return report;
  } finally {await lock.close();await fs.rm(lockPath,{force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{const o=options(process.argv.slice(2));if(o.help)console.log('Guazi public core: default writes plan only. --run --segments 102715-electric,1212-plug-in,1195-gasoline,103950-range-extended --pages 1 --take 5 --photos 3|all|0 --out runtime/guazi-core --verify-checkbox. No account, no database writes. New output = fresh snapshot; same output = resume.');else{const r=await runCore(o);const {coverage,...summary}=r;console.log(JSON.stringify(summary,null,2));process.exitCode=['blocked','partial'].includes(r.status)?3:0;}}catch(e){console.error(String(e.message).split('\n')[0]);process.exitCode=1;}
}

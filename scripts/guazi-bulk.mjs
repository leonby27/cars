#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {openGuaziBrowser} from './lib/guazi-pilot-browser.mjs';
import {searchBody,listCandidate,normalizeCoreCard,evaluateCoreCard} from './lib/guazi-core.mjs';
import {readJson,writeJson,getText,loadChinaIndex,mapLimit} from './lib/guazi-pilot-io.mjs';
import {withGuaziRetries} from './lib/guazi-retry.mjs';
import {discoverPartition,DISCOVERY_VERSION} from './lib/guazi-discovery.mjs';
import {chinaEnricher} from './lib/guazi-china-enrichment.mjs';
export async function runBulk(out,{browserFactory=openGuaziBrowser,emit=async e=>{if(!process.stdout.write(JSON.stringify(e)+'\n'))await once(process.stdout,'drain');},textLoader=getText,signal}={}){
 const checkStop=()=>{if(signal?.aborted)throw Object.assign(Error('Collector paused by operator'),{code:'GUAZI_PAUSED'});};
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const config={...await readJson(path.join(root,'config/guazi-core.json')),priceBasis:'FOB'};
 const census=await readJson(path.join(out,'census.json'));if(census?.status!=='complete')throw Error('Complete census is required');
 if(Date.now()-Date.parse(census.finishedAt)>86400000)throw Error('Census older than 24 hours; start a fresh snapshot');
 const signature=createHash('sha256').update(JSON.stringify({config,order:census.order})).digest('hex');
 const lock=await fs.open(path.join(out,'bulk.lock'),'wx');await lock.writeFile(String(process.pid));
 let browser,state;let saveChain=Promise.resolve(),lastSave=0;
 const save=(force=false)=>{if(!force&&Date.now()-lastSave<1500)return saveChain;lastSave=Date.now();return saveChain=saveChain.then(()=>writeJson(path.join(out,'bulk-state.json'),state));};
 const event=async data=>{const e={at:new Date().toISOString(),...data};await fs.appendFile(path.join(out,'events.jsonl'),JSON.stringify({...e,car:undefined})+'\n');await emit(e);};
 try{
  state=await readJson(path.join(out,'bulk-state.json'),{signature,createdAt:new Date().toISOString(),pages:{},results:{},brandsDone:[],status:'running',errors:[]});
  if(state.signature!==signature)throw Error('Import policy changed; new run directory required');
  if(state.discoveryVersion!==DISCOVERY_VERSION){state.legacyPages=state.pages;state.legacyBrandsDone=state.brandsDone;state.pages={};state.brandsDone=[];state.discoveryVersion=DISCOVERY_VERSION;await event({event:'discovery_upgrade',message:'Rechecking prior brand coverage with stable pagination and subdivisions; saved cards reused'});}
  state.status='running';await save(true);
  for(const [id,result] of Object.entries(state.results)){if(result.status==='accepted'){const car=await readJson(path.join(out,'accepted',id+'.json'));if(!car)throw Error(`Missing accepted checkpoint ${id}`);await event({event:'accepted',id,brand:car.brand,car,replayed:true});}}
  const retry=(operation,context)=>withGuaziRetries(()=>{checkStop();return operation();},{onRetry:details=>event({event:'network_retry',...context,...details})});
  browser=await browserFactory({publicOnly:true,transport:'session-http',verifyCheckbox:true,requestInterval:750,delay:250,onEvent:event});await retry(()=>browser.publicBootstrap(),{stage:'bootstrap'});
  const index=await loadChinaIndex(out,{textLoader});
  if(!index.complete)await event({event:'warning',reason:'china_index_incomplete',message:'FOB import can proceed; Chinese condition enrichment may be incomplete'});
  const enrichChina=chinaEnricher({state,index,textLoader,event,save:()=>save(true)});
  const reader=await browser.worker();let stop=null,consecutiveErrors=0;
  for(const brand of census.order){
   checkStop();
   if(state.brandsDone.includes(brand.brand))continue;
   state.brand=brand.brand;await event({event:'brand_started',brand:brand.brand,sourceTotal:brand.total});
   for(const segment of brand.segments){for(const partition of config.exportEligibilityPartitions){
    const key=`${segment.id}:${partition}`;const progress=state.pages[key]||={page:0,exhausted:false,fingerprints:[]};
    if(census.counts[key]===0){progress.exhausted=true;continue;}
    if(progress.exhausted)continue;
    const discoveryFile=path.join(out,'discovery',key+'.json');
    const discovery=await readJson(discoveryFile,{version:DISCOVERY_VERSION});
    const candidates=await discoverPartition({search:body=>retry(()=>browser.publicSearch(body),{stage:'list',segment:segment.id,partition,page:body.pageNum}),body:searchBody(segment,config,1,partition),state:discovery,save:()=>writeJson(discoveryFile,discovery),event:data=>event({...data,brand:brand.brand,segment:segment.id,partition})});
    while(!progress.exhausted){
     const disk=await fs.statfs(out);if(disk.bavail*disk.bsize<1024**3)throw Error('Collector disk has less than 1 GB free');
     const list=candidates.slice(progress.page*config.pageSize,(progress.page+1)*config.pageSize);
     await mapLimit(list,4,async item=>{
      if(stop||signal?.aborted)return;
      const candidate=listCandidate(item,segment),id=candidate.id;
      if(state.results[id]&&state.results[id].status!=='error')return;
      if(candidate.violations.length){state.results[id]={status:'rejected',reason:candidate.violations.join(','),brand:brand.brand};await event({event:'rejected',id,brand:brand.brand,reason:state.results[id].reason});return;}
      try{
       const file=path.join(out,'cards',id+'.json');let card=await readJson(file);
       if(!card){card=normalizeCoreCard(await retry(()=>reader.card(candidate.url),{stage:'card',id,brand:brand.brand}),config);await writeJson(file,card);}
       // Optional public summaries never block a valid FOB quotation.
       await enrichChina(card,{id,brand:brand.brand});
       await writeJson(file,card);
       const result=evaluateCoreCard(card,segment,config);const {car,...summary}=result;
       state.results[id]={...summary,brand:brand.brand,sourceExportPolicyEligible:partition};
       if(car){car.sourceExportPolicyEligible=partition;car.importRun=path.basename(out);car.checkedAt=card.observedAt;car.available=true;
        car.conditionSummary=card.china?.status==='matched'?card.china.condition?.summaryRu||null:null;
        await writeJson(path.join(out,'accepted',id+'.json'),car);
        await event({event:'accepted',id,brand:brand.brand,car});
       }else await event({event:result.status,id,brand:brand.brand,reason:result.reason});
       consecutiveErrors=0;await save();
      }catch(e){state.results[id]={status:'error',reason:e.message.split('\n')[0],code:e.code,accessReason:e.reason,brand:brand.brand};state.errors.push({id,at:new Date().toISOString(),reason:state.results[id].reason});await event({event:'error',id,brand:brand.brand,message:state.results[id].reason,code:e.code,accessReason:e.reason,triggerUrl:e.url});if(e.code==='SOURCE_BLOCKED'||++consecutiveErrors>=3)stop=e;}
     });
     checkStop();if(stop)throw stop;
     // A failed detail remains on this page for the next run, rather than being lost.
     if(list.some(x=>state.results[x.productId]?.status==='error'))throw Error(`Detail failure on ${key}:${progress.page+1}; resume will retry`);
     progress.page++;progress.total=candidates.length;progress.exhausted=progress.page*config.pageSize>=progress.total;
     state.updatedAt=new Date().toISOString();await save(true);
     await event({event:'page',brand:brand.brand,segment:segment.id,partition,page:progress.page,accepted:Object.values(state.results).filter(r=>r.status==='accepted').length,processed:Object.keys(state.results).length,metrics:browser.metrics});
    }
   }}
   state.brandsDone.push(brand.brand);await save(true);await event({event:'brand_complete',brand:brand.brand});
  }
  state.status='complete';state.finishedAt=new Date().toISOString();await event({event:'complete',accepted:Object.values(state.results).filter(r=>r.status==='accepted').length});
 }catch(e){if(signal?.aborted)e=Object.assign(Error('Collector paused by operator'),{code:'GUAZI_PAUSED'});if(state){state.status=e.code==='GUAZI_PAUSED'?'paused':e.code==='SOURCE_BLOCKED'?'blocked':'error';if(e.code!=='GUAZI_PAUSED')state.errors.push({at:new Date().toISOString(),reason:e.message.split('\n')[0]});}await event({event:e.code==='GUAZI_PAUSED'?'paused':'stopped',message:e.message.split('\n')[0],code:e.code,accessReason:e.reason});throw e;}
 finally{if(state)await save(true);await browser?.close();await lock.close();await fs.rm(path.join(out,'bulk.lock'),{force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{await runBulk(path.resolve(process.argv[2]||'runtime/guazi-import'));}catch{process.exitCode=1;}}

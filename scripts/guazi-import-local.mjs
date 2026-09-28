#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {pool,DATABASE_URL,withTransaction} from '../server/db.mjs';
import {upsertCar} from '../server/repository.mjs';
import {readJson,writeJson} from './lib/guazi-pilot-io.mjs';
import {estimateLandedCost} from '../src/pricing.js';
import {withGuaziRetries} from './lib/guazi-retry.mjs';
const run=process.argv[2]||'guazi-import-20260926';if(!/^guazi-import-\d{8}$/.test(run))throw Error('Invalid run name');
const u=new URL(DATABASE_URL);if(u.hostname!=='127.0.0.1'||u.port!=='54329'||u.pathname!=='/chinacar')throw Error('Local importer refuses a non-local database');
const out=path.resolve('runtime',run);await fs.mkdir(out,{recursive:true});
const lock=await fs.open(path.join(out,'local.lock'),'wx');await lock.writeFile(String(process.pid));
const state=await readJson(path.join(out,'local-state.json'),{run,received:{},errors:[],startedAt:new Date().toISOString()});
const emit=async event=>{const e={at:new Date().toISOString(),...event};await fs.appendFile(path.join(out,'local-events.jsonl'),JSON.stringify(e)+'\n');console.log(JSON.stringify(e));};
const save=()=>writeJson(path.join(out,'local-state.json'),state);
let child;
try{
 state.status='running';state.pid=process.pid;await save();
 // Explicitly armed once by the operator before launch. The worker never changes visibility.
 const setting=await pool.query("SELECT enabled FROM catalog_sources WHERE source='Guazi'");if(!setting.rowCount)throw Error('Source visibility migration is missing');
 await withGuaziRetries(async()=>{
 child=spawn('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','root@5.23.48.128',`cd /opt/abcars-guazi-pilot && xvfb-run -a node scripts/guazi-bulk.mjs runtime/${run}`],{stdio:['ignore','pipe','pipe']});
 const closed=once(child,'close');
 child.stderr.on('data',chunk=>{process.stderr.write(chunk);});
 for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})){
  child.stdout.pause();
  let e;try{e=JSON.parse(line);}catch{await emit({event:'error',message:'Unrecognized collector output'});throw Error('Collector protocol error');}
  state.lastEventAt=e.at;state.brand=e.brand||state.brand;
  if(e.event==='accepted'){
   const car=e.car;if(car?.source!=='Guazi'||car.id!==`guazi-${e.id}`||car.priceBasis!=='FOB'||car.fobPort!=='Horgos'||!Number.isFinite(estimateLandedCost(car).totalUsd))throw Error('Invalid imported car');
   if(!state.received[e.id]){
    await writeJson(path.join(out,'accepted',e.id+'.json'),car);
    await withTransaction(c=>upsertCar(car,c));
    state.received[e.id]={at:new Date().toISOString(),brand:car.brand};
    await emit({event:'imported',id:car.id,brand:car.brand,fobPriceUsd:car.fobPriceUsd,count:Object.keys(state.received).length});await save();
   }

  }else{
   await emit(e);
   if(['error','warning','stopped','needs_review'].includes(e.event))state.errors.push({...e,car:undefined});
   if(e.event==='complete')state.status='complete';
   if(e.event==='stopped')state.status='stopped';
   await save();
  }
  child.stdout.resume();
 }
 const [code,signal]=await closed;if(code!==0)throw Object.assign(Error(`Collector exited ${code ?? signal}`),{code:code===255?'COLLECTOR_TRANSPORT_DISCONNECTED':'COLLECTOR_FAILED'});
 if(state.status!=='complete')throw Error('Collector ended without completion');
 },{baseDelayMs:5000,isRetryable:error=>error.code==='COLLECTOR_TRANSPORT_DISCONNECTED',onRetry:async details=>{state.status='reconnecting';await emit({event:'connection_retry',...details});await save();state.status='running';}});
}catch(error){state.status='stopped';const problem={event:'stopped',message:error.message.split('\n')[0]};state.errors.push({...problem,at:new Date().toISOString()});await emit(problem);child?.kill('SIGTERM');process.exitCode=1;}
finally{state.updatedAt=new Date().toISOString();await save();await pool.end();await lock.close();await fs.rm(path.join(out,'local.lock'),{force:true});}

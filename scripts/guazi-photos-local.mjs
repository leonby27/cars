#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {readJson,writeJson,pause} from './lib/guazi-pilot-io.mjs';
import {cachedGuaziImage} from '../server/guazi-image-cache.mjs';
import {withGuaziRetries} from './lib/guazi-retry.mjs';
import {warmPhotoBatch,GUAZI_WARM_PHOTOS,GUAZI_PHOTO_CONCURRENCY} from './lib/guazi-photo-batch.mjs';
import {serverRunPath,removeDeadProcessLock} from './lib/guazi-server-runtime.mjs';
const run=process.argv[2];
if(!/^guazi-import-\d{8}$/.test(run||''))throw Error('Invalid run name');
const out=path.resolve('runtime',run);
const serverMode=process.argv.includes('--server');
if(serverMode){serverRunPath(process.cwd(),run);await removeDeadProcessLock(path.join(out,'photos.lock'));}
const lock=await fs.open(path.join(out,'photos.lock'),'wx');await lock.writeFile(String(process.pid));
const state=await readJson(path.join(out,'photos-state.json'),{done:{},errors:[]});
let saveChain=Promise.resolve();
const save=()=>saveChain=saveChain.then(()=>writeJson(path.join(out,'photos-state.json'),state));
const emit=async e=>{const event={at:new Date().toISOString(),...e};await fs.appendFile(path.join(out,'photos-events.jsonl'),JSON.stringify(event)+'\n');console.log(JSON.stringify(event));};
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
try {
 state.status='running';state.pid=process.pid;state.warmPhotoCount=GUAZI_WARM_PHOTOS;state.concurrency=GUAZI_PHOTO_CONCURRENCY;await save();
 while(!stopping){
  const disk=await fs.statfs(out);if(disk.bavail*disk.bsize<5*1024**3)throw Error('Photo storage has less than 5 GB free');
  const names=(await fs.readdir(path.join(out,'accepted'))).filter(n=>n.endsWith('.json')&&!state.done[n]);
  await warmPhotoBatch(names,{
   shouldStop:()=>stopping,
   checkDisk:async()=>{const available=await fs.statfs(out);if(available.bavail*available.bsize<5*1024**3)throw Error('Photo storage has less than 5 GB free');},
   readCar:name=>readJson(path.join(out,'accepted',name)),
   download:(url,car)=>withGuaziRetries(()=>cachedGuaziImage(url),{onRetry:details=>emit({event:'photo_retry',id:car.id,...details})}),
   onError:async(error,car)=>{const e={event:'photo_error',id:car.id,message:error.message.split('\n')[0]};state.errors.push({...e,at:new Date().toISOString()});await emit(e);},
   onComplete:async(name,car)=>{state.done[name]=new Date().toISOString();state.updatedAt=new Date().toISOString();await save();await emit({event:'photos_cached',id:car.id,count:Object.keys(state.done).length,photoCount:Math.min(car.images.length,GUAZI_WARM_PHOTOS)});},
  });
  const importer=await readJson(path.join(out,serverMode?'bulk-state.json':'local-state.json'));
  if(importer?.status==='complete' && !(await fs.readdir(path.join(out,'accepted'))).some(n=>n.endsWith('.json')&&!state.done[n])){state.status='complete';break;}
  // Drain every newly discovered batch even if the main importer has stopped.
  const pending=(await fs.readdir(path.join(out,'accepted'))).some(n=>n.endsWith('.json')&&!state.done[n]);
  if(['stopped','error','blocked','paused'].includes(importer?.status)&&!pending){state.status='waiting_for_import';await save();}
  else state.status='running';
  if(!stopping)await pause(3000);
 }
 if(stopping)state.status='paused';
}catch(error){state.status='stopped';state.errors.push({at:new Date().toISOString(),message:error.message});await emit({event:'stopped',message:error.message});process.exitCode=1;}
finally{await save();await lock.close();await fs.rm(path.join(out,'photos.lock'),{force:true});}

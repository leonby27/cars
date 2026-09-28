#!/usr/bin/env node
import {runBulk} from './guazi-bulk.mjs';
import {serverRunPath,removeDeadProcessLock,compactCollectorEvent} from './lib/guazi-server-runtime.mjs';
const out=serverRunPath(process.cwd(),process.argv[2]);
await removeDeadProcessLock(out+'/bulk.lock');
const controller=new AbortController();
process.on('SIGTERM',()=>controller.abort());process.on('SIGINT',()=>controller.abort());
try{
 // accepted/*.json is the durable publication-ready spool; no DB or SSH writer.
 // Full car payloads are never duplicated into the service journal.
 await runBulk(out,{signal:controller.signal,emit:async event=>{if(!event.replayed)console.log(JSON.stringify(compactCollectorEvent(event)));}});
}catch(error){if(error.code!=='GUAZI_PAUSED')process.exitCode=1;}

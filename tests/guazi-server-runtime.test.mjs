import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {serverRunPath,removeDeadProcessLock,compactCollectorEvent} from '../scripts/lib/guazi-server-runtime.mjs';

test('server mode stays isolated and journal omits full car payload',()=>{
 assert.equal(serverRunPath('/opt/abcars-guazi-pilot','guazi-import-20260926'),'/opt/abcars-guazi-pilot/runtime/guazi-import-20260926');
 assert.throws(()=>serverRunPath('/srv/abcars','guazi-import-20260926'));
 assert.throws(()=>serverRunPath('/opt/abcars-guazi-pilot','../../abcars'));
 assert.deepEqual(compactCollectorEvent({event:'accepted',id:'abc',car:{source:'Guazi',images:['large']}}),{event:'accepted',id:'abc'});
});
test('only a provably dead lock owner is removed; live, invalid or inaccessible owners are preserved',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'guazi-lock-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'bulk.lock');
 await removeDeadProcessLock(file);
 await fs.writeFile(file,'123');await assert.rejects(removeDeadProcessLock(file,{alive:()=>{}}),/live PID/);assert.equal(await fs.readFile(file,'utf8'),'123');
 await assert.rejects(removeDeadProcessLock(file,{alive:()=>{throw Object.assign(Error('denied'),{code:'EPERM'});}}),/denied/);
 await fs.writeFile(file,'invalid');await assert.rejects(removeDeadProcessLock(file),/Invalid lock/);
 await fs.writeFile(file,'123');await removeDeadProcessLock(file,{alive:()=>{throw Object.assign(Error('gone'),{code:'ESRCH'});}});await assert.rejects(fs.stat(file),{code:'ENOENT'});
});

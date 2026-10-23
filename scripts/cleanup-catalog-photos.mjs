// Trust the stored Sold status. No source requests and no full-catalog JS pass.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pool } from '../server/db.mjs';
import { guaziPhotoKeys, photoIdentity, storedPhotoFiles, storedGuaziFiles, storedNginxPhotoFiles, guaziCacheDirectories, removeUnchangedPhoto } from './lib/photo-cleanup.mjs';
import { soldPhotoQuery } from './lib/sold-photo-query.mjs';
import { imageCacheRoot } from '../server/guazi-image-key.mjs';
const directory=process.env.PHOTO_STORE_DIR || '/srv/abcars-media';
const stateDirectory=process.env.PHOTO_STORE_STATE_DIR || '/srv/abcars/runtime/photo-store';
const nginxDirectories=process.env.PHOTO_NGINX_CACHE_DIR ? [process.env.PHOTO_NGINX_CACHE_DIR] : ['/var/cache/nginx','/var/cache/abdrive'];
const apply=process.argv.includes('--apply');
const log=data=>console.log(JSON.stringify({at:new Date().toISOString(),...data}));
const summarize=files=>files.reduce((result,file)=>{
  result.files++; result.bytes+=file.size+(file.sidecar?.size || 0);
  result.allocatedBytes+=file.allocatedBytes+(file.sidecar?.allocatedBytes || 0);
  result[file.kind]=(result[file.kind] || 0)+1;
  return result;
},{files:0,bytes:0,allocatedBytes:0});
let client,inTransaction=false;
try {
  const files=await storedPhotoFiles(directory);
  log({phase:'inventory-stored',files:files.length});
  for(const root of await guaziCacheDirectories(imageCacheRoot(),{
    releaseDirectory:process.env.PHOTO_ABDRIVE_RELEASES_DIR || '/srv/abdrive/releases',
    extra:(process.env.PHOTO_GUAZI_CACHE_DIRS || '').split(path.delimiter).filter(Boolean),
  })) {
    for(const file of await storedGuaziFiles(root)) files.push(file);
    log({phase:'inventory-guazi',root,files:files.length});
  }
  for(const root of nginxDirectories) {
    for(const file of await storedNginxPhotoFiles(root)) files.push(file);
    log({phase:'inventory-nginx',root,files:files.length});
  }
  log({phase:'inventory-complete',...summarize(files)});
  client=await pool.connect();
  await client.query("SET default_transaction_read_only=on");
  await client.query("SET statement_timeout='15min'");
  await client.query("SET lock_timeout='5s'");
  await client.query("SET work_mem='32MB'");
  await client.query("SET max_parallel_workers_per_gather=0");
  await client.query("SET jit=off");
  await client.query("SET cursor_tuple_fraction=1");
  const {rows:[backend]}=await client.query('SELECT pg_backend_pid() AS pid');
  // The database's one read worker also yields to public requests.
  spawnSync('renice',['-n','15','-p',String(backend.pid)],{stdio:'ignore'});
  spawnSync('ionice',['-c','3','-p',String(backend.pid)],{stdio:'ignore'});
  const wanted=new Set(files.map(file=>file.key)), owners=new Map();
  await client.query('BEGIN READ ONLY');inTransaction=true;
  await client.query('DECLARE sold_photos NO SCROLL CURSOR FOR '+soldPhotoQuery);
  let references=0;
  do {
    const {rows}=await client.query('FETCH 2000 FROM sold_photos');
    if(!rows.length) break;
    for(const row of rows) {
      const single=photoIdentity(row.url);
      for(const key of single ? [single] : guaziPhotoKeys(row.url)) {
        if(!wanted.has(key)) continue;
        if(!owners.has(key)) owners.set(key,new Set());
        owners.get(key).add(row.id);
      }
    }
    references+=rows.length;
    if(references%20000===0) log({phase:'sold-photo-references',references});
  } while(true);
  await client.query('COMMIT');inTransaction=false;
  const selected=files.filter(file=>owners.has(file.key));
  log({phase:'planned',mode:apply?'apply':'dry-run',...summarize(selected)});
  let deleted=0,bytes=0,allocatedBytes=0;
  if(apply) {
    const ids=[...new Set([...owners.values()].flatMap(value=>[...value]))],stillSold=new Set();
    for(let index=0;index<ids.length;index+=500) {
      const {rows}=await client.query("SELECT id FROM listings WHERE id=ANY($1::text[]) AND status='unavailable'",[ids.slice(index,index+500)]);
      for(const row of rows) stillSold.add(row.id);
    }
    log({phase:'sold-status-recheck',listings:ids.length,stillSold:stillSold.size});
    let cursor=0;
    await Promise.all(Array.from({length:4},async()=>{
      while(cursor<selected.length) {
        const file=selected[cursor++];
        if([...owners.get(file.key)].some(id=>!stillSold.has(id))) continue;
        if(await removeUnchangedPhoto(file,file.base)) {
          deleted++; bytes+=file.size+(file.sidecar?.size || 0);
          allocatedBytes+=file.allocatedBytes+(file.sidecar?.allocatedBytes || 0);
          if(deleted%10000===0) log({phase:'deleting',deleted,bytes,allocatedBytes});
        }
      }
    }));
    await fs.rm(path.join(stateDirectory,'cleanup.json'),{force:true});
  }
  log({phase:'complete',mode:apply?'apply':'dry-run',...summarize(selected),deleted,deletedBytes:bytes,deletedAllocatedBytes:allocatedBytes});
} finally {
  if(inTransaction) await client?.query('ROLLBACK').catch(()=>{});
  client?.release();await pool.end();
}

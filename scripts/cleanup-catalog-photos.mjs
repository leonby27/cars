// Only reads the business database. Deletion is opt-in; observations live on disk.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../server/db.mjs';
import { atomicPhotoState } from './lib/catalog-photo-store.mjs';
import { observeListing, recordPhotoOwnership, storedPhotoFiles, removeUnchangedPhoto } from './lib/photo-cleanup.mjs';
const directory=process.env.PHOTO_STORE_DIR || '/srv/abcars-media';
const stateDirectory=process.env.PHOTO_STORE_STATE_DIR || '/srv/abcars/runtime/photo-store';
const apply=process.argv.includes('--apply');
const stateFile=path.join(stateDirectory,'cleanup.json');
const now=Date.now();
let previous={};
try {
  await fs.mkdir(stateDirectory,{recursive:true});
  // The systemd service uses flock to prevent overlapping cleanup runs.
  let saved;
  try { saved=JSON.parse(await fs.readFile(stateFile,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
  if(saved) {
    if(saved.version!==1 || !saved.unavailable || typeof saved.unavailable!=='object') throw new Error('Invalid cleanup state');
    previous=saved.unavailable;
  }
  const files=await storedPhotoFiles(directory);
  const keys=new Set(files.map(file=>file.key));
  const observations={};
  async function scan(wanted, record) {
    const owned=new Set(), protectedKeys=new Set();
    let cursor='';
    do {
      const {rows}=await pool.query(`SELECT l.id,l.status,l.last_seen_at::text,
        ARRAY(SELECT url FROM listing_media WHERE listing_id=l.id) AS images
        FROM listings l WHERE l.id>$1 ORDER BY l.id LIMIT 500`,[cursor]);
      if(!rows.length) break;
      for(const listing of rows) {
        const observation=observeListing(listing,previous[listing.id],now);
        if(record && observation) observations[listing.id]=observation;
        recordPhotoOwnership(listing,observation,now,wanted,owned,protectedKeys);
      }
      cursor=rows.at(-1).id;
    } while(true);
    return new Set([...owned].filter(key=>!protectedKeys.has(key)));
  }
  const candidates=await scan(keys,true);
  // Re-read all owners immediately before deletion: protect reactivated listings
  // and new listings sharing the same image. Unmapped files are never deleted.
  const confirmed=apply && candidates.size ? await scan(candidates,false) : candidates;
  const selected=files.filter(file=>confirmed.has(file.key));
  let deleted=0,bytes=0;
  if(apply) {
    await atomicPhotoState(stateFile,{version:1,unavailable:observations,updatedAt:new Date(now).toISOString()});
    for(const file of selected) {
      if(await removeUnchangedPhoto(file,directory)) {deleted++;bytes+=file.size;}
    }
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',storedFiles:files.length,trackedUnavailable:Object.keys(observations).length,eligibleFiles:selected.length,eligibleBytes:selected.reduce((sum,file)=>sum+file.size,0),deleted,bytes}));
} finally { await pool.end(); }

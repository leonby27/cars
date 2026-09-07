import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { photoIdentity,observeListing,eligibleListing,PHOTO_RETENTION_MS,recordPhotoOwnership,storedPhotoFiles,removeUnchangedPhoto } from '../scripts/lib/photo-cleanup.mjs';
const source='https://erscglobal2.autoimg.cn/escimg/auto/1400x0_c42_car.webp';
const key='/photo/escimg/auto/car.webp';
const now=1800000000000;
const removed={id:'car',status:'unavailable',last_seen_at:'2026-09-01',images:[source]};
test('seven days start on observation, reset on reactivation or changed last-seen date',()=>{
 const observed=observeListing(removed,undefined,now);
 assert.equal(eligibleListing(observed,now),false);
 assert.equal(eligibleListing(observed,now+PHOTO_RETENTION_MS-1),false);
 assert.equal(eligibleListing(observed,now+PHOTO_RETENTION_MS),true);
 assert.equal(observeListing({...removed,status:'active'},observed,now+PHOTO_RETENTION_MS),null);
 assert.equal(observeListing({...removed,status:'unknown'},observed,now+PHOTO_RETENTION_MS),null);
 const changed=observeListing({...removed,last_seen_at:'2026-09-05'},observed,now+PHOTO_RETENTION_MS);
 assert.equal(eligibleListing(changed,now+PHOTO_RETENTION_MS),false);
 assert.equal(observeListing(removed,{...observed,since:NaN},now).since,now);
});
test('shared photos are protected by every active or recently removed owner in every size',()=>{
 for(const width of [600,900,1400]) assert.equal(photoIdentity(`/photo/escimg/auto/${width}x0_c42_car.webp`),key);
 assert.equal(photoIdentity(source),key);
 assert.equal(photoIdentity('https://example.com/escimg/auto/car.webp'),null);
 assert.equal(photoIdentity('/photo/escimg/../outside.webp'),null);
 const owned=new Set(),protectedKeys=new Set(),wanted=new Set([key,'/photo/escimg/orphan.webp']);
 const expired={since:now-PHOTO_RETENTION_MS,lastSeen:removed.last_seen_at};
 recordPhotoOwnership(removed,expired,now,wanted,owned,protectedKeys);
 assert.deepEqual([...owned],[key]);assert.equal(protectedKeys.size,0);
 recordPhotoOwnership({...removed,status:'active'},null,now,wanted,owned,protectedKeys);
 assert.deepEqual([...protectedKeys],[key]);
 assert.equal(owned.has('/photo/escimg/orphan.webp'),false);
 const recentProtection=new Set();
 recordPhotoOwnership(removed,{...expired,since:now},now,wanted,new Set(),recentProtection);
 assert.ok(recentProtection.has(key));
});
test('cleanup ignores unrelated files and symlinks; only deletes unchanged regular photos',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'photo-cleanup-'));
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'photo-outside-'));
 try {
  const folder=path.join(directory,'photo/escimg/auto');await fs.mkdir(folder,{recursive:true});
  const file=path.join(folder,'600x0_c42_car.webp');await fs.writeFile(file,'old');
  await fs.writeFile(path.join(folder,'car.webp.tmp'),'temporary');
  await fs.writeFile(path.join(directory,'unrelated.webp'),'keep');
  const target=path.join(outside,'outside.webp');await fs.writeFile(target,'keep');
  await fs.symlink(target,path.join(folder,'symlink.webp'));
  await fs.symlink(outside,path.join(folder,'linked-folder'));
  const files=await storedPhotoFiles(directory);assert.equal(files.length,1);
  await fs.writeFile(file,'replacement with another size');
  assert.equal(await removeUnchangedPhoto(files[0],directory),false);
  const [fresh]=await storedPhotoFiles(directory);
  assert.equal(await removeUnchangedPhoto(fresh,directory),true);
  assert.equal(await removeUnchangedPhoto(fresh,directory),false);
  assert.equal(await fs.readFile(target,'utf8'),'keep');
  assert.equal(await fs.readFile(path.join(directory,'unrelated.webp'),'utf8'),'keep');
 } finally {await fs.rm(directory,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { photoIdentity,guaziPhotoKeys,observeListing,eligibleListing,PHOTO_RETENTION_MS,recordPhotoOwnership,storedPhotoFiles,storedGuaziFiles,removeUnchangedPhoto } from '../scripts/lib/photo-cleanup.mjs';
import { guaziImageCacheFile } from '../server/guazi-image-key.mjs';
import { vehiclePhotoHref } from '../src/photo-source.js';
const source='https://erscglobal2.autoimg.cn/escimg/auto/1400x0_c42_car.webp';
const key='/photo/escimg/auto/car.webp';
const now=1800000000000;
const removed={id:'car',status:'unavailable',last_seen_at:'2026-09-01',images:[source]};
test('a week starts on observation, resets on reactivation or changed last-seen date',()=>{
 assert.equal(PHOTO_RETENTION_MS,7*86400_000);
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

test('Guazi: оригинал и оба превью принадлежат машине; снятая через неделю теряет все три копии',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'guazi-cleanup-'));
 const previous=process.env.GUAZI_IMAGE_CACHE_DIR;process.env.GUAZI_IMAGE_CACHE_DIR=directory;
 t.after(async()=>{if(previous===undefined)delete process.env.GUAZI_IMAGE_CACHE_DIR;else process.env.GUAZI_IMAGE_CACHE_DIR=previous;await fs.rm(directory,{recursive:true,force:true});});
 const image='https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/format,f_jpg';
 const src=width=>new URLSearchParams(vehiclePhotoHref(image,width,{cacheVersion:''}).split('?')[1]).get('src');
 const cached=[0,600,1200].map(width=>guaziImageCacheFile(src(width)));
 for(const file of cached){await fs.writeFile(file,'photo');await fs.writeFile(file+'.json','{}');}
 await fs.writeFile(path.join(directory,'a'.repeat(64)+'.123.tmp'),'temporary');
 await fs.writeFile(path.join(directory,'unrelated.jpg'),'keep');
 const keys=guaziPhotoKeys(image);assert.equal(keys.length,3);
 assert.deepEqual(guaziPhotoKeys(source),[]);
 const files=await storedGuaziFiles(directory);
 assert.deepEqual(files.map(file=>file.key).sort(),[...keys].sort());
 const wanted=new Set(files.map(file=>file.key));
 const listing={id:'guazi-1',status:'unavailable',last_seen_at:'2026-09-01',images:[image]};
 const kept=new Set(),keptProtected=new Set();
 recordPhotoOwnership(listing,{since:now,lastSeen:listing.last_seen_at},now,wanted,kept,keptProtected);
 assert.equal(keptProtected.size,3);
 const owned=new Set(),protectedKeys=new Set();
 recordPhotoOwnership(listing,{since:now-PHOTO_RETENTION_MS,lastSeen:listing.last_seen_at},now,wanted,owned,protectedKeys);
 assert.equal(owned.size,3);assert.equal(protectedKeys.size,0);
 for(const file of files)assert.equal(await removeUnchangedPhoto(file,file.base),true);
 for(const file of cached){await assert.rejects(fs.stat(file),{code:'ENOENT'});await assert.rejects(fs.stat(file+'.json'),{code:'ENOENT'});}
 assert.equal(await fs.readFile(path.join(directory,'unrelated.jpg'),'utf8'),'keep');
});

test('Encar: три размера одного кадра — один владелец, файл на диске узнаётся по пути без размера',async()=>{
  const encar='https://ci.encar.com/carpicture02/pic4212/42124074_001.jpg';
  assert.equal(photoIdentity(encar),'encar:/carpicture02/pic4212/42124074_001.jpg');
  assert.equal(photoIdentity('/photo/encar/w600/carpicture02/pic4212/42124074_001.jpg'),photoIdentity('/photo/encar/w1920/carpicture02/pic4212/42124074_001.jpg'));
  assert.equal(photoIdentity('/photo/encar/v2/w1920/carpicture02/pic4212/42124074_001.jpg'),photoIdentity(encar));
  assert.equal(photoIdentity(vehiclePhotoHref(encar,600,{cacheVersion:''})),photoIdentity(encar));
  assert.equal(photoIdentity('/photo/encar/w600/../x.jpg'),null);
  assert.equal(photoIdentity('/photo/encar/w300/carpicture02/a.jpg'),null);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'encar-photos-'));
  const file=path.join(dir,'photo/encar/w600/carpicture02/pic4212/42124074_001.jpg');
  await fs.mkdir(path.dirname(file),{recursive:true}); await fs.writeFile(file,'jpeg');
  const files=await storedPhotoFiles(dir);
  assert.equal(files.length,1);
  assert.equal(files[0].key,'encar:/carpicture02/pic4212/42124074_001.jpg');
  await fs.rm(dir,{recursive:true,force:true});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { photoIdentity,guaziPhotoKeys,eligibleListing,recordPhotoOwnership,storedPhotoFiles,storedGuaziFiles,storedNginxPhotoFiles,guaziCacheDirectories,nginxPhotoIdentity,selectPhotoCandidates,removeUnchangedPhoto } from '../scripts/lib/photo-cleanup.mjs';
import { guaziImageCacheFile } from '../server/guazi-image-key.mjs';
import { vehiclePhotoHref } from '../src/photo-source.js';
const source='https://erscglobal2.autoimg.cn/escimg/auto/1400x0_c42_car.webp';
const key='/photo/escimg/auto/car.webp';
const removed={id:'car',status:'unavailable',last_seen_at:'2026-09-01',images:[source]};
test('only Sold photos are eligible immediately; active, skipped and unknown statuses are protected',()=>{
 for(const status of ['unavailable']) {
  assert.equal(eligibleListing({...removed,status}),true);
  assert.equal(eligibleListing({...removed,status,last_seen_at:new Date().toISOString()}),true);
 }
 for(const status of ['active','skipped','unknown','',null,undefined]) assert.equal(eligibleListing({...removed,status}),false);
});
test('shared photos are protected by every active or unknown owner in every size; orphans stay untouched',()=>{
 for(const width of [600,900,1400]) assert.equal(photoIdentity(`/photo/escimg/auto/${width}x0_c42_car.webp`),key);
 assert.equal(photoIdentity(source),key);
 assert.equal(photoIdentity('https://example.com/escimg/auto/car.webp'),null);
 assert.equal(photoIdentity('/photo/escimg/../outside.webp'),null);
 const owned=new Set(),protectedKeys=new Set(),wanted=new Set([key,'/photo/escimg/orphan.webp']);
 recordPhotoOwnership(removed,wanted,owned,protectedKeys);
 assert.deepEqual([...owned],[key]);assert.equal(protectedKeys.size,0);
 recordPhotoOwnership({...removed,status:'active'},wanted,owned,protectedKeys);
 assert.deepEqual([...protectedKeys],[key]);
 assert.equal(owned.has('/photo/escimg/orphan.webp'),false);
 const unknownProtection=new Set();
 recordPhotoOwnership({...removed,status:'unknown'},wanted,new Set(),unknownProtection);
 assert.ok(unknownProtection.has(key));
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

test('Guazi: originals, JPEG aliases, previews and JSON sidecars are deleted immediately without backup copies',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'guazi-cleanup-'));
 const previous=process.env.GUAZI_IMAGE_CACHE_DIR;process.env.GUAZI_IMAGE_CACHE_DIR=directory;
 t.after(async()=>{if(previous===undefined)delete process.env.GUAZI_IMAGE_CACHE_DIR;else process.env.GUAZI_IMAGE_CACHE_DIR=previous;await fs.rm(directory,{recursive:true,force:true});});
 const image='https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/format,f_jpg';
 const src=width=>new URLSearchParams(vehiclePhotoHref(image,width,{cacheVersion:''}).split('?')[1]).get('src');
 const cached=guaziPhotoKeys(image).map(key=>path.join(directory,key.slice('guazi:'.length)));
 for(const file of cached){await fs.writeFile(file,'photo');await fs.writeFile(file+'.json','{}');}
 await fs.writeFile(path.join(directory,'a'.repeat(64)+'.123.tmp'),'temporary');
 await fs.writeFile(path.join(directory,'unrelated.jpg'),'keep');
 const keys=guaziPhotoKeys(image);assert.equal(keys.length,5);
 for(const width of [0,600,1200]) assert.ok(cached.includes(guaziImageCacheFile(src(width))));
 assert.deepEqual(guaziPhotoKeys(source),[]);
 const files=await storedGuaziFiles(directory);
 assert.deepEqual(files.map(file=>file.key).sort(),[...keys].sort());
 const wanted=new Set(files.map(file=>file.key));
 const listing={id:'guazi-1',status:'unavailable',last_seen_at:'2026-09-01',images:[image]};
 const owned=new Set(),protectedKeys=new Set();
 recordPhotoOwnership(listing,wanted,owned,protectedKeys);
 assert.equal(owned.size,5);assert.equal(protectedKeys.size,0);
 for(const file of files)assert.equal(await removeUnchangedPhoto(file,file.base),true);
 for(const file of cached){await assert.rejects(fs.stat(file),{code:'ENOENT'});await assert.rejects(fs.stat(file+'.json'),{code:'ENOENT'});}
 assert.equal(await fs.readFile(path.join(directory,'unrelated.jpg'),'utf8'),'keep');
 assert.deepEqual((await fs.readdir(directory)).sort(),['a'.repeat(64)+'.123.tmp','unrelated.jpg'].sort());
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

test('nginx original, JPEG and resized photo copies map to the same owner, while API caches and wrong hashes stay untouched',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nginx-photo-cleanup-'));
 try {
  const urls=['/escimg/auto/600x0_c42_car.jpg.webp','/escimg/auto/1080x0_car.jpg','/photo/escimg/auto/car.jpg.webp'];
  const owner=photoIdentity('https://erscglobal2.autoimg.cn/escimg/auto/1400x0_c42_car.jpg.webp');
  for(const url of urls) {
   const name=createHash('md5').update(url).digest('hex');
   const header=Buffer.from('\0\0\0\nKEY: '+url+'\nHTTP/1.1 200 OK\r\nContent-Type: image/jpeg\r\n\r\nphoto');
   assert.equal(nginxPhotoIdentity(header,name),owner);
   assert.equal(nginxPhotoIdentity(header,'a'.repeat(32)),null);
   await fs.writeFile(path.join(directory,name),header);
  }
  const api='httpsabcars.byGET/api/cars/123';
  await fs.writeFile(path.join(directory,createHash('md5').update(api).digest('hex')),'\0\nKEY: '+api+'\n{}');
  await fs.writeFile(path.join(directory,'b'.repeat(32)),'not a cache file');
  const files=await storedNginxPhotoFiles(directory);
  assert.equal(files.length,3);
  assert.deepEqual(new Set(files.map(file=>file.key)),new Set([owner]));
  for(const file of files) assert.equal(await removeUnchangedPhoto(file,file.base),true);
  assert.equal((await fs.readdir(directory)).length,2);
 } finally { await fs.rm(directory,{recursive:true,force:true}); }
});

test('a reactivated or newly shared photo is excluded by the second ownership read; no unmapped file enters the plan',async()=>{
 const files=[{key},{key:'orphan'}];
 for(const status of ['active','unknown']) {
  let pass=0;
  const read=async wanted=>{
   pass++;
   const owned=new Set(),protectedKeys=new Set();
   recordPhotoOwnership(removed,wanted,owned,protectedKeys);
   if(pass===2) recordPhotoOwnership({...removed,id:'other',status},wanted,owned,protectedKeys);
   return new Set([...owned].filter(key=>!protectedKeys.has(key)));
  };
  assert.deepEqual(await selectPhotoCandidates(files,read,{recheck:true}),[]);
  assert.equal(pass,2);
 }
 let reads=0;
 assert.deepEqual(await selectPhotoCandidates(files,async()=>{reads++;return new Set([key]);}),[files[0]]);
 assert.equal(reads,1);
 await assert.rejects(selectPhotoCandidates(files,async()=>{throw new Error('database unavailable');},{recheck:true}),/database unavailable/);
});

test('a replaced Guazi sidecar or a directory replaced by a symlink cannot delete another file',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'photo-cleanup-races-'));
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'photo-cleanup-outside-'));
 try {
  const cached=path.join(directory,'c'.repeat(64));
  await fs.writeFile(cached,'image');await fs.writeFile(cached+'.json','{}');
  const [entry]=await storedGuaziFiles(directory);
  await fs.writeFile(cached+'.json','replacement');
  assert.equal(await removeUnchangedPhoto(entry,directory),false);
  assert.equal(await fs.readFile(cached,'utf8'),'image');
  const folder=path.join(directory,'photo/escimg/auto'); await fs.mkdir(folder,{recursive:true});
  await fs.writeFile(path.join(folder,'600x0_c42_car.webp'),'image');
  const [photo]=await storedPhotoFiles(directory);
  await fs.rename(folder,path.join(outside,'moved'));
  await fs.symlink(path.join(outside,'moved'),folder);
  assert.equal(await removeUnchangedPhoto(photo,directory),false);
  assert.equal(await fs.readFile(path.join(outside,'moved/600x0_c42_car.webp'),'utf8'),'image');
 } finally { await fs.rm(directory,{recursive:true,force:true});await fs.rm(outside,{recursive:true,force:true}); }
});

test('nginx eviction during unlink is a skipped file rather than an interrupted cleanup',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'photo-cleanup-eviction-'));
 const originalUnlink=fs.unlink;
 try {
  const folder=path.join(directory,'photo/escimg/auto');await fs.mkdir(folder,{recursive:true});
  const file=path.join(folder,'600x0_c42_car.webp');await fs.writeFile(file,'image');
  const [entry]=await storedPhotoFiles(directory);
  fs.unlink=async target=>{
   await originalUnlink(target);
   if(target===file) throw Object.assign(new Error('evicted'),{code:'ENOENT'});
  };
  assert.equal(await removeUnchangedPhoto(entry,directory),false);
 } finally {fs.unlink=originalUnlink;await fs.rm(directory,{recursive:true,force:true});}
});

test('Guazi copies in the shared API cache of either site retain the same owner across browser versions',()=>{
 const source='https://global-image-pub.guazistatic-global.com/a.jpg?x-bce-process=image/format,f_jpg';
 const expected='guazi:'+path.basename(guaziImageCacheFile(source));
 for(const host of ['abcars.by','www.abcars.by','abdrive.ru','www.abdrive.ru']) {
  for(const suffix of ['','|catalog-guard-v1']) {
   const key='https'+host+'GET/api/image?src='+encodeURIComponent(source)+'&v=20260910-1'+suffix;
   assert.equal(nginxPhotoIdentity(Buffer.from('\0\nKEY: '+key+'\n'),createHash('md5').update(key).digest('hex')),expected);
  }
 }
 for(const key of ['httpsabcars.byGET/api/image?src=https%3A%2F%2Fevil.test%2Fa.jpg','httpsabcars.byGET/api/cars/1','httpsother.testGET/api/image?src='+encodeURIComponent(source)]) {
  assert.equal(nginxPhotoIdentity(Buffer.from('\0\nKEY: '+key+'\n'),createHash('md5').update(key).digest('hex')),null);
 }
});

test('Guazi caches in current and older release folders are included once, without following symlinks',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'photo-cache-roots-'));
 try {
  const primary=path.join(directory,'primary'),releases=path.join(directory,'releases');
  const old=path.join(releases,'old/runtime/guazi-image-cache'),current=path.join(releases,'current/runtime/guazi-image-cache');
  for(const root of [primary,old,current]) await fs.mkdir(root,{recursive:true});
  await fs.symlink(primary,path.join(releases,'linked'));
  const result=await guaziCacheDirectories(primary,{releaseDirectory:releases,extra:[primary]});
  assert.deepEqual(result.sort(),(await Promise.all([primary,old,current].map(root=>fs.realpath(root)))).sort());
 } finally {await fs.rm(directory,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {catalogPhotoPaths,storeCatalogPhoto} from '../scripts/lib/catalog-photo-store.mjs';
const images=Array.from({length:8},(_,i)=>`https://erscglobal2.autoimg.cn/escimg/auto/1400x0_c42_${i}.webp`);
const webp=Buffer.from('RIFF0000WEBPtest');
test('сохраняются первые пять кадров в единственном размере каталога 600px без оригиналов',()=>{
 const urls=catalogPhotoPaths({images},{previewCount:5});assert.equal(urls.length,5);assert.ok(urls.every(u=>/\/600x0_c42_/.test(u)));assert.ok(!urls.some(u=>u.includes('_5.webp')));
 assert.deepEqual(catalogPhotoPaths({images:['https://example.com/a.webp']}),[]);
});
test('атомарная постоянная копия: повтор не требует сети, ошибочный ответ не становится файлом',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'photos-'));let calls=0;
 try{
  const href=catalogPhotoPaths({images})[0];
  const options={directory,minFreeBytes:0,fetcher:async()=>{calls++;return new Response(webp,{headers:{'content-type':'image/webp'}})}};
  assert.equal((await storeCatalogPhoto(href,options)).stored,true);
  assert.deepEqual(await fs.readFile(path.join(directory,href)),webp);
  assert.equal((await storeCatalogPhoto(href,options)).stored,false);assert.equal(calls,1);
  await assert.rejects(storeCatalogPhoto('/photo/escimg/bad.webp',{...options,fetcher:async()=>new Response('not a photo',{headers:{'content-type':'image/webp'}})}));
  await assert.rejects(fs.stat(path.join(directory,'photo/escimg/bad.webp')),{code:'ENOENT'});
  await assert.rejects(storeCatalogPhoto('/photo/escimg/../../escape.webp',options));
  await assert.rejects(storeCatalogPhoto('/photo/escimg/no-space.webp',{...options,minFreeBytes:Number.MAX_SAFE_INTEGER}),{code:'PHOTO_DISK_FULL'});
 }finally{await fs.rm(directory,{recursive:true,force:true})}
});

test('весь каталог получает только обложку; пять кадров — только явный приоритет',()=>{
 assert.equal(catalogPhotoPaths({images}).length,1);
 assert.equal(catalogPhotoPaths({images},{previewCount:900}).length,1);
 assert.deepEqual(catalogPhotoPaths({images:[],image:images[0]}),catalogPhotoPaths({images}));
 assert.equal(catalogPhotoPaths({images},{previewCount:5}).length,5);
});

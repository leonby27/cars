import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {catalogPhotoPaths,storeCatalogPhoto} from '../scripts/lib/catalog-photo-store.mjs';
import {galleryPhotoPaths} from '../scripts/lib/gallery-photo-store.mjs';
import {guaziImageCacheFile} from '../server/guazi-image-key.mjs';
const images=Array.from({length:8},(_,i)=>`https://erscglobal2.autoimg.cn/escimg/auto/1400x0_c42_${i}.webp`);
const webp=Buffer.from('RIFF0000WEBPtest');
test('Encar: старые ошибочные копии не мешают сохранить новые размеры',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'encar-store-'));
 try{
  const image='https://ci.encar.com/carpicture06/pic4266/42664100_001.jpg';
  const paths=galleryPhotoPaths({images:[image]});
  assert.deepEqual(paths,[600,1920].map(width=>`/photo/encar/v2/w${width}/carpicture06/pic4266/42664100_001.jpg`));
  assert.deepEqual(catalogPhotoPaths({image}),[paths[0]]);
  const old=path.join(directory,paths[1].replace('/v2/','/'));
  await fs.mkdir(path.dirname(old),{recursive:true});await fs.writeFile(old,'old small image');
  const jpeg=Buffer.from([255,216,255,217]);let calls=0;
  const options={directory,minFreeBytes:0,fetcher:async url=>{
   calls++;assert.equal(url.pathname,paths[1]);
   return new Response(jpeg,{headers:{'content-type':'image/jpeg'}});
  }};
  assert.equal((await storeCatalogPhoto(paths[1],options)).stored,true);
  assert.equal((await storeCatalogPhoto(paths[1],options)).stored,false);
  assert.equal(calls,1);
  assert.deepEqual(await fs.readFile(path.join(directory,paths[1])),jpeg);
  assert.equal(await fs.readFile(old,'utf8'),'old small image');
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
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

test('Guazi: пять превью 600 через сайт, копию хранит сам сайт; без копии кадр не засчитан',async t=>{
 const guazi=Array.from({length:7},(_,i)=>`https://global-image-pub.guazistatic-global.com/${i}.jpg?x-bce-process=image/format,f_jpg`);
 const urls=catalogPhotoPaths({images:guazi},{previewCount:5});
 assert.equal(urls.length,5);
 assert.ok(urls.every(u=>u.startsWith('/api/image?src=')&&decodeURIComponent(u).includes('w_600/format,f_webp')));
 const gallery=galleryPhotoPaths({images:guazi.slice(0,2)});
 assert.equal(gallery.length,4);
 assert.ok(gallery.some(u=>decodeURIComponent(u).endsWith('format,f_jpg')));
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'guazi-photos-'));
 const previous=process.env.GUAZI_IMAGE_CACHE_DIR;process.env.GUAZI_IMAGE_CACHE_DIR=directory;
 t.after(async()=>{if(previous===undefined)delete process.env.GUAZI_IMAGE_CACHE_DIR;else process.env.GUAZI_IMAGE_CACHE_DIR=previous;await fs.rm(directory,{recursive:true,force:true});});
 const href=urls[0],file=guaziImageCacheFile(new URLSearchParams(href.split('?')[1]).get('src'));
 let calls=0,writes=true;
 const fetcher=async url=>{calls++;assert.equal(url.pathname,'/api/image');if(writes)await fs.writeFile(file,webp);return new Response(webp,{headers:{'content-type':'image/webp'}});};
 const options={directory,minFreeBytes:0,fetcher};
 writes=false;await assert.rejects(storeCatalogPhoto(href,options),/not stored/);
 writes=true;assert.deepEqual(await storeCatalogPhoto(href,options),{stored:true,bytes:webp.length});
 assert.equal((await storeCatalogPhoto(href,options)).stored,false);assert.equal(calls,2);
 await assert.rejects(storeCatalogPhoto(urls[1],{...options,minFreeBytes:Number.MAX_SAFE_INTEGER}),{code:'PHOTO_DISK_FULL'});
 const odd='/api/image?src='+encodeURIComponent('https://global-image-pub.guazistatic-global.com/0.jpg?x-bce-process=image/resize,w_50');
 await assert.rejects(storeCatalogPhoto(odd,options),/Invalid photo path/);
 await assert.rejects(storeCatalogPhoto('/api/image?src='+encodeURIComponent('https://example.com/a.jpg'),options),/Invalid photo path/);
});

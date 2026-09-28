import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {handleApiRequest} from '../server/handler.mjs';

test('global-image1 goes through the image API and persistent cache; unsafe URLs never fetch', async t => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'guazi-image-api-'));
 const previous=process.env.GUAZI_IMAGE_CACHE_DIR, originalFetch=globalThis.fetch;
 process.env.GUAZI_IMAGE_CACHE_DIR=dir;
 t.after(async()=>{globalThis.fetch=originalFetch;if(previous===undefined)delete process.env.GUAZI_IMAGE_CACHE_DIR;else process.env.GUAZI_IMAGE_CACHE_DIR=previous;await fs.rm(dir,{recursive:true,force:true});});
 const source='https://global-image1.guazistatic-global.com/test.jpg?imageMogr2/format/jpg';
 const bytes=Buffer.from([255,216,255,0,255,217]);let calls=0;
 globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,source);assert.equal(options.redirect,'manual');return new Response(bytes,{headers:{'content-type':'image/jpeg'}});};
 const request=async src=>{
  let status,body;
  const response={req:{headers:{}},writeHead(code){status=code;return this;},end(chunk){body=chunk;return this;}};
  await handleApiRequest({method:'GET',url:'/api/image?src='+encodeURIComponent(src),headers:{host:'example.test'}},response);
  return{status,body};
 };
 for(let i=0;i<2;i++){const r=await request(source);assert.equal(r.status,200);assert.deepEqual(r.body,bytes);}
 assert.equal(calls,1);
 for(const bad of [source.replace('.com/','.com.evil.test/'),source.replace('https:','http:'),source.replace('.com/','.com:444/'),source.replace('https://','https://user:pass@')])assert.equal((await request(bad)).status,403);
 assert.equal(calls,1);
});

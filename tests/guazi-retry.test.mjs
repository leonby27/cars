import test from 'node:test';
import assert from 'node:assert/strict';
import {withGuaziRetries,isTransientGuaziError} from '../scripts/lib/guazi-retry.mjs';
import fs from 'node:fs/promises';
import {cachedGuaziImage} from '../server/guazi-image-cache.mjs';
test('temporary reset is retried with backoff, then returns the actual successful result',async()=>{
 let calls=0;const delays=[],events=[];const result=await withGuaziRetries(async()=>{if(++calls<3)throw Error('apiRequestContext.get: read ECONNRESET\nprivate request log');return{id:'actual'};},{wait:async ms=>delays.push(ms),onRetry:async e=>events.push(e)});assert.deepEqual(result,{id:'actual'});assert.equal(calls,3);assert.deepEqual(delays,[2000,4000]);assert.equal(events.length,2);assert.ok(events.every(e=>!e.message.includes('private')));
});
test('photo timeout is retried and a valid image is cached; access and malformed images are not transient',async t=>{
 const dir=await fs.mkdtemp(new URL('../runtime/guazi-photo-retry-test-',import.meta.url));
 const previous=process.env.GUAZI_IMAGE_CACHE_DIR;process.env.GUAZI_IMAGE_CACHE_DIR=dir;
 t.after(async()=>{if(previous===undefined)delete process.env.GUAZI_IMAGE_CACHE_DIR;else process.env.GUAZI_IMAGE_CACHE_DIR=previous;await fs.rm(dir,{recursive:true,force:true});});
 let calls=0;const options={fetchImpl:async()=>{if(++calls===1)throw new DOMException('The operation was aborted due to timeout','TimeoutError');return new Response(new Uint8Array([255,216,255,0]),{headers:{'content-type':'image/jpeg'}});}};
 const url='https://global-image-pub.guazistatic-global.com/retry-test.jpg';
 const image=await withGuaziRetries(()=>cachedGuaziImage(url,options),{wait:async()=>{}});
 assert.equal(image.contentType,'image/jpeg');assert.equal(calls,2);
 assert.equal((await cachedGuaziImage(url,options)).cached,true);assert.equal(calls,2);
 assert.equal(isTransientGuaziError(new TypeError('fetch failed',{cause:Object.assign(Error('reset'),{code:'ECONNRESET'})})),true);
 for(const error of [Error('HTTP 403'),Error('HTTP 429'),Error('Response is not a supported image (MIME/signature)')])assert.equal(isTransientGuaziError(error),false);
});
test('transport reconnect is bounded and never retries an application-level collector failure',async()=>{
 let calls=0;const delays=[];const policy={baseDelayMs:5000,isRetryable:e=>e.code==='COLLECTOR_TRANSPORT_DISCONNECTED',wait:async ms=>delays.push(ms)};
 await assert.rejects(withGuaziRetries(async()=>{calls++;throw Object.assign(Error('Collector exited 255'),{code:'COLLECTOR_TRANSPORT_DISCONNECTED'});},policy),/255/);
 assert.equal(calls,3);assert.deepEqual(delays,[5000,10000]);
 calls=0;await assert.rejects(withGuaziRetries(async()=>{calls++;throw Object.assign(Error('Collector exited 1'),{code:'COLLECTOR_FAILED'});},policy),/exited 1/);assert.equal(calls,1);
});
test('persistent network failure stops after three attempts; protection and data errors are not retried',async()=>{
 let calls=0;await assert.rejects(withGuaziRetries(async()=>{calls++;throw Error('List HTTP 503');},{wait:async()=>{}}),/503/);assert.equal(calls,3);
 for(const error of [Object.assign(Error('HTTP 503'),{code:'SOURCE_BLOCKED'}),Error('Card HTTP 404'),Error('No complete rawData'),Error('Guazi ignored registration subdivision')]){calls=0;await assert.rejects(withGuaziRetries(async()=>{calls++;throw error;},{wait:async()=>{}}));assert.equal(calls,1);}
 assert.equal(isTransientGuaziError(Error('apiRequestContext.get: Timeout 25000ms exceeded')),true);
});

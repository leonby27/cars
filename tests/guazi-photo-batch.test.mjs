import test from 'node:test';
import assert from 'node:assert/strict';
import {warmPhotoBatch} from '../scripts/lib/guazi-photo-batch.mjs';

test('shared photo pool advances another car while one image is slow, fetches only first two and respects concurrency',async()=>{
 let release,secondDone;const slow=new Promise(r=>release=r),second=new Promise(r=>secondDone=r);
 let active=0,maxActive=0;const fetched=[],done=[];
 const run=warmPhotoBatch(['a','b'],{concurrency:2,checkDisk:async()=>{},readCar:async id=>({id,images:[id+'1',id+'2',id+'3',id+'4']}),
  download:async url=>{active++;maxActive=Math.max(maxActive,active);fetched.push(url);if(url==='a1')await slow;active--;},
  onComplete:async name=>{done.push(name);if(name==='b')secondDone();},onError:async()=>{throw Error('Unexpected failure');}});
 let timer;
 try{await Promise.race([second,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Second car stalled behind first')),2000))]);assert.deepEqual(done,['b']);assert.equal(active,1);}
 finally{clearTimeout(timer);release();await run;}
 assert.deepEqual(fetched.sort(),['a1','a2','b1','b2']);assert.equal(maxActive,2);assert.equal(active,0);assert.deepEqual(done,['b','a']);
});

test('a failed image does not mark its car complete; in-flight work settles before batch fails and later cars stay queued',async()=>{
 let active=0;const done=[],errors=[],started=[];
 await assert.rejects(warmPhotoBatch(['a','b','c','d'],{concurrency:2,checkDisk:async()=>{},readCar:async id=>({id,images:[id+'1',id+'2']}),
  download:async url=>{started.push(url);active++;try{if(url==='a1')throw Error('HTTP 429');await new Promise(r=>setTimeout(r,10));}finally{active--;}},
  onError:async(e,car)=>errors.push(car.id),onComplete:async name=>done.push(name)}),/429/);
 assert.equal(active,0);assert.ok(!done.includes('a'));assert.deepEqual(errors,['a']);assert.ok(started.every(x=>x.startsWith('a')));
});

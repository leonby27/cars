import test from 'node:test';
import assert from 'node:assert/strict';
import {createInputAwareCache} from '../server/input-aware-cache.mjs';

test('an unchanged market snapshot does not rebuild with time',async()=>{
 let time=10_000,loads=0;
 const cache=createInputAwareCache(async revision=>({inputRevision:revision.key,value:++loads}),{
  readRevision:async()=>({key:'catalog-a',changedAt:0}),now:()=>time,checkEvery:1000,
 });
 assert.equal((await cache()).value,1);
 time+=86400_000;await cache();await new Promise(setImmediate);
 assert.equal(loads,1);
});

test('one changed catalog revision refreshes the aggregate, retaining the last result',async()=>{
 let time=10_000,revision={key:'a',changedAt:0},loads=0,finish;
 const cache=createInputAwareCache(async input=>{
  loads++;if(loads===2)await new Promise(resolve=>{finish=resolve;});
  return {inputRevision:input.key,value:loads};
 },{readRevision:async()=>revision,now:()=>time,checkEvery:1000,quietFor:5000});
 await cache();revision={key:'b',changedAt:time};
 time+=1000;await cache();await new Promise(setImmediate);assert.equal(loads,1);
 time+=5000;await cache();await new Promise(setImmediate);
 assert.equal(loads,2);assert.equal((await cache()).value,1);
 finish();await new Promise(setImmediate);
 assert.equal((await cache()).value,2);
});

test('explicit invalidation discards even an in-flight old snapshot',async()=>{
 let revision='a',finish,loads=0;
 const cache=createInputAwareCache(async input=>{
  loads++;if(loads===1)await new Promise(resolve=>{finish=resolve;});
  return {inputRevision:input.key};
 },{readRevision:async()=>({key:revision,changedAt:0})});
 const old=cache();await new Promise(setImmediate);
 revision='b';cache.invalidate();finish();await old;
 assert.equal((await cache()).inputRevision,'b');assert.equal(loads,2);
});

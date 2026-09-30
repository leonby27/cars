import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncCache } from '../server/async-cache.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
const flush = () => new Promise(resolve=>setImmediate(resolve));

test('cold concurrent requests share one calculation and retry after failure', async () => {
  let calls=0;const first=deferred();
  const get=createAsyncCache(()=>{calls++; return calls===1?first.promise:42;});
  const a=get(), b=get(); await flush();assert.equal(calls,1);
  first.reject(new Error('offline'));
  const results=await Promise.allSettled([a,b]);assert.ok(results.every(r=>r.status==='rejected'));
  assert.equal(await get(),42);assert.equal(calls,2);
});

test('build snapshot is immediate; stale requests refresh once and preserve last success', async () => {
  let clock=100, calls=0;const refresh=deferred(), errors=[];
  const get=createAsyncCache(()=>{calls++;return refresh.promise;},{initial:1,initialAt:100,ttl:10,now:()=>clock,onError:e=>errors.push(e)});
  assert.equal(await get(),1);assert.equal(calls,0);
  clock=111;assert.equal(await get(),1);assert.equal(await get(),1);await flush();assert.equal(calls,1);
  refresh.resolve(2);await flush();assert.equal(await get(),2);
  assert.equal(errors.length,0);
});

test('background refresh failure does not remove the usable snapshot or loop immediately', async () => {
  let calls=0,clock=100;const errors=[];
  const get=createAsyncCache(()=>{calls++;throw new Error('offline');},{initial:7,ttl:10,now:()=>clock,onError:e=>errors.push(e)});
  assert.equal(await get(),7);await flush();assert.equal(errors.length,1);
  for(let i=0;i<10;i++)assert.equal(await get(),7);
  assert.equal(calls,1);
  clock+=30001;assert.equal(await get(),7);await flush();assert.equal(calls,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedCache} from '../server/bounded-cache.mjs';

test('concurrent readers share a load; hard expiry and forced reads see new data',async()=>{
 let clock=0,loads=0;
 const cache=createBoundedCache({now:()=>clock,ttl:100});
 const load=async()=>++loads;
 assert.deepEqual(await Promise.all([cache('a',load),cache('a',load)]),[1,1]);
 clock=99;assert.equal(await cache('a',load),1);
 clock=100;assert.equal(await cache('a',load),2);
 assert.equal(await cache('a',load,{bypass:true}),3);
 assert.equal(await cache('a',load),3);
});

test('LRU and byte caps bound unique-card crawling, including oversized cards',async()=>{
 const cache=createBoundedCache({maxEntries:2,maxBytes:20});let loads=0;
 const read=(key,value=key)=>cache(key,async()=>{loads++;return value;});
 await read('a');await read('b');await read('a');await read('c');
 assert.equal(loads,3);await read('b');assert.equal(loads,4);
 await read('large','x'.repeat(30));await read('large','x'.repeat(30));
 assert.equal(loads,6);
});

test('missing listings expire quickly and failures are retried',async()=>{
 let clock=0,loads=0;
 const cache=createBoundedCache({now:()=>clock,negativeTtl:5});
 const missing=()=>{loads++;return null;};
 await cache('a',missing);clock=4;await cache('a',missing);assert.equal(loads,1);
 clock=5;await cache('a',missing);assert.equal(loads,2);
 await assert.rejects(cache('fail',()=>{throw new Error('offline');}),/offline/);
 assert.equal(await cache('fail',()=>42),42);
});

test('a changed price generation clears data and old in-flight reads cannot overwrite it',async()=>{
 const cache=createBoundedCache();let finish;
 const old=cache('a',()=>new Promise(resolve=>{finish=resolve;}),{version:'old'});
 await new Promise(setImmediate);
 assert.equal(await cache('a',()=>2,{version:'new'}),2);
 finish(1);assert.equal(await old,1);
 assert.equal(await cache('a',()=>3,{version:'new'}),2);
});

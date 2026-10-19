import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {EncarClient} from '../scripts/lib/encar-client.mjs';
import {encarPublicDetail} from '../scripts/lib/encar-parser.mjs';

const sample=JSON.parse(readFileSync(new URL('./fixtures/encar-samples.json',import.meta.url))).samples[0];
const soldState=(id,{vehicleId=id,dummyVehicleId=null,status='SOLD',adStatus='soldOut'}={})=>({cars:{base:{vehicleId,queryCarId:id,manage:{dummyVehicleId},advertisement:{status}},detailFlags:{adStatus}}});
const page=state=>`<html><script>__PRELOADED_STATE__ = ${JSON.stringify(state)};</script></html>`;
const response=(status,body='',headers={})=>({status,headers,text:async()=>typeof body==='string'?body:JSON.stringify(body)});

test('real HTTP 407 is preserved by the default transport instead of becoming fetch failed',async t=>{
  const server=createServer((req,res)=>{res.writeHead(407,{'content-length':'0'});res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const client=new EncarClient({pace:0,attempts:1});
  assert.equal((await client.json(`http://127.0.0.1:${server.address().port}/`)).status,407);
});

test('public sold proof requires exact normal/dummy identity and both explicit sold states',()=>{
  assert.ok(encarPublicDetail(page(soldState('42678146',{vehicleId:42664723,dummyVehicleId:42678146})),'42678146'));
  assert.ok(encarPublicDetail(page(soldState(42805585)),'42805585'));
  for(const state of [soldState('wrong'),soldState('123',{vehicleId:'other'}),soldState('123',{status:'ADVERTISE'}),soldState('123',{adStatus:'normal'}),{cars:{base:{advertisement:{status:'SOLD'}}}}]){
    assert.equal(encarPublicDetail(page(state),'123'),null);
  }
  for(const html of ['sold or deleted','<script>__PRELOADED_STATE__ = {invalid};</script>','<script>__PRELOADED_STATE__ = (() => {throw Error("executed")})();</script>']) assert.equal(encarPublicDetail(html,'123'),null);
});

test('API 407 with matching public SOLD completes without requesting history',async()=>{
  const calls=[];
  const client=new EncarClient({pace:0,fetcher:async url=>{
    calls.push(url);
    return url.startsWith('https://api.encar.com/')?response(407):response(200,page(soldState('42678146',{vehicleId:42664723,dummyVehicleId:42678146})));
  }});
  const result=await client.car('42678146');
  assert.equal(result.status,200);
  assert.equal(result.detail.advertisement.status,'SOLD');
  assert.equal(result.car,null);
  assert.equal(result.availabilitySource,'public-sold');
  assert.equal(calls.length,2);
});

test('blocked, active, malformed and wrong-id pages never turn HTTP 407 into a sale',async()=>{
  for(const publicResponse of [response(302,'',{'location':'/client-verification/blocked'}),response(200,page(soldState('123',{status:'ADVERTISE'}))),response(200,'<html>verification</html>'),response(200,page(soldState('other')))]){
    let calls=0;
    const client=new EncarClient({pace:0,fetcher:async()=>++calls%2?response(407):publicResponse});
    const result=await client.car('123');
    assert.equal(result.status,407);
    assert.equal(result.detail,null);
    assert.equal(result.car,null);
    assert.equal(result.error.code,'ENCAR_UNVERIFIED_STATUS');
    assert.equal(calls,2,'verification redirects are not followed');
  }
});

test('persistent unverified 407 stops all subsequent requests with the actual HTTP status',async()=>{
  let calls=0;
  const client=new EncarClient({pace:0,fetcher:async()=>++calls%2?response(407):response(200,'verification')});
  for(let i=0;i<14;i++)assert.equal((await client.car(String(i))).status,407);
  await assert.rejects(client.car('14'),e=>e.code==='ENCAR_UNAVAILABLE'&&e.status===407);
  await assert.rejects(client.car('15'),e=>e.code==='ENCAR_UNAVAILABLE'&&e.status===407);
  assert.equal(calls,30);
});

test('401/403 stop the source and cannot be mistaken for a missing listing',async()=>{
  for(const status of [401,403]){
    const client=new EncarClient({pace:0,fetcher:async()=>response(status)});
    await assert.rejects(client.car('1'),e=>e.code==='ENCAR_UNAVAILABLE'&&e.status===status);
    await assert.rejects(client.car('2'),e=>e.status===status);
    assert.equal(client.requests,1);
  }
});

test('sold API details need no history; failed optional requests cannot overwrite a live car with empty history',async()=>{
  const sold=new EncarClient({pace:0,fetcher:async()=>response(200,{vehicleId:'123',advertisement:{status:'SOLD'}})});
  assert.equal((await sold.car('123')).detail.advertisement.status,'SOLD');
  assert.equal(sold.requests,1);
  for(const optionalStatus of [0,403,407,503]){
    const client=new EncarClient({pace:0,attempts:1,fetcher:async url=>{
      if(url.includes('/v1/readside/vehicle/'))return response(200,sample.detail);
      if(url.includes('/record/')){
        if(!optionalStatus)throw Object.assign(Error('connection reset'),{code:'ECONNRESET'});
        return response(optionalStatus);
      }
      return response(200,{});
    }});
    const result=await client.car(String(sample.listItem.Id));
    assert.equal(result.status,optionalStatus);
    assert.equal(result.car,null);
    assert.equal(result.detail,null);
  }
});

test('429 honors Retry-After and uses a slower fallback; HTTP 408 retries too',async()=>{
  for(const [status,headers,expected]of [[429,{'retry-after':'7'},7000],[429,{},30000],[408,{},1500]]){
    const waits=[];let calls=0;
    const client=new EncarClient({pace:0,wait:async ms=>waits.push(ms),fetcher:async()=>++calls===1?response(status,'',headers):response(200,{ok:true})});
    assert.equal((await client.json('test')).status,200);
    assert.deepEqual(waits,[expected]);
  }
  const waits=[];let calls=0;
  const client=new EncarClient({pace:0,wait:async ms=>waits.push(ms),fetcher:async()=>++calls===1?response(429,'',{'retry-after':new Date(Date.now()+10000).toUTCString()}):response(200,{ok:true})});
  assert.equal((await client.json('test')).status,200);
  assert.ok(waits[0]>=8500&&waits[0]<=10000);
});

test('a long Retry-After stops the shared source even on the final attempt',async()=>{
  const client=new EncarClient({pace:0,attempts:1,fetcher:async()=>response(429,'',{'retry-after':'600'})});
  await assert.rejects(client.json('test'),e=>e.code==='ENCAR_UNAVAILABLE'&&e.status===429);
  await assert.rejects(client.json('test'),e=>e.status===429);
  assert.equal(client.requests,1);
});

test('geographic and HTML error pages cannot turn a live advertisement into a sale',async()=>{
  for(const html of ['<html>has_been_cr_blocked_AWS.html</html>','<!doctype html><html>verification required</html>']){
    const client=new EncarClient({pace:0,fetcher:async()=>response(404,html)});
    await assert.rejects(client.car('123'),e=>['ENCAR_GEO_BLOCKED','ENCAR_UNAVAILABLE'].includes(e.code));
  }
});

test('healthy detail/inspection requests do not mask a persistent optional-history outage',async()=>{
  const client=new EncarClient({pace:0,attempts:1,fetcher:async url=>url.includes('/v1/readside/vehicle/')?response(200,sample.detail):url.includes('/record/')?response(503):response(200,{})});
  for(let i=0;i<14;i++)assert.equal((await client.car(String(sample.listItem.Id))).status,503);
  await assert.rejects(client.car(String(sample.listItem.Id)),e=>e.code==='ENCAR_UNAVAILABLE'&&e.status===503);
});

test('malformed optional JSON is a parse failure rather than a successful policy omission',async()=>{
  const client=new EncarClient({pace:0,attempts:1,fetcher:async url=>url.includes('/v1/readside/vehicle/')?response(200,sample.detail):response(200,'<html>upstream unavailable</html>')});
  await assert.rejects(client.car(String(sample.listItem.Id)),e=>e.stage==='parse'&&e.code==='ENCAR_INVALID_JSON');
});

test('a public active card is checked as active when list access and API missing responses are unreliable',async()=>{
  const id=String(sample.detail.vehicleId);
  const state={cars:{base:{...sample.detail,queryCarId:id},detailFlags:{adStatus:'advertise'}}};
  const client=new EncarClient({pace:0,fetcher:async url=>url.startsWith('https://fem.encar.com/')?response(200,page(state)):response(404)});
  client.modelGroups=async()=>{throw Object.assign(Error('list HTTP 407'),{status:407});};
  await client.verifyAccess({brands:['Hyundai'],yearFrom:2020,sampleId:id});
  const result=await client.car(id,{usdPerKrw:0.0007,history:false});
  assert.equal(result.status,200);
  assert.equal(result.detail.advertisement.status,'ADVERTISE');
  assert.ok(result.car);
  assert.equal(result.availabilitySource,'public-detail');
});

test('an unverified public page cannot validate an API 404 during an API access problem',async()=>{
  let valid=true;
  const client=new EncarClient({pace:0,fetcher:async url=>url.startsWith('https://fem.encar.com/')?response(200,valid?page(soldState('123')):'verification'):response(404)});
  client.modelGroups=async()=>{throw Object.assign(Error('list HTTP 407'),{status:407});};
  await client.verifyAccess({brands:['Hyundai'],yearFrom:2020,sampleId:'123'});
  valid=false;
  const result=await client.car('123');
  assert.equal(result.status,404);
  assert.equal(result.detail,null);
  assert.equal(result.error.code,'ENCAR_UNVERIFIED_STATUS');
  assert.equal(client.failedCards,1);
});

test('repeated schema failures stop the shared source while remaining parse failures',async()=>{
  const client=new EncarClient({pace:0,attempts:1,fetcher:async()=>response(200,'<html>wrong schema</html>')});
  for(let i=0;i<14;i++)await assert.rejects(client.car('123'),e=>e.stage==='parse'&&e.code==='ENCAR_INVALID_JSON');
  await assert.rejects(client.car('123'),e=>e.stage==='parse'&&e.code==='ENCAR_UNAVAILABLE'&&e.status===200);
  await assert.rejects(client.car('123'),e=>e.code==='ENCAR_UNAVAILABLE');
  assert.equal(client.requests,15);
});

test('parallel workers share the existing request pace instead of starting a burst',async()=>{
  const starts=[];
  const client=new EncarClient({pace:25,fetcher:async()=>{starts.push(Date.now());return response(200,{});}});
  await Promise.all([client.json('one'),client.json('two'),client.json('three')]);
  assert.equal(starts.length,3);
  assert.ok(starts[1]-starts[0]>=19);
  assert.ok(starts[2]-starts[1]>=19);
});

test('optional API 404 during an API access problem cannot erase previously saved history',async()=>{
  const id=String(sample.detail.vehicleId);
  const state={cars:{base:{...sample.detail,queryCarId:id},detailFlags:{adStatus:'advertise'}}};
  const client=new EncarClient({pace:0,fetcher:async url=>url.startsWith('https://fem.encar.com/')?response(200,page(state)):url.includes('/v1/readside/vehicle/')?response(200,sample.detail):response(404)});
  client.modelGroups=async()=>{throw Object.assign(Error('list HTTP 407'),{status:407});};
  await client.verifyAccess({brands:['Hyundai'],yearFrom:2020,sampleId:id});
  const result=await client.car(id);
  assert.equal(result.status,404);
  assert.ok(result.error);
  assert.equal(result.car,null);
  assert.equal(result.detail,null);
});

test('an incomplete active payload is not classified as a policy exclusion or a sale',async()=>{
  for(const field of ['photos','category']){
    const detail=structuredClone(sample.detail);
    delete detail[field];
    const client=new EncarClient({pace:0,fetcher:async()=>response(200,detail)});
    await assert.rejects(client.car(String(sample.listItem.Id),{history:false}),e=>e.stage==='parse'&&e.code==='ENCAR_INVALID_DETAIL');
  }
});

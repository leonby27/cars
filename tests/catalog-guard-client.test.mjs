import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../deploy/catalog-guard-client.js',import.meta.url),'utf8');
function browser(path='/catalog/zeekr?sort=price_asc#cars') {
  const responses=[],navigations=[];
  let calls=0;
  const current=new URL(path,'https://fixture.test');
  const location={href:current.href,origin:current.origin,pathname:current.pathname,search:current.search,hash:current.hash,replace(url){navigations.push(url)}};
  const window={fetch:async()=>{calls++;return await (responses.shift() || new Response('{}',{status:200}))}};
  const scope={window,location,Request,Response,Headers,URL,DOMException,document:{createElement(){throw new Error('Verification must not create a dialog or iframe')}}};
  vm.runInNewContext(source,scope);
  const denied=()=>new Response('{}',{status:429,headers:{'X-Catalog-Verification':'/_catalog-check'}});
  return {window,responses,navigations,denied,scope,get calls(){return calls}};
}

test('ordinary responses, forms and unmarked rate limits do not navigate',async()=>{
  const b=browser();assert.equal((await b.window.fetch('/api/cars')).status,200);
  b.responses.push(b.denied());assert.equal((await b.window.fetch('/api/lead',{method:'POST'})).status,429);
  b.responses.push(new Response('{}',{status:429}));assert.equal((await b.window.fetch('/api/cars')).status,429);
  assert.deepEqual(b.navigations,[]);
});
test('marked same-origin GET replaces the page and preserves its route, filters and fragment',async()=>{
  const b=browser();b.responses.push(b.denied());
  assert.equal((await b.window.fetch('/api/cars?offset=100')).status,429);
  assert.deepEqual(b.navigations,['/_catalog-check?return='+encodeURIComponent('/catalog/zeekr?sort=price_asc#cars')]);
  assert.equal(b.calls,1,'no background retry or alternate access after refusal');
});
test('concurrent refusals share one full-page navigation without retrying catalog reads',async()=>{
  const b=browser('/?q=Zeekr');b.responses.push(b.denied(),b.denied());
  await Promise.all([b.window.fetch('/api/cars?offset=100'),b.window.fetch('/api/cars?offset=200')]);
  assert.deepEqual(b.navigations,['/_catalog-check?return='+encodeURIComponent('/?q=Zeekr')]);
  assert.equal(b.calls,2);
});
test('a third-party marked response cannot redirect the current page',async()=>{
  const b=browser();b.responses.push(b.denied());
  await b.window.fetch('https://other.test/api/cars');
  assert.deepEqual(b.navigations,[]);
});
test('an abandoned read cannot redirect after the visitor has navigated elsewhere',async()=>{
  const b=browser(),controller=new AbortController();let reply;
  b.responses.push(new Promise(resolve=>{reply=resolve}));
  const pending=b.window.fetch('/api/cars',{signal:controller.signal});
  controller.abort();reply(b.denied());
  await assert.rejects(pending,{name:'AbortError'});
  assert.deepEqual(b.navigations,[]);
});
test('Request method and abort signal are respected and installation stays idempotent',async()=>{
  const b=browser();const installed=b.window.fetch;vm.runInNewContext(source,b.scope);
  assert.equal(b.window.fetch,installed);
  b.responses.push(b.denied());await b.window.fetch(new Request('https://fixture.test/api/lead',{method:'POST'}));
  assert.deepEqual(b.navigations,[]);
  const controller=new AbortController();controller.abort();b.responses.push(b.denied());
  await assert.rejects(b.window.fetch(new Request('https://fixture.test/api/cars',{signal:controller.signal})),{name:'AbortError'});
  assert.deepEqual(b.navigations,[]);
});

test('denied background reads do not interrupt private forms or grant catalog data',async()=>{
  for (const path of ['/login','/register','/account','/orders/42','/partners/login']) {
    const b=browser(path);b.responses.push(b.denied());
    assert.equal((await b.window.fetch('/api/cars')).status,429);
    assert.deepEqual(b.navigations,[]);
    assert.equal(b.calls,1);
  }
});

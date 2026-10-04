import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../deploy/catalog-guard-client.js',import.meta.url),'utf8');
function browser() {
 const events=new Map(),children=[],responses=[];
 let calls=0,focus=0;
 function element(tag) {
  return {tag,style:{},children:[],listeners:{},contentWindow:{},setAttribute(){},append(...nodes){this.children.push(...nodes)},addEventListener(name,callback){this.listeners[name]=callback},showModal(){},remove(){children.splice(children.indexOf(this),1)}};
 }
 const draft={value:'Сохранённый текст заявки',focus(){focus++}};
 const document={body:{append(node){children.push(node)}},activeElement:draft,createElement:element};
 const window={fetch:async()=>{calls++;return responses.shift() || new Response('{}',{status:200})},addEventListener(name,callback){events.set(name,callback)},removeEventListener(name){events.delete(name)}};
 const location={origin:'https://fixture.test'};
 vm.runInNewContext(source,{window,document,location,Request,Response,Headers,Promise,DOMException});
 const denied=()=>new Response('{}',{status:429,headers:{'X-Catalog-Verification':'/_catalog-check'}});
 return {window,children,responses,draft,denied,get calls(){return calls},get focus(){return focus},message(data){events.get('message')?.(data)}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('ordinary responses and form requests never open verification',async()=>{
 const b=browser();assert.equal((await b.window.fetch('/api/cars')).status,200);
 b.responses.push(b.denied());assert.equal((await b.window.fetch('/api/lead',{method:'POST'})).status,429);
 b.responses.push(new Response('{}',{status:429}));assert.equal((await b.window.fetch('/api/cars')).status,429);
 assert.equal(b.children.length,0);assert.equal(b.draft.value,'Сохранённый текст заявки');
});
test('concurrent catalog requests share one dialog; only its same-origin frame resumes reads',async()=>{
 const b=browser();b.responses.push(b.denied(),b.denied());
 const first=b.window.fetch('/api/cars?offset=100'),second=b.window.fetch('/api/cars?offset=200');
 await tick();assert.equal(b.children.length,1);assert.equal(b.calls,2);
 const frame=b.children[0].children[1];
 b.message({origin:'https://evil.test',source:frame.contentWindow,data:{type:'catalog-verified'}});
 assert.equal(b.children.length,1);
 b.message({origin:'https://fixture.test',source:{},data:{type:'catalog-verified'}});
 assert.equal(b.children.length,1);
 b.message({origin:'https://fixture.test',source:frame.contentWindow,data:{type:'catalog-verified'}});
 assert.equal((await first).status,200);assert.equal((await second).status,200);
 assert.equal(b.calls,4);assert.equal(b.children.length,0);assert.equal(b.focus,1);
 assert.equal(b.draft.value,'Сохранённый текст заявки');
});
test('closing verification leaves the page and draft intact and stops 429 retries',async()=>{
 const b=browser();b.responses.push(b.denied());const result=b.window.fetch('/api/cars');
 await tick();b.children[0].children[0].children[1].listeners.click();
 assert.equal((await result).status,403);assert.equal(b.calls,1);assert.equal(b.children.length,0);
 assert.equal(b.draft.value,'Сохранённый текст заявки');
});
test('aborting the last pending read closes verification and releases navigation',async()=>{
 const b=browser(),controller=new AbortController();b.responses.push(b.denied());
 const result=b.window.fetch('/api/cars',{signal:controller.signal});
 const ended=result.then(()=> 'resolved',error=>error.name);
 await tick();assert.equal(b.children.length,1);
 controller.abort();await tick();
 assert.equal(b.children.length,0,'an abandoned catalog query must not leave a modal over the new page');
 assert.equal(await ended,'AbortError');assert.equal(b.calls,1);
});
test('one aborted request does not close verification needed by another request',async()=>{
 const b=browser(),controller=new AbortController();b.responses.push(b.denied(),b.denied());
 const first=b.window.fetch('/api/cars?offset=100',{signal:controller.signal}).then(()=> 'resolved',error=>error.name);
 const second=b.window.fetch('/api/cars?offset=200');
 await tick();controller.abort();await tick();
 assert.equal(b.children.length,1);
 assert.equal(await Promise.race([first,tick().then(()=> 'still waiting')]),'AbortError');
 const frame=b.children[0].children[1];
 b.message({origin:'https://fixture.test',source:frame.contentWindow,data:{type:'catalog-verified'}});
 assert.equal((await second).status,200);assert.equal(b.calls,3);assert.equal(b.children.length,0);
});

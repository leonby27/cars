// Real React UI + candidate guard over isolated HTTPS. No production requests,
// analytics, accounts, orders, catalog writes or application database access.
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { chromium, webkit } from 'playwright';
import { catalogMetaBoot } from '../server/app-render.mjs';
import { findCatalogLanding, landingFilterParams } from '../src/catalog-landings.js';

const build = resolve(process.env.NAVIGATION_BUILD_DIR || 'dist');
try { await symlink(resolve('node_modules'), join(build,'node_modules')); } catch (e) { if(e.code!=='EEXIST')throw e; }
const { renderCatalogApp, renderCarApp, renderAppPage } = await import(pathToFileURL(join(build,'ssr/entry-server.js')));
const client = pathToFileURL(join(build,'client/'));
const shell = await readFile(new URL('index.html',client),'utf8');
const entry = shell.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/)[0]+'</script>';
const styles = [...shell.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('');
const scratch = await mkdtemp(join(tmpdir(),'catalog-guard-browser-'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(scratch,'key.pem'),'-out',join(scratch,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
const fixtureIp = '198.51.100.77';
const fixture = `import http.server,importlib.util,json,sys,time,ipaddress,secrets
from pathlib import Path
spec=importlib.util.spec_from_file_location('guard',sys.argv[1]);g=importlib.util.module_from_spec(spec);spec.loader.exec_module(g)
secrets.choice=lambda seq:seq[0]
store=g.Store(Path(sys.argv[2])/'guard.sqlite3',b'browser-fixture-secret',behavior={})
class Fixture(g.Handler):
 def do_POST(self):
  if self.path!='/fixture':return super().do_POST()
  mode=json.loads(self.rfile.read(int(self.headers['Content-Length'])))['mode']
  with store.lock,store.db:
   if mode=='reset':
    for table in ['seen','budgets','passes','puzzles','attempts','network_windows','network_seen','network_addresses','network_risk','clearance_totals']:store.db.execute('DELETE FROM '+table)
    store.early_networks=()
   elif mode=='threshold':
    store.budget(store.key('${fixtureIp}'));store.db.execute('UPDATE budgets SET details=600 WHERE ip=?',(store.key('${fixtureIp}'),))
   elif mode=='early':
    store.early_networks=(ipaddress.ip_network('${fixtureIp}/32'),);store.early_until=time.time()+86400
   elif mode=='exhaust':
    network=store.key('network:${fixtureIp}/32');store.db.execute('INSERT OR REPLACE INTO clearance_totals VALUES (?,?,10000,0)',('network:'+network,time.time()))
  self.send(204)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Fixture);server.store=store;server.mode='enforce';server.client_script=Path(sys.argv[1]).with_name('catalog-guard-client.js').read_bytes()
print(json.dumps({'port':server.server_port}),flush=True);server.serve_forever()
`;
await writeFile(join(scratch,'fixture.py'),fixture);
const guard = spawn('python3',[join(scratch,'fixture.py'),resolve('deploy/catalog-guard.py'),scratch],{stdio:['ignore','pipe','pipe']});
const lines=createInterface({input:guard.stdout});
const guardPort=await new Promise((yes,no)=>{lines.once('line',line=>yes(JSON.parse(line).port));guard.once('error',no);guard.once('exit',code=>no(new Error('guard exited '+code)));});
const guardBase=`http://127.0.0.1:${guardPort}`;
const control = async mode => { assert.equal((await fetch(guardBase+'/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode})})).status,204); };
const cars=[['che168-99900001','Zeekr','001'],['che168-99900002','Zeekr','7X'],['che168-99900003','Toyota','Corolla']].map(([id,brand,model])=>({id,brand,model,title:`${brand} ${model} 2024`,year:2024,source:'Che168',origin:'china',type:brand==='Zeekr'?'Электромобиль':'Бензиновый',chinaPrice:150000,usdPrice:21000,sourcePriceUsd:21000,mileage:10000,bodyType:'Седан',image:null,images:[],status:'Карточка доступна',available:true,battery:75,range:500,drive:'Задний',_summary:true}));
const listing=params=>{const items=cars.filter(c=>(!params.get('brand')||c.brand===params.get('brand'))&&(!params.get('model')||c.model===params.get('model')));return {items,total:items.length,hasMore:false,refreshedAt:'2026-10-04T10:00:00Z'};};
const meta=params=>({brands:[{brand:'Zeekr',count:2},{brand:'Toyota',count:1}],models:[...new Set(listing(params).items.map(c=>c.model))].map(model=>({model,count:1})),bodyTypes:[{body_type:'Седан',count:3}],drives:[{drive:'Задний',count:3}],countries:[],availability:{}});
const headerText=(await readFile('deploy/nginx-abcars-headers.conf','utf8')).match(/add_header Content-Security-Policy "([^"]+)"/)[1];
let mutations=0;
const server=createServer({key:await readFile(join(scratch,'key.pem')),cert:await readFile(join(scratch,'cert.pem'))},async(req,res)=>{
 try {
  const url=new URL(req.url,'https://localhost');
  const guardHeaders={'X-Guard-IP':fixtureIp,'Cookie':req.headers.cookie||''};
  const send=async response=>{res.statusCode=response.status;for(const [key,value]of response.headers)if(!['connection','transfer-encoding','content-length'].includes(key))res.setHeader(key,value);res.end(Buffer.from(await response.arrayBuffer()));};
  if(url.pathname.startsWith('/_catalog-check')) {
   const body=req.method==='POST'?await new Promise(resolve=>{const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>resolve(Buffer.concat(chunks)));}):undefined;
   const response=await fetch(guardBase+req.url,{method:req.method,headers:{...guardHeaders,'X-Guard-Host':req.headers.host,'Origin':req.headers.origin||'','Content-Type':req.headers['content-type']||''},body,redirect:'manual'});
   res.setHeader('X-Frame-Options','SAMEORIGIN');await send(response);return;
  }
  const checked=await fetch(guardBase+'/check',{headers:{...guardHeaders,'X-Guard-URI':req.url,'X-Guard-Method':req.method}});
  if(checked.headers.get('X-Guard-Session'))res.setHeader('Set-Cookie',checked.headers.get('X-Guard-Session'));
  if(checked.status===403){await send(await fetch(guardBase+'/blocked',{headers:{'X-Guard-URI':req.url,'X-Guard-Reason':checked.headers.get('X-Guard-Reason')||''},redirect:'manual'}));return;}
  res.setHeader('Content-Security-Policy',headerText);res.setHeader('X-Frame-Options','DENY');
  if(url.pathname.startsWith('/api/')) {
   if(req.method!=='GET'){mutations++;res.statusCode=204;res.end();return;}
   let value={};
   if(url.pathname==='/api/cars')value=listing(url.searchParams);
   else if(url.pathname==='/api/catalog/meta')value=meta(url.searchParams);
   else if(url.pathname==='/api/auth/me')value={user:null};
   else if(url.pathname==='/api/model-catalog')value={model:{brand:'Zeekr',model:'7X',name:'Zeekr 7X',path:'/catalog/zeekr/7x',brandSlug:'zeekr',modelSlug:'7x',inCatalog:true},cars:[],total:1,links:{brandPath:'/catalog/zeekr',sections:[],siblings:[],similar:[],journal:[]}};
   else if(url.pathname.startsWith('/api/cars/'))value={...cars.find(c=>c.id.endsWith(url.pathname.split('/').at(-1))),_summary:false};
   await new Promise(r=>setTimeout(r,url.pathname==='/api/cars'?300:50));
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return;
  }
  if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/fonts/')||/\.(svg|png|jpg|webp|ico)$/.test(url.pathname)) {
   assert.ok(!url.pathname.includes('..'));const data=await readFile(new URL('.'+url.pathname,client));res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.woff2')?'font/woff2':url.pathname.endsWith('.svg')?'image/svg+xml':url.pathname.endsWith('.png')?'image/png':url.pathname.endsWith('.jpg')?'image/jpeg':'text/javascript');res.end(data);return;
  }
  let boot={},root;
  if(url.pathname.startsWith('/catalog')) {
   const params=landingFilterParams(findCatalogLanding(url.pathname));
   boot={catalogPath:url.pathname,catalogSearch:'',catalogSeed:'s3',catalogValue:listing(params),catalogFacts:{total:3,updatedAt:'2026-10-04T10:00:00Z'},...catalogMetaBoot(params,meta(params))};root=renderCatalogApp(url.pathname,url.search,boot);
  } else if(url.pathname.startsWith('/cars/')) {
   const car={...cars.find(c=>c.id.endsWith(url.pathname.split('/').at(-1))),_summary:false};boot={carId:car.id,carValue:car,relatedValue:[]};root=renderCarApp(url.pathname,{car});
  } else root=renderAppPage(url.pathname,boot);
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<script src="/_catalog-check/client.js" defer></script></head><body><div id="root" data-prerender="${url.pathname}">${root}</div><script>window.__boot=${JSON.stringify(boot)}</script>${entry}</body></html>`);
 } catch(e) {res.statusCode=500;res.end(e.message);}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`https://127.0.0.1:${server.address().port}`;
await writeFile(join(scratch,'ready.json'),JSON.stringify({base,guardBase}));
console.log(JSON.stringify({base,scratch}));
if(process.env.GUARD_BROWSER_SERVE==='1') {
 process.on('SIGTERM',()=>{guard.kill();server.closeAllConnections();server.close(()=>process.exit());});
 await new Promise(()=>{});
}
const browser=await (process.env.TEST_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
try {
 for(const mobile of [false,true]) {
  await control('reset');
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base||u.pathname.startsWith('/photo/'))return route.abort();if(u.pathname.startsWith('/api/')&&route.request().method()!=='GET')return route.fulfill({status:204});return route.continue();});
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],browserWarnings=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()!=='error'||m.text().startsWith('Failed to load resource'))return;if(m.text().startsWith('Button failed to load, iconName ='))browserWarnings.push(m.text());else errors.push(m.text());});
  const hydrated=()=>page.waitForFunction(()=>window.__catalogGuardInstalled&&Object.keys(document.querySelector('.favorites-link')||{}).some(k=>k.startsWith('__reactProps')));
  const chooseZeekr=async()=>{if(mobile){await page.locator('.brand-model-open').click();await page.locator('[role=dialog]').getByText('Zeekr',{exact:true}).click();await page.locator('[role=dialog]').getByRole('button',{name:/Показать .* авто/}).click();}else{await page.getByRole('button',{name:/Марка:/}).click();await page.getByRole('option',{name:/Zeekr/}).click();}};
  const modal=()=>page.locator('dialog[aria-labelledby="catalog-guard-title"]');
  await page.goto(base+'/catalog?nocount=1');await hydrated();
  await chooseZeekr();await page.waitForURL('**/catalog/zeekr');await page.waitForFunction(()=>document.querySelectorAll('.car-row').length===2);
  if(!mobile)await page.locator('.quick-view-toggle').filter({hasText:'Быстрый просмотр'}).locator('input').uncheck();
  await page.locator('.car-row[data-car-id="che168-99900002"]').click({position:{x:100,y:90}});await page.waitForURL('**/cars/99900002');
  await page.goBack();await page.waitForURL(url=>url.pathname==='/catalog/zeekr');await page.waitForFunction(()=>document.querySelectorAll('.car-row').length===2);
  await page.getByRole('button',{name:'Открыть меню',exact:true}).click();
  await page.locator('#header-menu a[href="/contacts"]').click();await page.waitForURL('**/contacts');
  await page.goBack();await page.waitForURL(url=>url.pathname==='/catalog/zeekr');
  if(mobile) {await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await page.locator('#header-menu a[href="/login"]').click();}
  else await page.locator('.account-link').click();
  await page.waitForURL('**/login');
  const draft=page.locator('.auth-modal input[type="tel"]');await draft.fill('+375290000000');
  await control('threshold');
  const denied=page.evaluate(()=>{window.__testRead=fetch('/api/cars?offset=900').then(r=>r.status);});await denied;await modal().waitFor();
  await modal().getByRole('button',{name:'Закрыть'}).click();assert.equal(await page.evaluate(()=>window.__testRead),403);assert.equal(await draft.inputValue(),'+375290000000');
  await page.locator('.auth-modal').getByRole('button',{name:'Закрыть',exact:true}).click();await page.waitForURL(url=>url.pathname==='/catalog/zeekr');
  await page.evaluate(()=>{window.__testAbort=new AbortController();window.__testRead=fetch('/api/cars?offset=901',{signal:window.__testAbort.signal}).then(r=>r.status,e=>e.name);});await modal().waitFor();
  await page.evaluate(()=>window.__testAbort.abort());await modal().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__testRead),'AbortError');
  // A real React detail request must abort when browser Back unmounts the card.
  // This used to leave its verification modal over the restored catalog.
  await page.locator('.car-row[data-car-id="che168-99900001"]').click({position:{x:100,y:90}});
  await page.waitForURL('**/cars/99900001');await modal().waitFor();
  await page.goBack();await page.waitForURL(url=>url.pathname==='/catalog/zeekr');await modal().waitFor({state:'detached'});
  await page.evaluate(()=>{window.__testRead=fetch('/api/cars?offset=902').then(r=>r.status);});await modal().waitFor();
  const frame=page.frameLocator('iframe[title="Подтвердить продолжение просмотра"]');await frame.locator('#answer').fill('2222');await frame.getByRole('button',{name:'Продолжить',exact:true}).click();await modal().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>window.__testRead),200);
  await control('reset');await control('early');
  await page.goto(base+'/cars/99900002');await page.waitForURL('**/_catalog-check?return=*');
  await page.locator('#answer').fill('2222');await page.getByRole('button',{name:'Продолжить',exact:true}).click();await page.waitForURL('**/cars/99900002');await hydrated();
  await control('exhaust');assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/cars?offset=903');return r.status;}),429);assert.equal(await modal().count(),0);
  assert.equal(await page.evaluate(async()=>{const r=await fetch('/api/auth/me');return r.status;}),200);
  assert.equal(await page.locator('.maintenance-page').count(),0);assert.deepEqual(errors,[]);
  console.log(`PASS ${process.env.TEST_BROWSER||'chromium'} ${mobile?'mobile':'desktop'}: filters, card/back, menu/login, preserved draft, aborted verification, solved verification, direct HTML recovery, exhausted quota, CSP, no page errors`);
  if(browserWarnings.length)console.log(JSON.stringify({browser_native_media_warnings:browserWarnings}));
  await context.close();
 }
 assert.equal(mutations,0);
} finally {
 await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));guard.kill();lines.close();await rm(scratch,{recursive:true,force:true});
}

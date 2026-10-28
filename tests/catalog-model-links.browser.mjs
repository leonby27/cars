// DOM hit tests and real pointer navigation only; no screenshots or production reads.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,symlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,webkit,firefox} from 'playwright';
import {catalogMetaBoot} from '../server/app-render.mjs';
import {findCatalogLanding} from '../src/catalog-landings.js';
import {modelSlug} from '../src/model-slug.js';

const names={
  Geely:['Binrui','Bo Yue REV','Boyue','Boyue L','Coolray','Coolray PHEV','Cowboy','Emgrand','Emgrand EV','Emgrand GL','Emgrand GS','Emgrand GS EV','Emgrand GT','Emgrand GT PHEV','Emgrand L','Emgrand L PHEV','Emgrand S','Emgrand X6','EX2','EX5','Galaxy A7','Galaxy E8','Galaxy L6','Galaxy L7','Galaxy M7','Galaxy M9','Galaxy Starshine 6','Galaxy Starshine 8','Galaxy Starship 7','Galaxy V900','Haoyue L','Haoyue PRO','ICON','Jia Ji','Jiaji PHEV','Monjaro','Okavango','Panda','Preface','Vision X3','Xingyue S','Yizhen L380'],
  BYD:['Atto 3','Destroyer 05','Dolphin','e1','e2','e3','e5','e6','e9','Frigate 07','Han','Han DM-i','Han EV','Qin','Qin L','Qin PLUS','Qin PLUS DM-i','Qin PLUS EV','Seagull','Seal','Seal 06','Seal 07','Seal U','Song','Song L','Song MAX','Song PLUS','Tang','Yuan','Yuan PLUS','Yuan UP','Very long model name to exercise a truncated label'],
};
const buildPath=resolve(process.env.TEST_BUILD_DIR||'dist'),build=pathToFileURL(buildPath+'/');
if(buildPath.startsWith('/tmp/'))try{await symlink(resolve('node_modules'),resolve(buildPath,'node_modules'));}catch(e){if(e.code!=='EEXIST')throw e;}
const {renderCatalogApp}=await import(new URL('ssr/entry-server.js',build));
const client=new URL('client/',build),shell=await readFile(new URL('index.html',client),'utf8');
const entry=shell.match(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>/)[0]+'</script>';
const styles=[...shell.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]).join('');
const cars=Object.entries(names).flatMap(([brand,models],brandIndex)=>models.map((model,i)=>({
  id:`che168-${99900000+brandIndex*1000+i}`,brand,model,title:`${brand} ${model} 2024`,year:2024,
  source:'Che168',origin:'china',type:'ДВС',chinaPrice:80000+i*1000,mileage:10000,available:true,images:[],_summary:true,
})));
const brandOf=slug=>Object.keys(names).find(brand=>brand.toLowerCase()===slug);
const list=params=>{
  const all=cars.filter(car=>(!params.get('brand')||car.brand===params.get('brand'))&&(!params.get('model')||params.getAll('model').includes(car.model)));
  const offset=Number(params.get('offset')||0),limit=Number(params.get('limit')||48);
  return {items:all.slice(offset,offset+limit),total:all.length,hasMore:offset+limit<all.length};
};
const meta=brand=>({brands:Object.entries(names).map(([brand,models])=>({brand,count:models.length})),models:(names[brand]||[]).map(model=>({model,count:model==='Cowboy'?24:1})),bodyTypes:[],drives:[],countries:[],availability:{}});
const guide=brand=>({
  brand,total:names[brand].length,pricedCount:names[brand].length,
  yearMin:2024,yearMax:2024,priceMin:15000,priceMax:30000,priceMedian:22000,
  calculatedAt:'2026-10-27T12:00:00Z',budgets:{},
  // The last statistics row swallowed unrelated clicks in Safari. Keep the
  // reported last model here, below a complete catalog rather than in isolation.
  models:[...names[brand].filter(model=>model!=='Emgrand GS EV'),...(brand==='Geely'?['Emgrand GS EV']:[])].map(model=>({
    model,count:1,yearMin:2024,yearMax:2024,priceMin:15000,priceMax:30000,priceMedian:22000,powertrains:['ДВС'],
  })),
});
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://fixture');
    if(url.pathname.startsWith('/api/')){
      assert.equal(req.method,'GET');let data={};
      if(url.pathname==='/api/cars')data=list(url.searchParams);
      if(url.pathname==='/api/catalog/meta')data=meta(url.searchParams.get('brand'));
      if(url.pathname==='/api/brand-guide')data=guide(url.searchParams.get('brand'));
      if(url.pathname==='/api/auth/me')data={user:null};
      if(url.pathname==='/api/model-catalog'){
        const brand=brandOf(url.searchParams.get('brand')),slug=url.searchParams.get('model');
        const model=names[brand]?.find(model=>modelSlug(model)===slug);
        assert.ok(model);data={model:{brand,model,name:`${brand} ${model}`,path:`/catalog/${brand.toLowerCase()}/${slug}`,brandSlug:brand.toLowerCase(),modelSlug:slug,inCatalog:true},facts:{total:1,powertrains:[],bodyTypes:[]},cars:[],total:1,links:{brandPath:`/catalog/${brand.toLowerCase()}`,sections:[],siblings:[],similar:[],journal:[]}};
      }
      res.setHeader('content-type','application/json');res.end(JSON.stringify(data));return;
    }
    if(url.pathname.startsWith('/catalog/')){
      const landing=findCatalogLanding(url.pathname);assert.ok(landing?.brand);
      const params=new URLSearchParams({brand:landing.brand});
      const boot={catalogPath:url.pathname,catalogSearch:'',catalogValue:list(params),...catalogMetaBoot(params,meta(landing.brand)),brandGuideBrand:landing.brand,brandGuideValue:guide(landing.brand)};
      res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root" data-prerender="${url.pathname}">${renderCatalogApp(url.pathname,'',boot)}</div><script>window.__boot=${JSON.stringify(boot)}</script>${entry}</body></html>`);return;
    }
    if(url.pathname.startsWith('/assets/')||url.pathname.startsWith('/fonts/')){
      assert.ok(!url.pathname.includes('..'));const root=url.pathname.startsWith('/fonts/')?pathToFileURL(resolve('public')+'/'):client;
      const data=await readFile(new URL('.'+url.pathname,root));res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.woff2')?'font/woff2':'text/javascript');res.end(data);return;
    }
    res.statusCode=404;res.end();
  }catch(error){res.statusCode=500;res.end(String(error));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browserType=({chromium,webkit,firefox})[process.env.TEST_BROWSER||'webkit'];
const browser=await browserType.launch({headless:true});
try{
  const context=await browser.newContext({viewport:{width:1362,height:1000},locale:'ru-RU'});
  await context.route('**/*',route=>new URL(route.request().url()).origin!==base||route.request().resourceType()==='image'?route.abort():route.request().method()!=='GET'?route.fulfill({status:204}):route.continue());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  for(const [brand,model] of [['Geely','Cowboy'],['BYD','Seagull']]){
    const path=`/catalog/${brand.toLowerCase()}`;
    await page.goto(base+path,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>Object.keys(document.querySelector('.favorites-link')||{}).some(k=>k.startsWith('__reactProps')));
    assert.equal(await page.locator('.brand-guide-model-row').count(),names[brand].length);
    // Older Safari ignores position:relative on table rows. Exercise that
    // behavior in current engines too, so a newer WebKit cannot mask the bug.
    await page.addStyleTag({content:'@media(min-width:701px){.brand-guide-model-row{position:static!important}}'});
    await page.evaluate(()=>document.fonts.ready);
    for(const width of [1362,1100,820,1362]){
      await page.setViewportSize({width,height:1000});
      await page.locator('.model-quick-chips').waitFor();
      const check=await page.locator('.model-quick-chips').evaluate(panel=>{
        const items=[...panel.querySelectorAll('a,button')],wrong=[],rects=items.map(n=>n.getBoundingClientRect());
        for(let i=0;i<items.length;i++){
          const item=items[i],r=rects[i];
          for(const child of [item,item.querySelector('span'),item.querySelector('small')].filter(Boolean)){
            const box=child.getBoundingClientRect();
            const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('.model-quick-chips a,.model-quick-chips button');
            if(hit!==item)wrong.push({wanted:item.textContent,hit:document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('a,button')?.getAttribute('href')});
          }
          for(let j=i+1;j<rects.length;j++){const b=rects[j];if(Math.min(r.right,b.right)-Math.max(r.left,b.left)>0.5&&Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>0.5)wrong.push({overlap:[item.textContent,items[j].textContent]});}
        }
        return {wrong,order:items.map(n=>n.querySelector('span').textContent),columns:new Set(rects.map(r=>Math.round(r.x))).size};
      });
      assert.deepEqual(check.wrong,[],`${brand} ${width}: each label/count must hit its own link`);
      assert.equal(check.columns,width>980?7:3);
      assert.deepEqual(check.order.slice(1),[...names[brand]].sort((a,b)=>a.localeCompare(b,'ru',{numeric:true,sensitivity:'base'})));
    }
    const link=page.locator('.model-quick-chips a').filter({has:page.locator('span',{hasText:new RegExp(`^${model}$`)})});
    const before=await link.locator('span').evaluate(n=>getComputedStyle(n).color);
    const point=await link.locator('small').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    await page.mouse.move(point.x,point.y);
    assert.equal(await link.evaluate(n=>n.matches(':hover')),true);
    assert.notEqual(await link.locator('span').evaluate(n=>getComputedStyle(n).color),before,'hovering the count highlights its model');
    await page.mouse.click(point.x,point.y);
    await page.waitForURL(url=>url.pathname===`${path}/${modelSlug(model)}`);
    await page.locator('.model-quick-chips a').filter({has:page.locator('span',{hasText:'Все модели',exact:true})}).click();
    await page.waitForURL(url=>url.pathname===path&&!url.searchParams.has('model'));
    const rows=page.locator('.brand-guide-model-row');
    for(const index of [0,Math.floor(names[brand].length/2),names[brand].length-1]){
      const row=rows.nth(index);
      await row.scrollIntoViewIfNeeded();
      assert.equal(await row.locator('td').last().evaluate(cell=>{
        const r=cell.getBoundingClientRect();
        return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('a')?.getAttribute('href');
      }),await row.locator('.brand-guide-model-link').getAttribute('href'),'each statistics row keeps its own whole-row link');
    }
    const firstRow=rows.first(),firstHref=await firstRow.locator('.brand-guide-model-link').getAttribute('href');
    await firstRow.scrollIntoViewIfNeeded();
    const rowPoint=await firstRow.locator('td').last().evaluate(cell=>{const r=cell.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
    await page.mouse.click(rowPoint.x,rowPoint.y);
    await page.waitForURL(url=>url.pathname===firstHref);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.locator('.model-quick-chips a').filter({has:page.locator('span',{hasText:'Все модели',exact:true})}).click();
    await page.waitForURL(url=>url.pathname===path);
    await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('.model-quick-chips').isVisible(),false);
    await page.setViewportSize({width:1362,height:1000});
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS ${browserType.name()}: Geely/BYD with full brand statistics and legacy Safari row positioning, model hit boxes, hover and count clicks, model URL, All models, responsive columns`);
  await context.close();
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}

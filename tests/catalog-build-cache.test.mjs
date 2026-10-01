import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {catalogBuildKey,readCatalogBuildCache,writeCatalogBuildCache} from '../scripts/lib/catalog-build-cache.mjs';
import {BLOG_ENABLED} from '../src/feature-flags.js';
import {blogPosts,BLOG_TOP_POOL} from '../src/blog-posts.js';
const live=()=>({showcase:[],carEntries:[],models:new Map(),modelChanged:new Map(),modelPrices:new Map(),listPages:new Map(),stock:new Map(),changed:new Map(),collections:new Map(),modelRows:[],priceStats:[],activeCars:0});
const marketPrices={version:1,normal:[],refund50:[],createdAt:100};

test('snapshot preserves Maps and original freshness across repeated UI releases',()=>{
 const dir=mkdtempSync(join(tmpdir(),'abcars-cache-'));
 try {
  const file=join(dir,'cache');const data=live();data.models.set('Test|One',2);
  writeCatalogBuildCache(file,{key:'one',live:data,marketPrices,createdAt:100});
  const {saved}=readCatalogBuildCache(file,'one',{now:200});assert.equal(saved.live.models.get('Test|One'),2);
  writeCatalogBuildCache(join(dir,'next'),saved);
  assert.equal(readCatalogBuildCache(join(dir,'next'),'one',{now:200}).saved.createdAt,100);
  assert.ok(readCatalogBuildCache(file,'two',{now:200}).reason);
  assert.ok(readCatalogBuildCache(file,'one',{now:100+86400000}).reason);
  writeFileSync(file,'broken');assert.ok(readCatalogBuildCache(file,'one').reason);
  assert.ok(readCatalogBuildCache(join(dir,'missing'),'one').reason);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('compatibility ignores JSX/CSS but catches data, configuration and rate changes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'abcars-cache-key-'));
 try {
  for(const d of ['src','server','config','db','scripts/lib'])mkdirSync(join(dir,d),{recursive:true});
  for(const f of ['package.json','package-lock.json','scripts/generate-seo-pages.mjs','src/pricing.js'])writeFileSync(join(dir,f),'original');
  const first=catalogBuildKey(dir,{country:'by'});
  writeFileSync(join(dir,'src/App.jsx'),'new layout');writeFileSync(join(dir,'src/styles.css'),'new style');
  assert.equal(catalogBuildKey(dir,{country:'by'}),first);
  assert.notEqual(catalogBuildKey(dir,{country:'other'}),first);
  writeFileSync(join(dir,'src/pricing.js'),'new rates');assert.notEqual(catalogBuildKey(dir,{country:'by'}),first);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('SEO rebuild uses compatible cached data with unavailable DB and new page assets',()=>{
 const dir=mkdtempSync(join(tmpdir(),'abcars-cached-seo-'));
 try {
  const output=join(dir,'build/client');mkdirSync(output,{recursive:true});
  writeFileSync(join(output,'index.html'),'<!doctype html><html><head><title>App</title><script type="module" src="/assets/new-ui.js"></script></head><body><div id="root"></div></body></html>');
  const key=catalogBuildKey(resolve('.'),{siteUrl:'https://abcars.by',carsSitemap:false,fullSitemap:false,carsPerModelInSitemap:0,listPagesInSitemap:3,showcaseSize:20,blogCarsOnPage:BLOG_TOP_POOL,blogEnabled:BLOG_ENABLED,publishedPosts:blogPosts().map(p=>p.slug)});
  const source=join(dir,'source.bin');writeCatalogBuildCache(source,{key,live:live(),marketPrices});
  const out=execFileSync(process.execPath,['scripts/generate-seo-pages.mjs'],{encoding:'utf8',timeout:30000,env:{...process.env,SEO_OUTPUT_DIR:output,SEO_CATALOG:join(dir,'missing'),SEO_CARS_FROM_DB:'1',SEO_ALLOW_INDEXING:'0',SEO_CARS_SITEMAP:'0',SEO_SITEMAP_FULL:'0',SEO_VEHICLE_PAGES:'0',SITE_URL:'https://abcars.by',DATABASE_URL:'postgres://none:none@127.0.0.1:1/none',ABCARS_REUSE_CATALOG:'1',ABCARS_CATALOG_CACHE_FILE:source}});
  assert.match(out,/быстрый режим: готовые данные, без запросов к базе/);
  assert.match(readFileSync(join(output,'index.html'),'utf8'),/assets\/new-ui\.js/);
  assert.deepEqual(JSON.parse(readFileSync(join(output,'../market-price-stats.json'),'utf8')),marketPrices);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('planner and fingerprint agree on audited render-only changes',async()=>{
 const {deploymentPlan}=await import('../scripts/lib/deploy-plan.mjs');
 const dir=mkdtempSync(join(tmpdir(),'abcars-shared-key-'));
 try {
  for(const d of ['src','server','config','db','scripts/lib'])mkdirSync(join(dir,d),{recursive:true});
  for(const f of ['package.json','package-lock.json'])writeFileSync(join(dir,f),'{}');
  const first=catalogBuildKey(dir,{});
  for(const f of ['src/info-pages-seo.js','src/market-compare.js','src/vehicle-market-savings.js','config/critical-classes.json','scripts/deploy.mjs']){
   writeFileSync(join(dir,f),'changed rendering');
   assert.equal(deploymentPlan([f]).reuseCatalog,true,f);
   assert.equal(catalogBuildKey(dir,{}),first,f);
  }
  writeFileSync(join(dir,'src/blog-posts.js'),'changed selection');
  assert.equal(deploymentPlan(['src/blog-posts.js']).reuseCatalog,false);
  assert.notEqual(catalogBuildKey(dir,{}),first);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('feed compatibility is independent of journal/catalog preparation but includes prices and settings',async()=>{
 const {feedBuildKey}=await import('../scripts/lib/catalog-build-cache.mjs');
 const dir=mkdtempSync(join(tmpdir(),'abcars-feed-key-'));
 try{
  for(const d of ['src','server','config','db','scripts/lib'])mkdirSync(join(dir,d),{recursive:true});
  for(const f of ['package.json','package-lock.json','src/pricing.js'])writeFileSync(join(dir,f),'original');
  const first=feedBuildKey(dir,{siteUrl:'https://abcars.by',freshDays:7});
  for(const f of ['src/blog-posts.js','scripts/generate-seo-pages.mjs','scripts/lib/blog-cover.mjs'])writeFileSync(join(dir,f),'new journal selection');
  assert.equal(feedBuildKey(dir,{siteUrl:'https://abcars.by',freshDays:7}),first);
  assert.notEqual(feedBuildKey(dir,{siteUrl:'https://abcars.by',freshDays:3}),first);
  writeFileSync(join(dir,'src/pricing.js'),'changed rates');
  assert.notEqual(feedBuildKey(dir,{siteUrl:'https://abcars.by',freshDays:7}),first);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

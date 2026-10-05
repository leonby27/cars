import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentPlan } from '../scripts/lib/deploy-plan.mjs';

test('presentation and test-only changes reuse inputs without DB maintenance',()=>{
 for(const files of [['src/App.jsx','src/styles.css'],['src/home-boot.js'],['src/icons.jsx','public/logo.svg'],['tests/pricing.test.mjs','AGENTS.md'],[]]){
  const p=deploymentPlan(files);assert.equal(p.mode,'presentation');
  assert.equal(p.reuseCatalog,true);assert.equal(p.reuseFeed,true);
  assert.equal(p.recalculatePrices,false);assert.equal(p.checkDuplicates,false);assert.equal(p.migrate,false);
 }
});
test('pricing/rates changes and unknown data code cannot take the fast path',()=>{
 for(const file of ['src/pricing.js','src/korea-logistics.js','src/new-price-helper.js','server/repository.mjs','scripts/generate-seo-pages.mjs','package-lock.json']){
  const p=deploymentPlan(['src/styles.css',file]);assert.equal(p.reuseCatalog,false);assert.equal(p.reuseFeed,file === 'scripts/generate-seo-pages.mjs');
 }
 assert.equal(deploymentPlan(['src/pricing.js']).recalculatePrices,true);
 assert.equal(deploymentPlan(['server/repository.mjs']).recalculatePrices,false);
 assert.equal(deploymentPlan([],{pricingRefreshed:true}).recalculatePrices,true);
 assert.equal(deploymentPlan(['src/styles.css'],{knownBase:false}).migrate,true);
});
test('migration and duplicate changes run only the affected maintenance',()=>{
 assert.equal(deploymentPlan(['db/migrations/999_test.sql']).migrate,true);
 assert.equal(deploymentPlan(['db/migrations/999_test.sql']).recalculatePrices,true);
 const p=deploymentPlan(['scripts/lib/cross-source-dedupe.mjs']);
 assert.equal(p.checkDuplicates,true);assert.equal(p.migrate,false);assert.equal(p.recalculatePrices,false);
 const index=deploymentPlan(['db/migrations/045_vehicles_updated_at_index.sql']);
 assert.equal(index.migrate,true);assert.equal(index.recalculatePrices,false);assert.equal(index.checkDuplicates,false);
 assert.equal(index.reuseCatalog,true);
});

test('homepage priority selection prepares fresh cards without rewriting prices',()=>{
 const p=deploymentPlan(['src/home-feed.js','src/social-priority-models.js','server/home-feed.mjs',
  'server/repository.mjs','scripts/lib/social-blocks.mjs','scripts/generate-seo-pages.mjs',
  'src/App.jsx','src/vehicle-market-savings.js']);
 assert.equal(p.reuseCatalog,false);
 assert.equal(p.recalculatePrices,false);
 assert.equal(p.checkDuplicates,false);
 assert.equal(p.migrate,false);
});

test('PageSpeed browser infrastructure rebuilds without rewriting vehicle prices',()=>{
 const p=deploymentPlan(['src/analytics.js','src/boot-api.js','src/counter-loader.js','src/price-fit.js','src/spec-fit.js',
  'src/model-text-load.js','src/model-text-imports.js','src/blog-text-load.js',
  'src/blog-text-imports.js','server/handler.mjs']);
 assert.equal(p.mode,'full');
 assert.equal(p.recalculatePrices,false);
 assert.equal(p.checkDuplicates,false);
 assert.equal(p.migrate,false);
 assert.equal(deploymentPlan(['src/new-price-helper.js']).recalculatePrices,true);
 assert.equal(deploymentPlan(['src/counter-loader.js'],{pricingRefreshed:true}).recalculatePrices,true);
});

test('analytics attribution releases never rewrite catalog prices',()=>{
 const helpers=deploymentPlan(['src/analytics-acquisition.js','src/analytics-updates.js']);
 assert.equal(helpers.reuseCatalog,true);assert.equal(helpers.reuseFeed,true);
 assert.equal(helpers.recalculatePrices,false);assert.equal(helpers.restartBot,false);
 const runtime=deploymentPlan(['src/analytics-acquisition.js','src/analytics-updates.js',
  'server/analytics.mjs','server/analytics-traffic.mjs','server/handler.mjs']);
 assert.equal(runtime.recalculatePrices,false);
 assert.equal(runtime.checkDuplicates,false);assert.equal(runtime.migrate,false);
});

test('journal photos, film loading and critical CSS do not trigger database maintenance',()=>{
 const p=deploymentPlan(['config/critical-classes.json','scripts/generate-seo-pages.mjs',
  'scripts/lib/blog-cover.mjs','src/blog-posts.js','src/service-video-loading.js']);
 assert.equal(p.mode,'full');
 assert.equal(p.recalculatePrices,false);
 assert.equal(p.checkDuplicates,false);
 assert.equal(p.migrate,false);
 assert.equal(deploymentPlan(['config/critical-classes.json']).mode,'presentation');
 assert.equal(deploymentPlan(['config/import-policy.mjs']).checkDuplicates,true);
});

test('real Git diff permits already-built server rates but catches a newer local rate edit',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');
 const {execFileSync}=await import('node:child_process');
 const {catalogRateKey}=await import('../scripts/lib/catalog-build-cache.mjs');
 const cli=resolve('scripts/deploy-plan.mjs');const dir=mkdtempSync(join(tmpdir(),'abcars-plan-'));
 const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 try{
  mkdirSync(join(dir,'src'));mkdirSync(join(dir,'dist'));
  writeFileSync(join(dir,'src/pricing.js'),'base');writeFileSync(join(dir,'src/ev-quota.js'),'quota');writeFileSync(join(dir,'src/styles.css'),'old');
  git('init','-q');git('add','src');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','base');const before=git('rev-parse','HEAD');
  writeFileSync(join(dir,'src/styles.css'),'new');git('add','src');git('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','layout');const after=git('rev-parse','HEAD');
  writeFileSync(join(dir,'src/pricing.js'),'server rates');
  writeFileSync(join(dir,'dist/catalog-build-data.bin.meta.json'),JSON.stringify({rateKey:catalogRateKey(dir)}));
  const flags=()=>execFileSync(process.execPath,[cli,before,after,'0'],{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  assert.equal(flags(),'1 1 0 0 0 0');
  writeFileSync(join(dir,'src/pricing.js'),'newer rates');assert.equal(flags(),'0 0 1 0 0 0');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

// Regressions from the last five production releases.
test('contacts and comparison rendering reuse inputs, journal selection refreshes only catalog',()=>{
 for(const file of ['src/search-dictionary.js','src/info-pages-seo.js','src/market-compare.js','src/vehicle-market-savings.js',
  'src/service-video-loading.js','config/critical-classes.json','src/blog-texts/example.js']) {
  const p=deploymentPlan([file]);
  assert.equal(p.reuseCatalog,true,file); assert.equal(p.reuseFeed,true,file);
  assert.equal(p.recalculatePrices,false,file); assert.equal(p.restartBot,false,file);
 }
 const p=deploymentPlan(['src/blog-posts.js','scripts/generate-seo-pages.mjs','scripts/lib/blog-cover.mjs']);
 assert.equal(p.reuseCatalog,false); assert.equal(p.reuseFeed,true); assert.equal(p.recalculatePrices,false);
 assert.equal(p.restartBot,false);
 const nginx=deploymentPlan(['deploy/nginx-abcars-photo-location.conf','scripts/audit-blog-images.mjs']);
 assert.equal(nginx.reuseCatalog,true);assert.equal(nginx.reuseFeed,true);assert.equal(nginx.restartBot,false);
 assert.equal(deploymentPlan(['scripts/telegram-commands.mjs']).restartBot,true);
 assert.equal(deploymentPlan(['scripts/lib/telegram-guazi.mjs']).restartBot,true);
 assert.equal(deploymentPlan(['src/pricing.js']).restartBot,true);
});

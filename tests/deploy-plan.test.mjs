import test from 'node:test';
import assert from 'node:assert/strict';
import { deploymentPlan } from '../scripts/lib/deploy-plan.mjs';

test('presentation and test-only changes reuse inputs without DB maintenance',()=>{
 for(const files of [['src/App.jsx','src/styles.css'],['src/icons.jsx','public/logo.svg'],['tests/pricing.test.mjs','AGENTS.md'],[]]){
  const p=deploymentPlan(files);assert.equal(p.mode,'presentation');
  assert.equal(p.reuseCatalog,true);assert.equal(p.reuseFeed,true);
  assert.equal(p.recalculatePrices,false);assert.equal(p.checkDuplicates,false);assert.equal(p.migrate,false);
 }
});
test('pricing/rates changes and unknown data code cannot take the fast path',()=>{
 for(const file of ['src/pricing.js','src/korea-logistics.js','src/new-price-helper.js','server/repository.mjs','scripts/generate-seo-pages.mjs','package-lock.json']){
  const p=deploymentPlan(['src/styles.css',file]);assert.equal(p.reuseCatalog,false);assert.equal(p.reuseFeed,false);
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
  assert.equal(flags(),'1 1 0 0 0');
  writeFileSync(join(dir,'src/pricing.js'),'newer rates');assert.equal(flags(),'0 0 1 0 0');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

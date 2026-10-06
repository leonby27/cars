import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pricingInputs} from '../scripts/lib/pricing-inputs.mjs';
import {deploymentPlan} from '../scripts/lib/deploy-plan.mjs';

function fixture() {
  const root=mkdtempSync(join(tmpdir(),'abcars-price-inputs-'));
  const write=(file,text) => {mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),text);};
  for(const file of ['src/pricing.js','scripts/backfill-estimates.mjs','scripts/lib/che168-parser.mjs']) write(file,'export const value=1;');
  return {root,write,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}

test('transitive imports, reexports and literal dynamic imports affect the stored price plan',()=>{
  const f=fixture();try {
    f.write('src/pricing.js',"import {x} from './new-helper.js'; export {value} from './reexport.js'; import './side-effect.js'; await import( './dynamic.js' );");
    f.write('src/new-helper.js',"import data from './rates.json' with {type:'json'}; export const x=1;");
    f.write('src/rates.json','{}');
    f.write('src/reexport.js',"export {x as value} from './new-helper.js';");
    f.write('src/side-effect.js',"import './pricing.js';"); // cycle
    f.write('src/dynamic.js','export const value=1;');
    const inputs=pricingInputs(f.root);
    for(const file of ['src/new-helper.js','src/rates.json','src/reexport.js','src/side-effect.js','src/dynamic.js']) {
      assert.ok(inputs.has(file),file);
      assert.equal(deploymentPlan([file],{root:f.root}).recalculatePrices,true,file);
    }
    assert.equal(deploymentPlan(['src/unrelated.js'],{root:f.root}).recalculatePrices,false);
    assert.equal(deploymentPlan(['src/unrelated.js'],{root:f.root}).reuseCatalog,false);
    // Even an audited UI helper must recalculate if pricing starts importing it.
    f.write('src/pricing.js',"import './phone-mask.js';");f.write('src/phone-mask.js','export const value=1;');
    assert.equal(deploymentPlan(['src/phone-mask.js'],{root:f.root}).recalculatePrices,true);
  } finally {f.cleanup();}
});

test('unresolved or computed dependencies retain the conservative price policy',()=>{
  const f=fixture();try {
    for(const code of ["import './missing.js';",'await import(name);',"await import('./helper-' + name);",'const data=require("./helper.js");']) {
      f.write('src/pricing.js',code);
      assert.equal(pricingInputs(f.root),null,code);
      assert.equal(deploymentPlan(['src/new-helper.js'],{root:f.root}).recalculatePrices,true,code);
      assert.equal(deploymentPlan([],{root:f.root,knownBase:false}).recalculatePrices,true);
    }
  } finally {f.cleanup();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {importedContentHash} from '../server/repository.mjs';

test('import bookkeeping does not invalidate prices; quote input changes do',()=>{
 const car={sourcePrice:100000,city:'Shanghai',images:['one'],checkedAt:'2026-10-01'};
 const original=importedContentHash(car);
 assert.equal(importedContentHash({...car,checkedAt:'2026-10-02',importedAt:'2026-10-02',refreshRun:'next'}),original);
 for(const patch of [{sourcePrice:110000},{city:'Beijing'},{motorThirtyMinutePowerKw:80},
   {fobPriceUsd:15000},{dimensions:'5000x1800x1600'},{technicalSpecs:{groups:[{name:'Engine',items:[]}]}}])
   assert.notEqual(importedContentHash({...car,...patch}),original);
});

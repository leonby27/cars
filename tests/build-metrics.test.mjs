import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildMetrics} from '../scripts/lib/build-metrics.mjs';

test('durations survive success, failure and interruption, without duplicated completion',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'abcars-metrics-'));
  try {
    let clock=0;const file=join(dir,'nested/timings.json');const metrics=buildMetrics(file,{now:()=>clock});
    const finish=metrics.start('total');
    await metrics.measure('ok',async()=>{clock+=1250;});
    await assert.rejects(metrics.measure('failed',async()=>{clock+=500;throw new Error('broken');}),/broken/);
    metrics.start('interrupted');clock+=250;metrics.finishPending(1);finish();
    const records=JSON.parse(readFileSync(file));
    assert.deepEqual(records,[{stage:'total',seconds:2,exitCode:1},{stage:'ok',seconds:1.25,exitCode:0},
      {stage:'failed',seconds:0.5,exitCode:1},{stage:'interrupted',seconds:0.25,exitCode:1}]);
  } finally {rmSync(dir,{recursive:true,force:true});}
});

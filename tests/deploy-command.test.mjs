import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

function deploy({testFails=false}={}) {
  const root=mkdtempSync(join(tmpdir(),'abcars-deploy-command-'));
  for(const dir of ['scripts/lib','bin'])mkdirSync(join(root,dir),{recursive:true});
  for(const file of ['scripts/deploy.mjs','scripts/lib/build-metrics.mjs'])copyFileSync(resolve(file),join(root,file));
  const stub=(name,body)=>writeFileSync(join(root,'bin',name),'#!/bin/sh\n'+body+'\n',{mode:0o755});
  stub('git','echo "git $*" >> calls; case "$1" in branch) echo main;; rev-parse) echo abc123;; esac');
  stub('npm',`echo "npm $*" >> calls; exit ${testFails?1:0}`);
  stub('ssh','echo "ssh" >> calls; cat >/dev/null');
  const result=spawnSync(process.execPath,['scripts/deploy.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,PATH:join(root,'bin')+':'+process.env.PATH}});
  const run=readdirSync(join(root,'runtime/deploy'))[0];
  return {result,calls:readFileSync(join(root,'calls'),'utf8'),
    timings:JSON.parse(readFileSync(join(root,'runtime/deploy',run,'client-timings.json'))),cleanup:()=>rmSync(root,{recursive:true,force:true})};
}

test('single deploy command tests once before pushing and records complete timings',()=>{
  const d=deploy();try {
    assert.equal(d.result.status,0,d.result.stderr);
    assert.equal((d.calls.match(/npm test/g)||[]).length,1);
    assert.ok(d.calls.indexOf('npm test')<d.calls.indexOf('git push'));
    assert.deepEqual(d.timings.map(t=>t.stage),['total','diff-check','tests','push','server-deploy']);
    assert.ok(d.timings.every(t=>t.exitCode===0 && t.seconds>=0));
  } finally {d.cleanup();}
});

test('test failure prevents push and server publication, and records the failed total',()=>{
  const d=deploy({testFails:true});try {
    assert.equal(d.result.status,1);
    assert.doesNotMatch(d.calls,/git push|ssh/);
    assert.equal(d.timings.find(t=>t.stage==='total').exitCode,1);
    assert.equal(d.timings.find(t=>t.stage==='tests').exitCode,1);
  } finally {d.cleanup();}
});

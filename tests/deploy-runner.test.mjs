import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const script=resolve('deploy/abcars-deploy.sh');
// Exercise the real shell sequencing with isolated files and fake external services.
function deploy({buildFails=false,healthFails=false,unitsChanged=false,lockFails=false}={}) {
 const root=mkdtempSync(join(tmpdir(),'abcars-deploy-shell-'));
 for(const d of ['bin','node_modules','dist','deploy'])mkdirSync(join(root,d));
 writeFileSync(join(root,'package-lock.json'),'{}');writeFileSync(join(root,'.env.local'),'');
 writeFileSync(join(root,'dist/old'),'previous release');
 writeFileSync(join(root,'deploy/abcars-archive-assets.sh'),'exit 0\n');
 const stub=(name,body)=>writeFileSync(join(root,'bin',name),'#!/bin/bash\n'+body+'\n',{mode:0o755});
 stub('flock',`exit ${lockFails?1:0}`);stub('sha256sum','echo "hash package-lock.json"');
 writeFileSync(join(root,'node_modules/.abcars-lock-hash'),'hash');
 stub('node','echo "1 1 0 0 0 0"');
 stub('npm',`echo "npm $*" >> calls; ${buildFails?'exit 1':'mkdir -p dist.next; echo new > dist.next/new; echo data > dist.next/market-price-stats.json; echo data > dist.next/catalog-build-data.bin'}`);
 stub('systemctl','echo "systemctl $*" >> calls');
 stub('curl',`echo "curl" >> calls; exit ${healthFails?1:0}`);
 stub('find','echo "cache clear" >> calls');stub('cmp',`exit ${unitsChanged?1:0}`);
 stub('install','echo "install $*" >> calls');
 const result=spawnSync('bash',[script],{cwd:root,encoding:'utf8',env:{...process.env,
  PATH:join(root,'bin')+':'+process.env.PATH,ABCARS_DEPLOY_ROOT:root,
  ABCARS_DEPLOY_LOCK:join(root,'lock'),ABCARS_DEPLOY_LOG_ROOT:join(root,'logs')}});
 return {root,result,calls:existsSync(join(root,'calls'))?readFileSync(join(root,'calls'),'utf8'):'',
  cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test('UI publication skips unchanged services and records successful result',()=>{
 const d=deploy();try{
  assert.equal(d.result.status,0,d.result.stdout+d.result.stderr);
  assert.ok(existsSync(join(d.root,'dist/new')));assert.ok(existsSync(join(d.root,'dist.prev/old')));
  assert.doesNotMatch(d.calls,/db:estimates|npm run dedupe|db:migrate|restart abcars-bot|daemon-reload|reload nginx|start --no-block abcars-search/);
  assert.match(d.calls,/curl/);
  const run=readdirSync(join(d.root,'logs'))[0];
  assert.equal(JSON.parse(readFileSync(join(d.root,'logs',run,'result.json'))).exitCode,0);
 }finally{d.cleanup();}
});
test('build failure leaves serving directory intact and never restarts service',()=>{
 const d=deploy({buildFails:true});try{
  assert.notEqual(d.result.status,0);assert.ok(existsSync(join(d.root,'dist/old')));
  assert.doesNotMatch(d.calls,/systemctl restart|curl/);
 }finally{d.cleanup();}
});
test('failed origin health check restores previous release',()=>{
 const d=deploy({healthFails:true});try{
  assert.notEqual(d.result.status,0);assert.ok(existsSync(join(d.root,'dist/old')));
  assert.equal((d.calls.match(/systemctl restart abcars\n/g)||[]).length,2);
  assert.match(d.result.stdout,/возвращаем предыдущую/);
 }finally{d.cleanup();}
});
test('changed units trigger one reload for all timers',()=>{
 const d=deploy({unitsChanged:true});try{
  assert.equal(d.result.status,0,d.result.stderr);
  assert.equal((d.calls.match(/systemctl daemon-reload/g)||[]).length,1);
  assert.equal((d.calls.match(/install /g)||[]).length,10);
 }finally{d.cleanup();}
});
test('concurrent deployment is rejected before build or service mutations',()=>{
 const d=deploy({lockFails:true});try{
  assert.notEqual(d.result.status,0);assert.equal(d.calls,'');assert.ok(existsSync(join(d.root,'dist/old')));
 }finally{d.cleanup();}
});

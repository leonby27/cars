import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

function build({revisionFails=false,clientFails=false}={}) {
  const root=mkdtempSync(join(tmpdir(),'abcars-build-command-'));
  const write=(file,code)=>{mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),code);};
  for(const file of ['scripts/build.mjs','scripts/lib/build-metrics.mjs']) {
    mkdirSync(dirname(join(root,file)),{recursive:true});copyFileSync(resolve(file),join(root,file));
  }
  write('config/load-env.mjs','');
  write('config/sites/index.mjs',"export const resolveSiteProfile=()=>({id:'abcars'}); export const assertSiteProfile=x=>x;");
  write('scripts/lib/catalog-data-revision.mjs',`export async function catalogDataRevision() {${revisionFails?'throw new Error("unavailable");':'return "verified";'}}`);
  write('server/db.mjs','export const pool={end:async()=>{}};');
  const child="import {appendFileSync} from 'node:fs'; appendFileSync('children.jsonl', JSON.stringify({script:process.argv[1], args:process.argv.slice(2),reuse:process.env.ABCARS_REUSE_CATALOG, revision:process.env.ABCARS_CATALOG_REVISION})+'\\n');";
  for(const file of ['scripts/clean-dist.mjs','scripts/split-css.mjs','scripts/generate-seo-pages.mjs',
    'scripts/prerender-home.mjs','scripts/yandex-feed.mjs','scripts/precompress-dist.mjs'])write(file,child);
  write('node_modules/vite/bin/vite.js',child+(clientFails?'process.exit(7);':''));
  const timingFile=join(root,'timings.json');
  const result=spawnSync(process.execPath,['scripts/build.mjs'],{cwd:root,encoding:'utf8',env:{...process.env,
    ABCARS_REUSE_CATALOG:'1',ABCARS_REUSE_FEED:'1',ABCARS_BUILD_TIMINGS:timingFile,ABCARS_BUILD_LOG:join(root,'build.log')}});
  return {result,timings:JSON.parse(readFileSync(timingFile)),children:readFileSync(join(root,'children.jsonl'),'utf8').trim().split('\n').map(JSON.parse),
    cleanup:()=>rmSync(root,{recursive:true,force:true})};
}

test('build records revision check before all stages and passes verified revision to children',()=>{
  const b=build();try {
    assert.equal(b.result.status,0,b.result.stderr);
    assert.deepEqual(b.timings.map(t=>t.stage),['catalog-revision','clean','client','server','css','catalog-pages','home','feed','compression']);
    assert.ok(b.timings.every(t=>t.exitCode===0 && t.seconds>=0));
    assert.ok(b.children.every(c=>c.revision==='verified' && c.reuse==='1'));
  } finally {b.cleanup();}
});

test('unverifiable catalog disables reuse, while a failed build stops before further stages',()=>{
  const b=build({revisionFails:true,clientFails:true});try {
    assert.equal(b.result.status,7,b.result.stderr);
    assert.deepEqual(b.timings.map(t=>[t.stage,t.exitCode]),[['catalog-revision',1],['clean',0],['client',7]]);
    assert.ok(b.children.every(c=>c.reuse==='0'));
    assert.equal(b.children.length,2);
  } finally {b.cleanup();}
});

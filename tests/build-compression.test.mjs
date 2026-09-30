import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,readFileSync,rmSync,utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync,brotliDecompressSync,gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { reuseFeed } from '../scripts/lib/reuse-feed.mjs';

test('compression reuses valid feed output and repairs stale compressed bytes', () => {
 const dir=mkdtempSync(join(tmpdir(),'abcars-compress-'));const raw=Buffer.from('<feed>abcdef</feed>'.repeat(2000));
 try {
  const path=join(dir,'feed.xml');writeFileSync(path,raw);
  const packed=brotliCompressSync(raw);writeFileSync(path+'.br',packed);
  let log=execFileSync(process.execPath,['scripts/precompress-dist.mjs','--dir='+dir,'--previous='+dir+'/missing'],{encoding:'utf8'});
  assert.match(log,/сжато: 0, взято готовыми из прошлой сборки: 1/);assert.deepEqual(readFileSync(path+'.br'),packed);
  const changed=Buffer.concat([raw,Buffer.from('changed')]);writeFileSync(path,changed);
  execFileSync(process.execPath,['scripts/precompress-dist.mjs','--dir='+dir,'--previous='+dir+'/missing']);
  assert.deepEqual(brotliDecompressSync(readFileSync(path+'.br')),changed);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('UI deploy reuses only a recent feed and matching compressed siblings', () => {
 const dir=mkdtempSync(join(tmpdir(),'abcars-feed-'));const source=join(dir,'source.xml'),target=join(dir,'new','feed.xml');
 try {
  const raw=Buffer.from('<feed>current</feed>');writeFileSync(source,raw);writeFileSync(source+'.br',brotliCompressSync(raw));writeFileSync(source+'.gz',gzipSync(raw));
  assert.equal(reuseFeed(source,target),true);assert.deepEqual(readFileSync(target),raw);
  assert.deepEqual(readFileSync(target+'.gz'),readFileSync(source+'.gz'));
  utimesSync(source,new Date(0),new Date(0));assert.equal(reuseFeed(source,target),false);
  assert.equal(reuseFeed(join(dir,'missing'),target),false);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

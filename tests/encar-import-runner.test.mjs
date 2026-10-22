import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildEncarCar } from '../scripts/lib/encar-parser.mjs';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));
async function setup(t, walkCode, carCode = "throw Error('This fixture must never read the network');", accessCode = null) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'encar-import-runner-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'scripts/lib'), { recursive: true });
  await fs.mkdir(path.join(root, 'runtime'));
  await fs.copyFile(path.join(repository, 'scripts/import-encar.mjs'), path.join(root, 'scripts/import-encar.mjs'));
  for (const name of ['config', 'src']) await fs.symlink(path.join(repository, name), path.join(root, name));
  for (const name of ['korea-specs.mjs', 'encar-parser.mjs', 'encar-import-identity.mjs', 'circle-report.mjs', 'sitemap-refresh.mjs']) {
    await fs.symlink(path.join(repository, 'scripts/lib', name), path.join(root, 'scripts/lib', name));
  }
  await fs.writeFile(path.join(root, 'scripts/lib/encar-client.mjs'), `
export class EncarGeoBlockedError extends Error {}
export class EncarClient {
  constructor() { this.requests = 0; this.throttled = 0; }
  async walk({onItem}) { ${walkCode} }
  async car(id) { ${carCode} }
  ${accessCode ? `async verifyAccess() { ${accessCode} }` : ''}
}`);
  return root;
}

test('actual Encar importer reports failed discovery as fatal instead of a successful final report', async t => {
  const root = await setup(t, "throw Error('metadata unavailable');");
  await assert.rejects(exec(process.execPath, ['scripts/import-encar.mjs', '--database=0'], { cwd: root }), { code: 1 });
  const report = JSON.parse(await fs.readFile(path.join(root, 'runtime/encar-import-report.json')));
  assert.equal(report.final, true);
  assert.equal(report.complete, false);
  assert.match(report.fatal, /metadata unavailable/);
  assert.equal(report.imported, 0);
});

test('actual Encar importer retains a broken list in its report and fails the run', async t => {
  const root = await setup(t, 'return { slices: 1, pages: 1, items: 0, candidates: 0, skipped: {}, broken: 1 };');
  await assert.rejects(exec(process.execPath, ['scripts/import-encar.mjs', '--database=0'], { cwd: root }), { code: 1 });
  const report = JSON.parse(await fs.readFile(path.join(root, 'runtime/encar-import-report.json')));
  assert.equal(report.walk.broken, 1);
  assert.equal(report.complete, false);
  assert.match(report.fatal, /оборванных разделов/);
});

test('actual Encar importer recognizes a complete empty discovery without reading details', async t => {
  const root = await setup(t, 'return { slices: 1, pages: 1, items: 0, candidates: 0, skipped: {}, broken: 0 };');
  await exec(process.execPath, ['scripts/import-encar.mjs', '--database=0'], { cwd: root });
  const report = JSON.parse(await fs.readFile(path.join(root, 'runtime/encar-import-report.json')));
  assert.equal(report.complete, true);
  assert.equal(report.final, true);
  assert.equal(report.fatal, null);
});

test('unavailable cards are normal rejections and do not prevent a complete import',async t=>{
  const root=await setup(t,`onItem({externalId:'missing1'});onItem({externalId:'missing2'});return {slices:1,pages:1,items:2,candidates:2,skipped:{}};`,
    `return {status:404,unverifiedUnavailable:true,apiStatus:407,publicStatus:200};`);
  await exec(process.execPath,['scripts/import-encar.mjs','--database=0'],{cwd:root});
  const report=JSON.parse(await fs.readFile(path.join(root,'runtime/encar-import-report.json')));
  assert.equal(report.complete,true);
  assert.equal(report.fatal,null);
  assert.equal(report.rejectedByReason['listing gone (404)'],2);
});

test('importer stops on a sustained outage and waits for the other worker before saving its final report', async t => {
  const root = await setup(t, `
    onItem({externalId: 'broken'}); onItem({externalId: 'in-flight'});
    return {slices: 1, pages: 1, items: 2, candidates: 2, skipped: {}};
  `, `
    if (id === 'broken') throw Object.assign(Error('Encar connection unavailable'), {code: 'ENCAR_UNAVAILABLE'});
    await new Promise(resolve => setTimeout(resolve, 40));
    return {status: 404};
  `);
  await assert.rejects(exec(process.execPath, ['scripts/import-encar.mjs', '--database=0'], { cwd: root }), { code: 1 });
  const report = JSON.parse(await fs.readFile(path.join(root, 'runtime/encar-import-report.json')));
  assert.equal(report.complete, false);
  assert.equal(report.final, true);
  assert.match(report.fatal, /connection unavailable/);
  assert.equal(report.rejectedByReason['listing gone (404)'], 1);
});

test('actual importer accepts a verified new car with explicit unknown history and reports the omission',async t=>{
  const sample=JSON.parse(await fs.readFile(path.join(repository,'tests/fixtures/encar-samples.json'))).samples[0];
  const car=buildEncarCar(sample.detail,{id:sample.listItem.Id,usdPerKrw:0.0007});
  car.historyUnavailable=true;
  car.totalLoss=null;
  const root=await setup(t,`onItem({externalId:${JSON.stringify(car.externalId)}}); return {slices:1,pages:1,items:1,candidates:1,skipped:{}};`,
    `return {status:200,car:${JSON.stringify(car)},historyUnavailable:true};`);
  await exec(process.execPath,['scripts/import-encar.mjs','--database=0','--out=runtime/export.json'],{cwd:root});
  const report=JSON.parse(await fs.readFile(path.join(root,'runtime/encar-import-report.json')));
  assert.equal(report.complete,true);
  assert.equal(report.imported,1);
  assert.equal(report.historyDeferred,1);
  assert.equal(report.rejected,0);
  const saved=JSON.parse(await fs.readFile(path.join(root,'runtime/export.json'))).cars[0];
  assert.equal(saved.claims,null);
  assert.equal(saved.totalLoss,null);
});

test('discovery import checks source access before making any candidates available to workers',async t=>{
  const root=await setup(t,'throw Error("no list walk");','throw Error("workers must not start before the probe");',
    'await new Promise(resolve=>setTimeout(resolve,350)); throw Error("source access unavailable");');
  await fs.writeFile(path.join(root,'runtime/encar-discoveries.json'),JSON.stringify({generatedAt:new Date().toISOString(),items:[{externalId:'123',brand:'Kia'}]}));
  await assert.rejects(exec(process.execPath,['scripts/import-encar.mjs','--database=0','--discoveries'],{cwd:root}),{code:1});
  const report=JSON.parse(await fs.readFile(path.join(root,'runtime/encar-import-report.json')));
  assert.equal(report.imported,0);
  assert.equal(report.detailReads,0);
  assert.match(report.fatal,/source access unavailable/);
});

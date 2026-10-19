import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const repository = fileURLToPath(new URL('../', import.meta.url));
async function setup(t, walkCode, carCode = "throw Error('This fixture must never read the network');") {
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

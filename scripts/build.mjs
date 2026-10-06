#!/usr/bin/env node
import '../config/load-env.mjs';
import { assertSiteProfile, resolveSiteProfile } from '../config/sites/index.mjs';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { catalogDataRevision } from './lib/catalog-data-revision.mjs';
import { buildMetrics } from './lib/build-metrics.mjs';

const log = process.env.ABCARS_BUILD_LOG ? createWriteStream(process.env.ABCARS_BUILD_LOG) : null;
const report = text => { console.log(text); log?.write(text + '\n'); };
const metrics = buildMetrics(process.env.ABCARS_BUILD_TIMINGS, {report:text => report(text.replace('[timings]', '[build]'))});
process.on('exit', code => metrics.finishPending(code || 1));

// Deploys reuse snapshots only after checking the actual catalog.
if (process.env.SEO_CARS_FROM_DB === '1' || process.env.ABCARS_REUSE_CATALOG === '1' || process.env.ABCARS_REUSE_FEED === '1') {
  const finish = metrics.start('catalog-revision');
  const {pool} = await import('../server/db.mjs');
  try {
    process.env.ABCARS_CATALOG_REVISION = await catalogDataRevision(pool);
    finish();
  } catch (error) {
    finish(1);
    report(`[build] catalog revision check failed; preparing fresh data: ${error.code || error.message}`);
    process.env.ABCARS_REUSE_CATALOG = '0';
    process.env.ABCARS_REUSE_FEED = '0';
  } finally { await pool.end(); }
}

const site = assertSiteProfile(resolveSiteProfile(process.env));
// Children, including Vite and Node page generators, receive the identical site.
process.env.SITE_ID = site.id;
process.env.VITE_SITE_ID = site.id;
const output = process.env.ABCARS_BUILD_DIR || 'dist';
if (!['dist','dist.next'].includes(output)) throw new Error(`Unexpected build directory: ${output}`);
const stages = [
  ['clean', 'scripts/clean-dist.mjs'],
  ['client', 'node_modules/vite/bin/vite.js', 'build'],
  ['server', 'node_modules/vite/bin/vite.js', 'build', '--ssr', 'src/entry-server.jsx', '--outDir', `${output}/ssr`],
  ['css', 'scripts/split-css.mjs'],
  ['catalog-pages', 'scripts/generate-seo-pages.mjs'],
  ['home', 'scripts/prerender-home.mjs'],
  ['feed', 'scripts/yandex-feed.mjs'],
  ['compression', 'scripts/precompress-dist.mjs'],
];
for (const [name, ...args] of stages) {
  const finish = metrics.start(name);
  report(`[build] ${name}: start`);
  let tail = '';
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {stdio:['ignore','pipe','pipe']});
    const receive = (chunk, stream) => {
      tail = (tail + chunk).slice(-8000);
      if (log) log.write(chunk); else stream.write(chunk);
    };
    child.stdout.on('data', chunk => receive(chunk, process.stdout));
    child.stderr.on('data', chunk => receive(chunk, process.stderr));
    child.on('error', reject);
    child.on('close', code => resolve(code ?? 1));
  });
  finish(code);
  if (code) {
    if (log) process.stderr.write(tail);
    process.exitCode = code;
    break;
  }
}
if (log) await new Promise(resolve => log.end(resolve));

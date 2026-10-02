#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { catalogDataRevision } from './lib/catalog-data-revision.mjs';

// Deploys reuse snapshots only after checking the actual catalog.
if (process.env.SEO_CARS_FROM_DB === '1' || process.env.ABCARS_REUSE_CATALOG === '1' || process.env.ABCARS_REUSE_FEED === '1') {
  const {pool} = await import('../server/db.mjs');
  try {
    process.env.ABCARS_CATALOG_REVISION = await catalogDataRevision(pool);
  } catch (error) {
    console.error('[build] catalog revision check failed; preparing fresh data:', error.code || error.message);
    process.env.ABCARS_REUSE_CATALOG = '0';
    process.env.ABCARS_REUSE_FEED = '0';
  } finally { await pool.end(); }
}

const output = process.env.ABCARS_BUILD_DIR || 'dist';
if (!['dist','dist.next'].includes(output)) throw new Error(`Unexpected build directory: ${output}`);
const log = process.env.ABCARS_BUILD_LOG ? createWriteStream(process.env.ABCARS_BUILD_LOG) : null;
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
const timings = [];
const report = text => { console.log(text); log?.write(text + '\n'); };
for (const [name, ...args] of stages) {
  const started = performance.now();
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
  const seconds = Math.round((performance.now() - started) / 100) / 10;
  timings.push({stage:name, seconds, exitCode:code});
  report(`[build] ${name}: ${seconds}s, exit=${code}`);
  if (process.env.ABCARS_BUILD_TIMINGS) writeFileSync(process.env.ABCARS_BUILD_TIMINGS, JSON.stringify(timings,null,2));
  if (code) {
    if (log) process.stderr.write(tail);
    process.exitCode = code;
    break;
  }
}
if (log) await new Promise(resolve => log.end(resolve));

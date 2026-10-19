import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, copyFile, mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const exec = promisify(execFile);
const present = file => access(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });

// Scheduled circles refresh once after all stages, especially Encar import.
// Direct collector launches use the same command after their writes complete.
export async function refreshAfterManualCatalog({ root, env = process.env, run = exec, platform = process.platform } = {}) {
  if (env.ABCARS_CIRCLE_REPORT_OWNER === 'scheduler') return;
  if ((env.SITE_ID || env.VITE_SITE_ID || 'abcars') !== 'abcars' || !/^(1|true|yes)$/i.test(String(env.SEO_ALLOW_INDEXING || ''))) return;
  const token = String(env.SEO_SITEMAP_TOKEN || '7c4f19b2').replace(/[^a-z0-9-]/gi, '') || '7c4f19b2';
  if (!await present(path.join(root, 'dist/client', `sitemap-${token}.xml`))) return;
  const script = path.join(root, 'scripts/update-sitemaps.mjs');
  const result = platform === 'linux'
    ? await run('flock', ['-w', '600', env.ABCARS_DEPLOY_LOCK || '/run/lock/abcars-deploy.lock', process.execPath, script], { cwd: root, env, timeout: 1260000, maxBuffer: 2 * 1024 * 1024 })
    : await run(process.execPath, [script], { cwd: root, env, timeout: 600000, maxBuffer: 2 * 1024 * 1024 });
  if (result?.stdout) console.log(result.stdout.trim());
}

// Reuse the SEO generator for identical URL eligibility and lastmod rules, but
// publish only XML. Staging never replaces HTML, assets, feeds or server files.
export async function refreshPublishedSitemaps({ root, env = process.env, generate } = {}) {
  if ((env.SITE_ID || env.VITE_SITE_ID || 'abcars') !== 'abcars') return { skipped: 'other-site' };
  if (!/^(1|true|yes)$/i.test(String(env.SEO_ALLOW_INDEXING || ''))) return { skipped: 'indexing-disabled' };
  const client = path.join(root, 'dist/client');
  const token = String(env.SEO_SITEMAP_TOKEN || '7c4f19b2').replace(/[^a-z0-9-]/gi, '') || '7c4f19b2';
  const indexName = `sitemap-${token}.xml`;
  if (!await present(path.join(client, indexName))) return { skipped: 'no-published-sitemap' };
  const staging = await mkdtemp(path.join(os.tmpdir(), 'abcars-sitemap-'));
  const output = path.join(staging, 'client');
  const decision = path.join(staging, 'decision.json');
  const pending = [];
  try {
    await mkdir(output);
    const shell = await present(path.join(client, 'app-shell.html')) ? 'app-shell.html' : 'index.html';
    await copyFile(path.join(client, shell), path.join(output, 'index.html'));
    const generatorEnv = { ...env, SEO_OUTPUT_DIR: output, SEO_CATALOG: path.join(staging, 'no-catalog.json'),
      SEO_VEHICLE_PAGES: '0', SEO_CARS_FROM_DB: '1', SEO_CARS_SITEMAP: '0', ABCARS_REUSE_CATALOG: '0',
      ABCARS_CATALOG_DECISION: decision, ABCARS_CATALOG_TIMINGS: '', ABCARS_BUILD_TIMINGS: '' };
    if (generate) await generate({ output, decision, env: generatorEnv });
    else await exec(process.execPath, ['scripts/generate-seo-pages.mjs'], { cwd: root, env: generatorEnv, timeout: 600000, maxBuffer: 2 * 1024 * 1024 });
    const prepared = JSON.parse(await readFile(decision, 'utf8'));
    // The generator tolerates an unavailable database for preview builds. A live
    // sitemap refresh must fail closed and preserve the previous files instead.
    if (!prepared.prepared || !prepared.reusable) throw Error('Sitemap: fresh, consistent catalog data unavailable');
    const previous = await readFile(path.join(client, indexName), 'utf8');
    // Accept the previous index layout during the first XML-only refresh.
    const previousPages = /<sitemapindex\b/.test(previous)
      ? await readFile(path.join(client, `sitemap-${token}-pages.xml`), 'utf8') : previous;
    const freshPages = await readFile(path.join(output, indexName), 'utf8');
    if (/xmlns:image|<image:/.test(freshPages)) throw Error('Sitemap: images are forbidden');
    const blocks = xml => [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map(match => match[0]);
    const entryPath = entry => {
      const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
      if (!loc) throw Error('Sitemap: page URL missing');
      const url = new URL(loc.replace(/&amp;/g, '&'));
      if (url.origin !== new URL(env.SITE_URL || 'https://abcars.by').origin) throw Error('Sitemap: unexpected page origin');
      return url.pathname;
    };
    const paginatedEntry = entry => new URL(entry.match(/<loc>([^<]+)<\/loc>/)[1].replace(/&amp;/g, '&')).searchParams.has('page');
    const catalogEntry = entry => /^\/catalog(?:\/|$)/.test(entryPath(entry));
    const vehicleEntry = entry => /^\/cars(?:\/|$)/.test(entryPath(entry));
    if (!/<urlset\b/.test(previousPages) || !/<urlset\b/.test(freshPages)) throw Error('Sitemap: pages XML missing');
    if (blocks(freshPages).some(paginatedEntry)) throw Error('Sitemap: pagination is forbidden');
    if (blocks(freshPages).some(vehicleEntry)) throw Error('Sitemap: vehicle cards are forbidden');
    // Catalog pages render from live data. Static articles/tools are not being
    // republished: preserve their existing inclusion and dates. A newly due
    // article must not appear in XML before its HTML is actually published.
    const pageEntries = [...blocks(previousPages).filter(entry => !catalogEntry(entry) && !vehicleEntry(entry) && !paginatedEntry(entry)),
      ...blocks(freshPages).filter(catalogEntry)];
    await writeFile(path.join(output, indexName), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pageEntries.join('\n')}\n</urlset>\n`);
    const files = [indexName];
    const suffix = `.pending-${process.pid}-${path.basename(staging)}`;
    for (const name of files) {
      const xml = await readFile(path.join(output, name));
      if (/xmlns:image|<image:/.test(xml.toString())) throw Error('Sitemap: images are forbidden');
      for (const [extension, bytes] of [['', xml], ['.gz', gzipSync(xml, { level: 6 })],
        ['.br', brotliCompressSync(xml, { params: { [constants.BROTLI_PARAM_QUALITY]: 6 } })]]) {
        const target = path.join(client, name + extension);
        const temporary = target + suffix;
        pending.push([temporary, target]);
        await writeFile(temporary, bytes);
      }
    }
    // All XML and compressed copies are ready before replacing any live file.
    // Obsolete parts are removed only after the direct sitemap is published.
    for (const [temporary, target] of pending) await rename(temporary, target);
    const keep = new Set(files.flatMap(name => [name, name + '.gz', name + '.br']));
    for (const name of await readdir(client)) {
      const owned = name === 'sitemap.xml' || /^sitemap\.xml\.(?:gz|br)$/.test(name) ||
        /^sitemap(?:-.*)?-cars(?:-[0-9]+)?\.xml(?:\.(?:gz|br))?$/.test(name) ||
        name.startsWith(`sitemap-${token}-`) && /\.xml(?:\.(?:gz|br))?$/.test(name);
      if (owned && !keep.has(name)) await rm(path.join(client, name));
    }
    return { files: files.length, children: 0 };
  } finally {
    for (const [temporary] of pending) await rm(temporary, { force: true });
    await rm(staging, { recursive: true, force: true });
  }
}

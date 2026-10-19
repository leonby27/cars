import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { refreshAfterManualCatalog, refreshPublishedSitemaps } from '../scripts/lib/sitemap-refresh.mjs';

const token = '7c4f19b2';
const indexName = `sitemap-${token}.xml`;
const pages = `sitemap-${token}-pages.xml`;
const cars = `sitemap-${token}-cars.xml`;
const index = `<sitemapindex><sitemap><loc>https://abcars.by/${pages}</loc></sitemap></sitemapindex>`;
const previousPages = '<urlset><url><loc>https://abcars.by/blog/published</loc><lastmod>2026-10-10</lastmod></url><url><loc>https://abcars.by/catalog/old</loc></url><url><loc>https://abcars.by/catalog/under-15000?page=4</loc></url><url><loc>https://abcars.by/cars/old</loc></url></urlset>';
const env = { SITE_ID: 'abcars', SITE_URL: 'https://abcars.by', SEO_ALLOW_INDEXING: '1' };
async function setup(t, legacy = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sitemap-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const client = path.join(root, 'dist/client');
  await mkdir(client, { recursive: true });
  for (const name of ['index.html', indexName, pages, cars, 'sitemap.xml', 'sitemap.xml.gz', `${cars}.br`, `sitemap-${token}-cars-2.xml`, `sitemap-${token}-cars-2.xml.gz`]) {
    await writeFile(path.join(client, name), name === indexName ? (legacy ? index : previousPages) : name === pages ? previousPages : 'previous');
  }
  return { root, client };
}
const generate = async ({ output, decision, env }) => {
  assert.equal(env.ABCARS_REUSE_CATALOG, '0');
  assert.equal(env.SEO_CARS_FROM_DB, '1');
  assert.equal(env.SEO_VEHICLE_PAGES, '0');
  await writeFile(decision, JSON.stringify({ prepared: true, reusable: true }));
  await writeFile(path.join(output, indexName), '<urlset><url><loc>https://abcars.by/catalog</loc><lastmod>2026-10-19</lastmod></url><url><loc>https://abcars.by/blog/not-published-yet</loc></url></urlset>');
  await writeFile(path.join(output, cars), '<urlset><url><loc>https://abcars.by/cars/123</loc><lastmod>2026-10-12</lastmod></url></urlset>');
  await writeFile(path.join(output, 'index.html'), 'new HTML must not be published');
};

test('refresh publishes fresh XML and compressed copies, removes stale shards and preserves HTML', async t => {
  const { root, client } = await setup(t);
  assert.deepEqual(await refreshPublishedSitemaps({ root, env, generate }), { files: 1, children: 0 });
  assert.equal(await readFile(path.join(client, 'index.html'), 'utf8'), 'previous');
  const pagesXml = await readFile(path.join(client, indexName), 'utf8');
  assert.match(pagesXml, /\/blog\/published<\/loc><lastmod>2026-10-10/);
  assert.match(pagesXml, /\/catalog<\/loc><lastmod>2026-10-19/);
  assert.doesNotMatch(pagesXml, /\/catalog\/old|not-published-yet|\/cars\/|[?&]page=/);
  for (const name of [indexName]) {
    const xml = await readFile(path.join(client, name), 'utf8');
    assert.equal(gunzipSync(await readFile(path.join(client, name + '.gz'))).toString(), xml);
    assert.equal(brotliDecompressSync(await readFile(path.join(client, name + '.br'))).toString(), xml);
  }
  const files = await readdir(client);
  assert.equal(files.length, 4);
  assert.ok(!files.includes(pages));
  assert.ok(!files.some(file => file.includes('pending') || file.includes('-cars') || /^sitemap\.xml/.test(file)));
});

test('unavailable/changing catalog, image tags or a failed generator cannot overwrite the live sitemap', async t => {
  for (const failure of ['database', 'changed', 'image', 'child', 'car-child', 'car-page', 'foreign-page', 'pagination', 'exception']) {
    const { root, client } = await setup(t);
    await assert.rejects(refreshPublishedSitemaps({ root, env, generate: async args => {
      await generate(args);
      if (failure === 'database') await writeFile(args.decision, JSON.stringify({ prepared: false }));
      if (failure === 'changed') await writeFile(args.decision, JSON.stringify({ prepared: true, reusable: false }));
      if (failure === 'image') await writeFile(path.join(args.output, indexName), '<urlset><image:image/></urlset>');
      if (failure === 'child') await writeFile(path.join(args.output, indexName), '<loc>https://foreign.test/evil.xml</loc>');
      if (failure === 'car-child') await writeFile(path.join(args.output, indexName), `<loc>https://abcars.by/${cars}</loc>`);
      if (failure === 'car-page') await writeFile(path.join(args.output, indexName), '<urlset><url><loc>https://abcars.by/cars/123</loc></url></urlset>');
      if (failure === 'foreign-page') await writeFile(path.join(args.output, indexName), '<urlset><url><loc>https://foreign.test/catalog</loc></url></urlset>');
      if (failure === 'pagination') await writeFile(path.join(args.output, indexName), '<urlset><url><loc>https://abcars.by/catalog/under-15000?page=4</loc></url></urlset>');
      if (failure === 'exception') throw Error('generator failed');
    } }));
    for (const name of [indexName, pages, cars, 'sitemap.xml']) assert.equal(await readFile(path.join(client, name), 'utf8'), name === indexName || name === pages ? previousPages : 'previous');
    assert.ok(!(await readdir(client)).some(file => file.includes('pending')));
  }
});

test('a verified empty public catalog removes former car shards instead of keeping sold URLs', async t => {
  const { root, client } = await setup(t);
  await refreshPublishedSitemaps({ root, env, generate: async args => {
    await generate(args);
    await writeFile(path.join(args.output, indexName), '<urlset></urlset>');
  } });
  assert.ok(!(await readdir(client)).some(name => name.includes('-cars')));
  assert.doesNotMatch(await readFile(path.join(client, indexName), 'utf8'), /-cars/);
});

test('preview builds, another site and missing published sitemap do not invoke the generator', async t => {
  const { root, client } = await setup(t);
  const unexpected = () => assert.fail('must not query the catalog');
  assert.deepEqual(await refreshPublishedSitemaps({ root, env: { ...env, SEO_ALLOW_INDEXING: '0' }, generate: unexpected }), { skipped: 'indexing-disabled' });
  assert.deepEqual(await refreshPublishedSitemaps({ root, env: { ...env, SITE_ID: 'abdrive' }, generate: unexpected }), { skipped: 'other-site' });
  await rm(path.join(client, indexName));
  assert.deepEqual(await refreshPublishedSitemaps({ root, env, generate: unexpected }), { skipped: 'no-published-sitemap' });
});

test('manual collectors refresh under the deployment lock while scheduled collectors defer to their runner', async t => {
  const { root } = await setup(t);
  const calls = [];
  const run = async (...args) => { calls.push(args); };
  await refreshAfterManualCatalog({ root, env: { ...env, ABCARS_CIRCLE_REPORT_OWNER: 'scheduler' }, run, platform: 'linux' });
  await refreshAfterManualCatalog({ root, env: { ...env, SEO_ALLOW_INDEXING: '0' }, run, platform: 'linux' });
  assert.equal(calls.length, 0);
  await refreshAfterManualCatalog({ root, env, run, platform: 'linux' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'flock');
  assert.deepEqual(calls[0][1], ['-w', '600', '/run/lock/abcars-deploy.lock', process.execPath, path.join(root, 'scripts/update-sitemaps.mjs')]);
});


test('XML-only refresh migrates the old index and preserves published article dates', async t => {
  const {root, client} = await setup(t, true);
  await refreshPublishedSitemaps({root, env, generate});
  assert.match(await readFile(path.join(client, indexName), 'utf8'), /<urlset[\s\S]*blog\/published<\/loc><lastmod>2026-10-10/);
  assert.ok(!(await readdir(client)).includes(pages));
});

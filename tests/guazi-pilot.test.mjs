import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRawData, normalizeCard, imageUrl, sourceUrl, previewUrl, parseChinaMarkdown, matchChina, isChallenge } from '../scripts/lib/guazi-pilot-data.mjs';
import { boundedGet, downloadPhotos, loadChinaIndex, readJson, verifiedPhoto, limiter, mapLimit } from '../scripts/lib/guazi-pilot-io.mjs';
import { options, runPilot } from '../scripts/guazi-pilot.mjs';
import { SourceBlocked, readSessionCard } from '../scripts/lib/guazi-pilot-browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'https://en.guazi.com/products/tesla-model-y-2024-00l-gray-60300km-at-2wd-5-seats-y2ud7mtru4.html';
const MD_URL = 'https://www.guazi.com/car-detail/c172877314440982.md';
const IMAGE = 'https://global-image-pub.guazistatic-global.com/car.jpg?x-bce-process=image/format,f_jpg';
function raw(overrides = {}) {
  return { productId: 'y2ud7mtru4', clueId: 172877314, title: 'Used Tesla Model Y 2024', makeNameEn: 'Tesla', modelName: 'Model Y',
    vehicleDetails: [{ key: 'modelYear', value: '2024' }, { key: 'mileage', value: '60,300' }, { key: 'fuel', value: 'BEV' }, { key: 'regDate', value: '2024.09' }],
    images: [{ imgUrl: IMAGE, ind: 7 }], prices: [{ price: '$$29,106', enName: 'Shanghai, China', isDefault: 1 }],
    reportDetailLite: { baseInfo: { level: 'A' } }, ...overrides };
}
const MD = 'id:c172877314440982\nmodel:特斯拉 2024款 后轮驱动版\nfull_payment:181000元\nfirst_register:2024-09\nmileage:60300公里\ncondition_grade:B\ngeneratedAt:2026-09-26\n';
const push = content => `self.__next_f.push(${JSON.stringify([1, content])})`;
async function temp(t) {
  await fs.mkdir(path.join(ROOT, 'runtime'), { recursive: true });
  const dir = await fs.mkdtemp(path.join(ROOT, 'runtime', 'guazi-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
const quiet = () => {};

test('Flight joins split records and resolves references, ignoring recommended cars', () => {
  const content = `0:${JSON.stringify(['$', 'section', null, { rawData: '$a' }])}\na:${JSON.stringify(raw())}\nb:${JSON.stringify({ rawData: raw({ productId: 'aaaaaaaaaa' }) })}\n`;
  assert.equal(extractRawData([push(content.slice(0, 29)), push(content.slice(29))], 'y2ud7mtru4').clueId, 172877314);
  assert.throws(() => extractRawData([push(content)], 'bbbbbbbbbb'), /No complete/);
});

test('Identity, fuel and zero mileage are validated without inventing prices or dates', () => {
  const r = raw(); r.vehicleDetails.find(x => x.key === 'mileage').value = '0';
  const card = normalizeCard(r, URL);
  assert.equal(card.mileageKm, 0);
  assert.equal(card.selection.eligible, true);
  assert.deepEqual(card.prices[0], { amount: 29106, currency: 'USD', basis: 'FOB', port: 'Shanghai, China', portCode: undefined, isDefault: true, sourceValue: '$$29,106' });
  assert.equal(card.sourceListedAt, null);
  assert.equal(card.availability.status, 'unverified');
  assert.throws(() => normalizeCard(raw({ productId: 'wrongwrong' }), URL), /identity/);
  r.vehicleDetails.find(x => x.key === 'fuel').value = 'PHEV'; r.isElectrified = true;
  assert.deepEqual(normalizeCard(r, URL).selection.violations, ['not_confirmed_bev']);
});

test('Chinese data remains separate, grade conflict is retained and generatedAt is not publication', () => {
  const card = normalizeCard(raw(), URL);
  const china = matchChina(card, parseChinaMarkdown(MD, MD_URL, card.clueId));
  assert.equal(china.status, 'matched');
  assert.equal(china.price.amount, 181000);
  assert.equal(china.transferCount, null);
  assert.deepEqual(china.conflicts, [{ field: 'condition_grade', export: 'A', china: 'B' }]);
  assert.equal(card.inspection.exportGrade, 'A');
  assert.equal(card.sourceListedAt, null);
  assert.equal(matchChina(card, { ...china, mileageKm: 3000 }).status, 'needs_review');
  assert.throws(() => parseChinaMarkdown(MD.replace('c172877314', 'c172877315'), MD_URL, card.clueId), /identity/);
});

test('URLs cannot redirect photo downloads to other hosts or credentials', async () => {
  assert.throws(() => imageUrl('https://image-oversea.guazistatic-global.com.evil.test/car.jpg'));
  assert.throws(() => imageUrl('https://user:pass@image-oversea.guazistatic-global.com/car.jpg'));
  assert.throws(() => sourceUrl('https://www.guazi.com/car-detail/172877314.md', 'markdown'));
  await assert.rejects(boundedGet(IMAGE, { validate: imageUrl, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }) }), /Unapproved/);
  const result = new globalThis.URL(previewUrl(IMAGE + '/resize,m_fill,w_750,h_500'));
  assert.equal(result.searchParams.get('x-bce-process'), 'image/format,f_jpg/resize,m_lfit,w_600');
});

test('Mixed Guazi gallery retains global-image1 originals without accepting arbitrary hosts', async () => {
  const legacy = 'https://global-image1.guazistatic-global.com/qn1704347966a9748de2998c69f86b57648234223c497963.jpg?imageMogr2/format/jpg';
  const card = normalizeCard(raw({ images: [{ imgUrl: IMAGE }, { imgUrl: legacy, smallImgUrl: IMAGE }] }), URL);
  assert.equal(card.images.length, 2);
  assert.equal(card.images[1].sourceUrl, legacy);
  assert.equal(card.images[1].previewSourceUrl, IMAGE);
  for (const bad of [legacy.replace('https:', 'http:'), legacy.replace('.com/', '.com.evil.test/'), legacy.replace('https://', 'https://user:pass@'), legacy.replace('.com/', '.com:444/'), legacy.replace('global-image1', 'global-image2')]) {
    assert.throws(() => imageUrl(bad), /Unapproved/);
  }
  await assert.rejects(boundedGet(legacy, { validate: imageUrl, fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }) }), /Unapproved/);
});

test('Protection HTML never becomes a photo, even when HTTP is 200', async t => {
  const out = await temp(t);
  const photos = await downloadPhotos(normalizeCard(raw(), URL), out, { fetchImpl: async () => new Response('<html>captcha</html>', { headers: { 'content-type': 'image/jpeg' } }) });
  assert.equal(photos[0].status, 'error');
  assert.equal(photos[0].file, undefined);
  assert.equal(isChallenge({ title: 'Security Verification' }), true);
});

test('Photo resume verifies hashes and repairs missing/corrupt files', async t => {
  const out = await temp(t); const card = normalizeCard(raw(), URL); let calls = 0;
  const fetchImpl = async () => { calls++; return new Response(Buffer.from([255, 216, 255, 0, 255, 217]), { headers: { 'content-type': 'image/jpeg' } }); };
  card.photos = await downloadPhotos(card, out, { fetchImpl });
  assert.equal(await verifiedPhoto(out, card.photos[0]), true);
  card.photos = await downloadPhotos(card, out, { fetchImpl });
  assert.equal(calls, 1); assert.equal(card.photos[0].reused, true);
  await fs.writeFile(path.join(out, card.photos[0].file), 'broken');
  card.photos = await downloadPhotos(card, out, { fetchImpl });
  assert.equal(calls, 2); assert.equal(await verifiedPhoto(out, card.photos[0]), true);
});

test('Bounded download rejects both advertised and streamed excessive size', async () => {
  await assert.rejects(boundedGet(IMAGE, { validate: imageUrl, maxBytes: 3, fetchImpl: async () => new Response('1234') }), /too large/);
  await assert.rejects(boundedGet(IMAGE, { validate: imageUrl, maxBytes: 3, fetchImpl: async () => new Response('1', { headers: { 'content-length': '9' } }) }), /too large/);
});

test('Incomplete sitemap does not claim that missing cars are absent', async t => {
  const out = await temp(t);
  const index = await loadChinaIndex(out, { textLoader: async url => {
    if (url.endsWith('_index.xml')) return '<sitemapindex><sitemap><loc>https://www.guazi.com/guazisou/cardetail/pc_cardetail_md_1.xml</loc></sitemap></sitemapindex>';
    throw new Error('HTTP 503');
  } });
  assert.equal(index.complete, false); assert.equal(index.errors.length, 1);
});

test('Blocked browser checkpoints progress and a subsequent run resumes without rereading finished cards', async t => {
  const out = await temp(t); const url2 = URL.replace('y2ud7mtru4', 'aaaaaaaaaa');
  const o = options(['--url', URL, '--url', url2, '--limit', '2', '--photos', '0', '--skip-china', '--out', out]);
  const visited = []; let blocked = true;
  const browserFactory = async () => ({
    card: async url => {
      visited.push(url);
      if (url === url2 && blocked) throw new SourceBlocked(url);
      return { url, observedAt: '2026-09-26T09:00:00Z', rawData: raw({ productId: url === URL ? 'y2ud7mtru4' : 'aaaaaaaaaa' }) };
    }, close: async () => {},
  });
  const first = await runPilot(o, { browserFactory, log: quiet });
  assert.equal(first.status, 'blocked'); assert.equal(first.cards, 1);
  blocked = false;
  const second = await runPilot(o, { browserFactory, log: quiet });
  assert.equal(second.status, 'complete'); assert.equal(second.cards, 2);
  assert.equal(visited.filter(u => u === URL).length, 1);
  assert.equal((await readJson(path.join(out, 'cards/y2ud7mtru4.json'))).availability.status, 'unverified');
  assert.equal(second.catalogModified, false);
});

test('Discovery follows actual pagination, deduplicates IDs and filters a non-BEV', async t => {
  const out = await temp(t); const url2 = URL.replace('y2ud7mtru4', 'aaaaaaaaaa');
  const url3 = URL.replace('y2ud7mtru4', 'bbbbbbbbbb');
  const seed = 'https://en.guazi.com/used-cars/tesla/'; const next = seed + 'page2/'; const pages = [];
  const o = options(['--seed', seed, '--limit', '2', '--photos', '0', '--skip-china', '--out', out]);
  const result = await runPilot(o, { log: quiet, browserFactory: async () => ({
    listing: async url => { pages.push(url); return { products: url === seed ? [URL, url2] : [URL, url3], pages: url === seed ? [{ page: 2, url: next }] : [] }; },
    card: async url => {
      const r = raw({ productId: url.match(/-([a-z0-9]{10})\.html$/)[1] });
      if (url === url2) r.vehicleDetails.find(d => d.key === 'fuel').value = 'PHEV';
      return { url, rawData: r };
    }, close: async () => {},
  }) });
  assert.deepEqual(pages, [seed, next]); assert.equal(result.discoveredUnique, 3);
  assert.equal(result.cards, 2); assert.equal(result.skipped, 1);
});

test('CLI refuses production output and unknown options', () => {
  assert.throws(() => options(['--out', 'public/data']), /runtime/);
  assert.throws(() => options(['--image', 'huge']), /preview/);
  assert.throws(() => options(['--unknown']));
  assert.throws(() => options(['--transport', 'unknown']), /transport/);
});

test('Session HTTP extracts the requested card and releases every response, including protection HTML', async () => {
  let disposed = 0;
  const request = (html, status = 200, headers = {}) => ({ get: async (url, opts) => {
    assert.equal(opts.maxRedirects, 0);
    return { status: () => status, url: () => url, headers: () => headers, body: async () => Buffer.from(html), dispose: async () => { disposed++; } };
  } });
  const html = `<html><script>throw new Error('must not execute')</script><script>${push(`0:${JSON.stringify({ rawData: raw() })}\n`)}</script></html>`;
  assert.equal((await readSessionCard(request(html), URL)).rawData.productId, 'y2ud7mtru4');
  await assert.rejects(readSessionCard(request('<title>Security Verification</title>'), URL), { code: 'SOURCE_BLOCKED' });
  await assert.rejects(readSessionCard(request('<script>obfuscatedProtection()</script>'), URL), { code: 'SOURCE_BLOCKED' });
  await assert.rejects(readSessionCard(request('', 429), URL), { code: 'SOURCE_BLOCKED' });
  await assert.rejects(readSessionCard(request('', 567), URL), { code: 'SOURCE_BLOCKED', status: 567, retryAfterMs: 30000 });
  await assert.rejects(readSessionCard(request('', 429, { 'retry-after': '120' }), URL), { code: 'SOURCE_BLOCKED', retryAfterMs: 120000 });
  await assert.rejects(readSessionCard(request(html.replaceAll('y2ud7mtru4', 'aaaaaaaaaa')), URL), /No complete/);
  assert.equal(disposed, 7);
});

test('Parallel browser readers are bounded and never overfill the accepted-card limit', async t => {
  const out = await temp(t);
  const urls = Array.from({ length: 12 }, (_, i) => URL.replace('y2ud7mtru4', String(i).padStart(10, '0')));
  const o = options([...urls.flatMap(u => ['--url', u]), '--limit', '5', '--workers', '3', '--photos', '0', '--skip-china', '--out', out]);
  let active = 0, peak = 0, readers = 0;
  const result = await runPilot(o, { log: quiet, browserFactory: async () => ({
    worker: async () => { readers++; let busy = false; return { card: async url => {
      assert.equal(busy, false); busy = true; active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 10)); active--; busy = false;
      return { url, rawData: raw({ productId: url.match(/-([a-z0-9]{10})\.html$/)[1] }) };
    } }; }, close: async () => {},
  }) });
  assert.equal(result.cards, 5); assert.equal(peak, 3); assert.equal(readers, 3);
  assert.equal((await fs.readdir(path.join(out, 'cards'))).length, 5);
});

test('The shared photo limiter bounds complete jobs across several cards', async () => {
  const schedule = limiter(2); let active = 0, peak = 0;
  await mapLimit(Array.from({ length: 9 }), 5, () => schedule(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(r => setTimeout(r, 5)); active--;
  }));
  assert.equal(peak, 2); assert.equal(active, 0);
});

test('A worker failure waits for remaining in-flight IO before releasing resources', async () => {
  let finished = false;
  await assert.rejects(mapLimit([0, 1], 2, async i => {
    if (i === 0) throw new Error('disk error');
    await new Promise(r => setTimeout(r, 5)); finished = true;
  }), /disk error/);
  assert.equal(finished, true);
});

test('Processing saved captures never opens a browser or reports a network collection rate', async t => {
  const out = await temp(t);
  const incoming = path.join(out, 'incoming');
  await fs.mkdir(incoming);
  await fs.writeFile(path.join(incoming, 'sample.json'), JSON.stringify({ url: URL, rawData: raw() }));
  const o = options(['--capture-dir', incoming, '--limit', '1', '--photos', '0', '--skip-china', '--out', out]);
  const result = await runPilot(o, { log: quiet, browserFactory: async () => { throw new Error('Must not launch'); } });
  assert.equal(result.cards, 1);
  assert.equal(result.cardInput, 'saved_captures');
  assert.equal(result.newCardsPerSecond, null);
});

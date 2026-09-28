import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildGuaziPreviewCard, publicGuaziPreviewSource } from '../scripts/lib/guazi-preview-card.mjs';
import { guaziLocalPreview } from '../scripts/vite-guazi-preview.mjs';
import { shippedFlag } from '../src/feature-flags.js';

test('preview is excluded from production and only serves exact photo paths', async () => {
  assert.equal(shippedFlag('GUAZI_PREVIEW_ENABLED'), false);
  const plugin = guaziLocalPreview();
  assert.equal(plugin.apply, 'serve');
  let handler;
  plugin.configureServer({ config: { root: '/nonexistent', logger: { warn() {} } }, middlewares: { use(fn) { handler = fn; } } });
  for (const url of ['/__local-guazi/source.json', '/__local-guazi/guazi-session.json', '/__local-guazi/photos/other/01-0123456789abcdef.jpg', '/__local-guazi/%2e%2e/source.json']) {
    let code; let passed = false;
    await handler({url, method:'GET'}, {setHeader(){},writeHead(value){code=value;},end(){}}, () => {passed=true;});
    assert.equal(code, 404, url); assert.equal(passed, false);
  }
  let passed = false;
  await handler({url:'/api/cars/ordinary-car',method:'GET'}, {}, () => {passed = true;});
  assert.equal(passed,true);
});

test('public sample works without reading the full report and preserves only public facts', async t => {
  let source, photos;
  try {
    [source, photos] = await Promise.all(['source.json','photos.json'].map(file => readFile(new URL(`../runtime/local-guazi-preview/${file}`, import.meta.url), 'utf8').then(JSON.parse)));
  } catch (error) { if (error.code === 'ENOENT') { t.skip('Local captured sample is not stored in Git'); return; } throw error; }
  // Any accidental dependency on private data must fail, even if a previous run saved it.
  Object.defineProperty(source.inspection, 'full', { get() { throw new Error('Authenticated report must not be read'); } });
  const publicSource = publicGuaziPreviewSource(source);
  assert.deepEqual(Object.keys(publicSource.inspection), ['exportGrade']);
  const galleryUrls = new Set(source.images.map(image => image.sourceUrl));
  const galleryPhotos = photos.filter(photo => galleryUrls.has(photo.url));
  const card = buildGuaziPreviewCard(source, galleryPhotos);
  assert.deepEqual(card, buildGuaziPreviewCard(publicSource, galleryPhotos));
  assert.equal(card.images.length, 27);
  assert.equal(card.technicalSpecs.count, 89);
  assert.equal(card.conditionGrade, 'A'); assert.equal(card.chinaGrade, 'B');
  assert.equal(card.conditionGradeLabel, 'Оценка в карточке');
  assert.equal(card.appearanceScore, 85); assert.equal(card.batteryHealth, 92);
  assert.equal(card.insuranceClaims, 2); assert.equal(card.transfers, 1);
  assert.equal(card.chinaPrice, 181000);
  assert.equal(card.priceBasis, 'FOB');
  assert.equal(card.fobPriceUsd, 28748);
  assert.equal(card.fobPort, 'Horgos');
  assert.equal(card.usdPrice, undefined, 'FOB stays in a distinct field');
  assert.throws(() => buildGuaziPreviewCard({...source, prices: source.prices.filter(p=>p.port!=='Horgos, China')}, galleryPhotos), /Missing FOB quote/);
  const withoutChina = buildGuaziPreviewCard({...publicSource, china: undefined}, galleryPhotos);
  assert.equal(withoutChina.fobPriceUsd, 28748);
  assert.equal(withoutChina.chinaPrice, null);
  assert.equal(card.inspectionReport, undefined);
  assert.match(card.conditionSummary, /ремонт задней панели и правого нижнего бокового элемента/);
  assert.doesNotMatch(card.conditionSummary, /деформац|8 см|600|крышк|диск|зарядн/);
  assert.throws(() => buildGuaziPreviewCard(source, galleryPhotos.slice(1)), /Missing local photo/);
  // A missing public grade or repair excerpt must not fall back to private report facts.
  const sparse = { ...publicSource, inspection: {}, china: { ...publicSource.china, condition: { ...publicSource.china.condition, repairExcerpts: [] } } };
  const sparseCard = buildGuaziPreviewCard(sparse, galleryPhotos);
  assert.equal(sparseCard.conditionGrade, null);
  assert.equal(sparseCard.conditionSummary, null);
});

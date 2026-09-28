// Public Guazi data only. This module deliberately has no catalog/DB imports.
import { isAllowedImportBrand, canonicalImportBrand } from '../../config/import-policy.mjs';
import { normalizeGuaziSpecs } from './guazi-pilot-specs.mjs';
import { chinaFields, chinaCondition } from './guazi-pilot-condition.mjs';

export const CHINA_INDEX = 'https://www.guazi.com/guazisou/cardetail/pc_cardetail_md_index.xml';
export const IMAGE_HOSTS = new Set(['global-image-pub.guazistatic-global.com', 'image-oversea.guazistatic-global.com', 'image-public.guazistatic.com', 'global-image1.guazistatic-global.com']);

export function sourceUrl(value, kind = 'product') {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port) throw new Error('Unsafe source URL');
  const patterns = {
    product: ['en.guazi.com', /^\/products\/[^/]+-([a-z0-9]{10})\.html$/],
    listing: ['en.guazi.com', /^\/used-cars(?:\/[^?#]*)?\/?$/],
    sitemap: ['www.guazi.com', /^\/guazisou\/cardetail\/pc_cardetail_md_(?:index|\d+)\.xml$/],
    markdown: ['www.guazi.com', /^\/car-detail\/c\d{14,15}\.md$/],
    report: ['en.guazi.com', /^\/report\/?$/],
  };
  const [host, pattern] = patterns[kind] || [];
  if (u.hostname !== host || !pattern?.test(u.pathname)) throw new Error(`Unexpected ${kind} URL`);
  u.hash = '';
  return u.href;
}

export function productId(url) {
  return new URL(sourceUrl(url)).pathname.match(/-([a-z0-9]{10})\.html$/)[1];
}

export function imageUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !IMAGE_HOSTS.has(u.hostname) || u.port || u.username || u.password) throw new Error('Unapproved image URL');
  u.hash = '';
  return u.href;
}

export function previewUrl(value) {
  const u = new URL(imageUrl(value));
  const processing = u.searchParams.get('x-bce-process') || 'image';
  // Replace a previous resize, preserving source format/quality operations.
  const operations = processing.split('/').filter(p => !p.startsWith('resize,'));
  u.searchParams.set('x-bce-process', [...operations, 'resize,m_lfit,w_600'].join('/'));
  return u.href;
}

export function isChallenge({ title = '', text = '' }) {
  return /security verification|verify (?:that )?you are human|access denied|too many requests|Tencent Cloud EdgeOne|captcha/i.test(`${title}\n${text}`);
}

// Read JSON embedded by Next.js; never execute downloaded scripts. Concatenation
// handles Flight records split over several script tags. Resolve plain model refs.
export function extractRawData(scripts, expectedId) {
  const chunks = [];
  for (const script of scripts) {
    const m = script.trim().match(/^self\.__next_f\.push\(([\s\S]*)\);?$/);
    if (!m) continue;
    try { const p = JSON.parse(m[1]); if (p[0] === 1 && typeof p[1] === 'string') chunks.push(p[1]); } catch { /* Not a JSON Flight push. */ }
  }
  const records = new Map();
  for (const line of chunks.join('').split('\n')) {
    const m = line.match(/^([a-f\d]+):([\s\S]*)$/i);
    if (!m) continue;
    try { records.set(m[1], JSON.parse(m[2])); } catch { /* Hints, text and module records aren't models. */ }
  }
  const resolve = (value, visited = new Set()) => {
    if (typeof value === 'string' && /^\$[a-f\d]+$/i.test(value)) {
      const id = value.slice(1);
      if (records.has(id) && !visited.has(id)) return resolve(records.get(id), new Set([...visited, id]));
    }
    if (Array.isArray(value)) return value.map(v => resolve(v, visited));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, visited)]));
    return value;
  };
  for (const record of records.values()) {
    const stack = [record];
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== 'object') continue;
      if (value.rawData) {
        const raw = resolve(value.rawData);
        if (raw?.productId === expectedId && Array.isArray(raw.images)) return raw;
      }
      stack.push(...Object.values(value));
    }
  }
  throw new Error(`No complete rawData for ${expectedId}`);
}

export function numeric(value) {
  if (value == null || String(value).trim() === '') return null;
  const m = String(value).replaceAll(',', '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function normalizeCard(raw, url, observedAt = new Date().toISOString()) {
  const id = productId(url);
  if (raw?.productId !== id || !/^\d{8,9}$/.test(String(raw.clueId))) throw new Error('Card identity mismatch');
  if (!Array.isArray(raw.images) || !raw.images.length) throw new Error('Missing gallery');
  const entries = [...(raw.mainVehicleDetails || []), ...(raw.vehicleDetails || [])];
  const details = Object.fromEntries(entries.filter(x => x?.key).map(x => [x.key, x.value]));
  const brand = canonicalImportBrand(raw.makeNameEn || '');
  const year = numeric(details.modelYear);
  const fuel = String(details.fuel || '').trim();
  const violations = [];
  if (!isAllowedImportBrand(brand)) violations.push('brand');
  if (year == null || year < 2020) violations.push('model_year');
  if (fuel !== 'BEV') violations.push('not_confirmed_bev');
  const groups = [['exterior', raw.exteriorImageList], ['interior', raw.interiorImageList], ['detail', raw.detailImageList]];
  const images = raw.images.map((img, index) => ({
    position: index + 1, sourceIndex: img.ind ?? null, alt: img.alt || '',
    groups: groups.filter(([, list]) => list?.some(x => x.imgUrl === img.imgUrl)).map(([name]) => name),
    sourceUrl: imageUrl(img.imgUrl || img.smallImgUrl),
    previewSourceUrl: img.smallImgUrl ? imageUrl(img.smallImgUrl) : null,
    urlType: img.urlType ?? null,
  }));
  return {
    schemaVersion: 2, productId: id, clueId: String(raw.clueId), sourceUrl: sourceUrl(url), observedAt,
    title: raw.title, brand, model: raw.modelName ?? null, modelYear: year,
    fuel, mileageKm: numeric(details.mileage), firstRegistration: details.regDate ?? null,
    manufactureDate: details.mfgDate ?? null, vin: details.vin ?? null, location: details.location ?? null,
    specifications: details, batteryHealth: raw.batteryHealth ?? null,
    ...normalizeGuaziSpecs(raw, details),
    prices: (raw.prices || []).map(p => ({ amount: numeric(p.price), currency: 'USD', basis: 'FOB', port: p.enName, portCode: p.code, isDefault: p.isDefault === 1, sourceValue: p.price })),
    inspection: { exportGrade: raw.reportDetailLite?.baseInfo?.level ?? null, lite: raw.reportDetailLite ?? null, full: { status: 'not_requested' } },
    images, china: { status: 'pending' }, conflicts: [],
    // Observing a page is not evidence that a car is active or was just listed.
    availability: { status: 'unverified', sourceDisplayStatus: raw.displayStatus ?? null },
    sourceListedAt: null, selection: { eligible: violations.length === 0, violations },
  };
}

export function sitemapLocations(xml) {
  if (!/<(?:sitemapindex|urlset)\b/i.test(xml)) throw new Error('Not a sitemap');
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(m => m[1].trim().replaceAll('&amp;', '&'));
}

export function parseChinaMarkdown(markdown, url, clueId) {
  const clean = sourceUrl(url, 'markdown');
  const expectedId = new URL(clean).pathname.match(/\/(c\d{14,15})\.md$/)[1];
  const fields = chinaFields(markdown);
  if (fields.id !== expectedId || expectedId.slice(1, -6) !== String(clueId)) throw new Error('Chinese identity mismatch');
  if (!fields.model || !fields.mileage || !fields.first_register) throw new Error('Incomplete Chinese description');
  return {
    sourceUrl: clean, fetchedAt: new Date().toISOString(), fields,
    price: { amount: numeric(fields.full_payment), currency: 'CNY', basis: 'domestic_listing' },
    grade: fields.condition_grade ?? null, mileageKm: numeric(fields.mileage) == null ? null : numeric(fields.mileage) * (/万/.test(fields.mileage) ? 10000 : 1),
    firstRegistration: fields.first_register, transferCount: numeric(fields.transfer_times),
    condition: chinaCondition(fields),
    generatedAt: fields.generatedAt ?? null,
  };
}

export function matchChina(card, china) {
  const normalizeMonth = s => String(s || '').replaceAll('.', '-').slice(0, 7);
  const mismatch = [];
  if (card.mileageKm == null || china.mileageKm == null || !card.firstRegistration || !china.firstRegistration) mismatch.push('insufficient_match_facts');
  if (card.mileageKm != null && china.mileageKm !== card.mileageKm) mismatch.push('mileage');
  if (card.firstRegistration && normalizeMonth(card.firstRegistration) !== normalizeMonth(china.firstRegistration)) mismatch.push('first_registration');
  const conflicts = [];
  if (china.grade && card.inspection.exportGrade && china.grade !== card.inspection.exportGrade) conflicts.push({ field: 'condition_grade', export: card.inspection.exportGrade, china: china.grade });
  return { ...china, status: mismatch.length ? 'needs_review' : 'matched', matchBasis: 'clue_id_prefix_and_available_facts', mismatches: mismatch, conflicts };
}

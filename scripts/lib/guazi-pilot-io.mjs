import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CHINA_INDEX, sourceUrl, imageUrl, previewUrl, sitemapLocations } from './guazi-pilot-data.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function readJson(file, fallback = null) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, data, { mode: 0o600 });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}

export const writeJson = (file, data) => atomicWrite(file, JSON.stringify(data, null, 2) + '\n');

export async function boundedGet(url, { validate, maxBytes = 8 * 1024 * 1024, timeout = 30000, fetchImpl = fetch } = {}) {
  let current = validate(url);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(current, {
      redirect: 'manual', signal: AbortSignal.timeout(timeout),
      headers: { 'User-Agent': 'Abcars-Guazi-Pilot/0.1', Accept: '*/*' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without Location');
      current = validate(new URL(location, current).href);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status}`); }
    if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw new Error('Response too large'); }
    const chunks = []; let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > maxBytes) throw new Error('Response too large');
      chunks.push(chunk);
    }
    return { bytes: Buffer.concat(chunks), contentType: response.headers.get('content-type') || '', url: current };
  }
  throw new Error('Too many redirects');
}

export async function getText(url, kind, { fetchImpl = fetch } = {}) {
  // Recognize the access check without following it or relaxing the URL allowlist.
  const validate = u => {
    const target = new URL(u);
    if (['markdown', 'sitemap'].includes(kind) && target.protocol === 'https:' && target.host === 'uc.guazi.com' && target.pathname === '/guazi-mall-ucenter/captcha') {
      throw Object.assign(new Error('Chinese descriptions require an access check'), { code: 'CHINA_ACCESS_CHECK' });
    }
    return sourceUrl(u, kind);
  };
  const result = await boundedGet(url, { validate, fetchImpl, maxBytes: 12 * 1024 * 1024 });
  return result.bytes.toString('utf8');
}

export async function mapLimit(items, count, fn) {
  const results = new Array(items.length); let cursor = 0;
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(count, items.length) }, async () => {
    while (cursor < items.length) { const i = cursor++; results[i] = await fn(items[i], i); }
  }));
  const failed = outcomes.find(o => o.status === 'rejected');
  if (failed) throw failed.reason;
  return results;
}

// Bounds whole download jobs, including reading the response body, not only headers.
export function limiter(count) {
  let active = 0; const waiting = [];
  return async job => {
    if (active >= count) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try { return await job(); }
    finally { const next = waiting.shift(); if (next) next(); else active--; }
  };
}

export async function loadChinaIndex(out, { refresh = false, textLoader = getText } = {}) {
  const file = path.join(out, 'china-index.json');
  const cached = await readJson(file);
  if (!refresh && cached?.complete && Date.now() - Date.parse(cached.fetchedAt) < 24 * 60 * 60 * 1000) return cached;
  const result = { sourceUrl: CHINA_INDEX, fetchedAt: new Date().toISOString(), complete: false, entries: {}, sitemaps: [], errors: [] };
  try {
    const maps = sitemapLocations(await textLoader(CHINA_INDEX, 'sitemap')).map(url => sourceUrl(url, 'sitemap'));
    if (!maps.length || maps.length > 100 || maps.includes(CHINA_INDEX)) throw new Error('Unexpected sitemap index');
    const pages = await mapLimit(maps, 2, async url => {
      try { return { url, links: sitemapLocations(await textLoader(url, 'sitemap')) }; }
      catch (e) { return { url, error: e.message }; }
    });
    for (const page of pages) {
      result.sitemaps.push({ url: page.url, count: page.links?.length ?? 0 });
      if (page.error) { result.errors.push({ url: page.url, error: page.error }); continue; }
      for (const link of page.links) {
        try {
          const url = sourceUrl(link, 'markdown');
          const id = new URL(url).pathname.match(/\/c(\d{8,9})\d{6}\.md$/)[1];
          const list = result.entries[id] ||= [];
          if (!list.includes(url)) list.push(url);
        } catch (e) { result.errors.push({ url: link, error: e.message }); }
      }
    }
    result.complete = result.errors.length === 0 && Object.keys(result.entries).length > 0;
  } catch (e) { result.errors.push({ url: CHINA_INDEX, error: e.message }); }
  await writeJson(file, result);
  return result;
}

export function imageFormat(bytes, contentType) {
  const mime = contentType.split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpeg' && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'jpg';
  if (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (mime === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  throw new Error('Response is not a supported image (MIME/signature)');
}

export async function verifiedPhoto(out, photo) {
  if (photo?.status !== 'saved' || !/^photos\/[a-z0-9]{10}\/\d+-[a-f0-9]{16}\.(jpg|png|webp)$/.test(photo.file || '')) return false;
  try { const bytes = await fs.readFile(path.join(out, photo.file)); return bytes.length === photo.bytes && sha256(bytes) === photo.sha256; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

export async function downloadPhotos(card, out, { count = 5, mode = 'preview', concurrency = 3, fetchImpl = fetch, schedule = job => job() } = {}) {
  const selected = count === 'all' ? card.images : card.images.slice(0, count);
  return mapLimit(selected, concurrency, async img => {
    const url = mode === 'large' ? img.sourceUrl : previewUrl(img.previewSourceUrl || img.sourceUrl);
    const previous = card.photos?.find(p => p.url === url && p.position === img.position);
    if (await verifiedPhoto(out, previous)) return { ...previous, reused: true };
    const photo = { position: img.position, url, mode, status: 'error', attemptedAt: new Date().toISOString() };
    try {
      const response = await schedule(() => boundedGet(url, { validate: imageUrl, fetchImpl }));
      const ext = imageFormat(response.bytes, response.contentType);
      const file = `photos/${card.productId}/${String(img.position).padStart(2, '0')}-${sha256(url).slice(0, 16)}.${ext}`;
      await atomicWrite(path.join(out, file), response.bytes);
      return { ...photo, status: 'saved', file, bytes: response.bytes.length, sha256: sha256(response.bytes), contentType: response.contentType, reused: false };
    } catch (e) { return { ...photo, error: e.message }; }
  });
}

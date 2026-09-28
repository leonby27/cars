#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeCard, productId, sourceUrl, parseChinaMarkdown, matchChina } from './lib/guazi-pilot-data.mjs';
import { readJson, writeJson, atomicWrite, getText, loadChinaIndex, downloadPhotos, mapLimit, limiter } from './lib/guazi-pilot-io.mjs';
import { openGuaziBrowser } from './lib/guazi-pilot-browser.mjs';
import { normalizeGuaziReport } from './lib/guazi-pilot-report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `Guazi pilot: isolated files only, no catalog or database writes.
npm run pilot:guazi -- [options]
  --seed URL          Listing URL (repeatable; default: Tesla)
  --url URL           Specific product URL (repeatable; no listing discovery)
  --limit N           Total eligible cards in this run directory (default 5)
  --pages N           Max listing pages per seed, including resumed pages (default 2)
  --workers N         Parallel card readers (default 4, max 6)
  --transport MODE    navigation (default) or session-http (server bulk mode)
  --request-interval N Minimum global ms between session HTTP requests (default 400)
  --verify-checkbox   Allow one attempt at the observed EdgeOne checkbox per run
  --photo-workers N   Parallel CDN downloads across all cars (default 8, max 12)
  --photos N|all      Photos per card (default 5, 0 disables)
  --image preview|large  600px preview or source-supplied large image
  --out PATH          Subdirectory of abcars/runtime (default runtime/guazi-pilot)
  --profile PATH      Persistent Chromium profile (default runtime/guazi-profile)
  --cdp URL           Attach to an already exposed local browser endpoint
  --headless          Optional; may encounter EdgeOne
  --delay N           Minimum milliseconds between browser visits (default 1000)
  --reports          Attempt authenticated full-report capture (experimental)
  --auth-state PATH  Owner-only JSON with explicitly authorized en.guazi.com cookies
  --skip-china        Do not read Chinese sitemaps/descriptions
  --refresh-index     Rebuild Chinese index (otherwise cache for 24h)
  --capture-dir PATH  Process saved {url,observedAt,rawData} JSON files without browser
  --help
Re-run the same command to resume; use a new --out directory for a fresh snapshot.
Exit codes: 0 selected stages complete, 2 source blocked, 3 partial, 1 fatal.
`;

export function options(argv) {
  const { values: v } = parseArgs({ args: argv, options: {
    seed: { type: 'string', multiple: true }, url: { type: 'string', multiple: true },
    limit: { type: 'string', default: '5' }, pages: { type: 'string', default: '2' },
    workers: { type: 'string', default: '4' }, 'photo-workers': { type: 'string', default: '8' },
    transport: { type: 'string', default: 'navigation' },
    'request-interval': { type: 'string', default: '400' },
    'verify-checkbox': { type: 'boolean', default: false },
    photos: { type: 'string', default: '5' }, image: { type: 'string', default: 'preview' },
    out: { type: 'string', default: 'runtime/guazi-pilot' }, profile: { type: 'string', default: 'runtime/guazi-profile' },
    cdp: { type: 'string' }, headless: { type: 'boolean', default: false },
    'auth-state': { type: 'string' },
    delay: { type: 'string', default: '1000' }, reports: { type: 'boolean', default: false },
    'skip-china': { type: 'boolean', default: false }, 'refresh-index': { type: 'boolean', default: false },
    'capture-dir': { type: 'string' }, help: { type: 'boolean', default: false },
  } });
  if (v.help) return { help: true };
  const integer = (value, min, max) => { const n = Number(value); if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Invalid numeric option: ${value}`); return n; };
  const out = path.resolve(ROOT, v.out);
  if (!out.startsWith(path.join(ROOT, 'runtime') + path.sep)) throw new Error('--out must be a subdirectory of abcars/runtime');
  if (!['preview', 'large'].includes(v.image)) throw new Error('--image must be preview or large');
  if (!['navigation', 'session-http'].includes(v.transport)) throw new Error('--transport must be navigation or session-http');
  if (v['capture-dir'] && (v.seed || v.url || v.reports)) throw new Error('--capture-dir cannot be combined with --seed, --url or --reports');
  return {
    out, profile: path.resolve(ROOT, v.profile), cdp: v.cdp, headless: v.headless, transport: v.transport, verifyCheckbox: v['verify-checkbox'],
    seeds: v.url || v['capture-dir'] ? [] : (v.seed || ['https://en.guazi.com/used-cars/tesla/']).map(u => sourceUrl(u, 'listing')),
    urls: (v.url || []).map(u => sourceUrl(u)), limit: integer(v.limit, 1, 100000), pages: integer(v.pages, 1, 10000),
    workers: integer(v.workers, 1, 6), photoWorkers: integer(v['photo-workers'], 1, 12),
    requestInterval: integer(v['request-interval'], 250, 60000),
    photos: v.photos === 'all' ? 'all' : integer(v.photos, 0, 1000), image: v.image,
    delay: integer(v.delay, 250, 60000), reports: v.reports, skipChina: v['skip-china'], refreshIndex: v['refresh-index'],
    captureDir: v['capture-dir'] ? path.resolve(v['capture-dir']) : null,
    authState: v['auth-state'] ? path.resolve(v['auth-state']) : null,
  };
}

export async function runPilot(o, { browserFactory = openGuaziBrowser, textLoader = getText, fetchImpl = fetch, log = console.log } = {}) {
  await fs.mkdir(o.out, { recursive: true, mode: 0o700 });
  // Reject symlinked output roots so a pilot cannot write into a production tree.
  const realOut = await fs.realpath(o.out);
  const runtime = await fs.realpath(path.join(ROOT, 'runtime'));
  if (!realOut.startsWith(runtime + path.sep)) throw new Error('Output resolves outside runtime');
  const lockFile = path.join(o.out, '.lock');
  const lock = await fs.open(lockFile, 'wx', 0o600).catch(e => { if (e.code === 'EEXIST') throw new Error('Output is locked; see GUAZI_PILOT.md'); throw e; });
  await lock.writeFile(String(process.pid));
  let browser, browserPromise, browserAccess = null, state, report;
  const errors = [];
  const timings = {}; let phaseStart = Date.now(); let initialCardCount = 0;
  const startedAt = new Date().toISOString();
  const stateFile = path.join(o.out, 'checkpoint.json');
  const cardFile = id => path.join(o.out, 'cards', `${id}.json`);
  const captureFile = id => path.join(o.out, 'raw', `${id}.json`);
  let stateWrites = Promise.resolve();
  const saveState = () => stateWrites = stateWrites.then(() => writeJson(stateFile, state));
  const getBrowser = () => browserPromise ||= browserFactory(o).then(b => (browser = b));
  try {
    state = await readJson(stateFile, { schemaVersion: 1, candidates: [], discovery: {}, attempts: {}, skipped: {}, cards: [], createdAt: startedAt });
    initialCardCount = state.cards.length;
    const knownIds = new Set(state.candidates.map(c => c.id));
    const add = url => { const id = productId(url); if (!knownIds.has(id)) { knownIds.add(id); state.candidates.push({ id, url }); } };
    o.urls.forEach(add);
    if (o.captureDir) {
      for (const name of (await fs.readdir(o.captureDir)).filter(n => n.endsWith('.json')).sort()) {
        const capture = await readJson(path.join(o.captureDir, name));
        normalizeCard(capture.rawData, capture.url, capture.observedAt); // Validate before writing or queueing.
        add(capture.url);
        await writeJson(captureFile(productId(capture.url)), capture);
      }
    }
    await saveState();
    // Discover only links provided by pagination; each page is checkpointed.
    for (const seed of o.seeds) {
      const discovery = state.discovery[seed] ||= { visited: [], next: seed, exhausted: false };
      while (discovery.next && discovery.visited.length < o.pages) {
        const url = sourceUrl(discovery.next, 'listing');
        const page = await (await getBrowser()).listing(url);
        page.products.forEach(add);
        discovery.visited.push({ url, observedAt: page.observedAt, positions: page.products.length });
        const current = Number(new URL(url).pathname.match(/\/page(\d+)\/?$/)?.[1] || 1);
        const next = page.pages.find(p => p.page === current + 1);
        discovery.next = next ? sourceUrl(next.url, 'listing') : null;
        discovery.exhausted = !next;
        await saveState();
        log(JSON.stringify({ stage: 'discovery', pages: discovery.visited.length, unique: state.candidates.length }));
      }
    }
    timings.discoverySeconds = (Date.now() - phaseStart) / 1000;
    phaseStart = Date.now();
    const savedIds = new Set(state.cards);
    const pending = state.candidates.filter(c => !savedIds.has(c.id) && !state.skipped[c.id]);
    let cursor = 0, blocked = null, commits = Promise.resolve(), completed = 0, consecutiveErrors = 0;
    await Promise.all(Array.from({ length: o.workers }, async () => {
      let reader;
      while (cursor < pending.length && state.cards.length < o.limit && !blocked) {
        const candidate = pending[cursor++];
        state.attempts[candidate.id] = (state.attempts[candidate.id] || 0) + 1;
        try {
          let capture = await readJson(captureFile(candidate.id));
          if (!capture) {
            if (o.captureDir) throw new Error('Missing captured card');
            if (!reader) { const b = await getBrowser(); reader = b.worker ? await b.worker() : b; }
            capture = await reader.card(candidate.url);
            normalizeCard(capture.rawData, candidate.url, capture.observedAt);
            await writeJson(captureFile(candidate.id), capture);
          }
          const card = normalizeCard(capture.rawData, candidate.url, capture.observedAt);
          consecutiveErrors = 0;
          const commit = commits.then(async () => {
            if (!card.selection.eligible) state.skipped[candidate.id] = card.selection.violations;
            else if (state.cards.length < o.limit) { await writeJson(cardFile(card.productId), card); state.cards.push(card.productId); }
            completed++;
            if (completed % 25 === 0) { await saveState(); log(JSON.stringify({ stage: 'cards', cards: state.cards.length, seconds: (Date.now() - phaseStart) / 1000 })); }
          });
          commits = commit.catch(() => {});
          await commit;
        } catch (e) {
          if (e.code === 'SOURCE_BLOCKED') { blocked = e; break; }
          errors.push({ stage: 'card', productId: candidate.id, error: e.message });
          if (++consecutiveErrors >= 3) blocked = new Error(`Three consecutive card failures: ${e.message}`);
        }
      }
    }));
    await commits;
    await saveState();
    timings.detailSeconds = (Date.now() - phaseStart) / 1000;
    if (blocked) throw blocked;
    state.status = 'captured';
  } catch (e) {
    errors.push({ stage: 'browser', code: e.code || 'ERROR', error: e.message, url: e.url });
    if (state) state.status = e.code === 'SOURCE_BLOCKED' ? 'blocked' : 'partial';
  }
  try {
    phaseStart = Date.now();
    // Card collection is finished; release server RAM/CPU during CDN/Markdown IO.
    if (browser && !o.reports) { browserAccess = browser.metrics ?? null; await browser.close(); browser = null; browserPromise = null; }
    if (!state) throw new Error('Unable to load checkpoint');
    const ids = state.cards.slice(0, o.limit);
    let index = null;
    if (!o.skipChina && ids.length) {
      index = await loadChinaIndex(o.out, { refresh: o.refreshIndex, textLoader });
      log(JSON.stringify({ stage: 'china-index', complete: index.complete, identities: Object.keys(index.entries).length }));
    }
    const photoSchedule = limiter(o.photoWorkers);
    const reportSchedule = limiter(1);
    let reportNeedsLogin = false;
    let stored = 0;
    const cards = (await mapLimit(ids, 4, async id => {
      const card = await readJson(cardFile(id));
      if (!card) { errors.push({ stage: 'checkpoint', productId: id, error: 'Card file missing' }); return null; }
      if (!o.skipChina && !['matched', 'needs_review'].includes(card.china.status)) {
        const urls = index.entries[card.clueId] || [];
        if (urls.length !== 1) card.china = { status: urls.length ? 'ambiguous' : index.complete ? 'not_found' : 'index_incomplete', candidates: urls };
        else {
          try {
            const md = await textLoader(urls[0], 'markdown');
            const china = parseChinaMarkdown(md, urls[0], card.clueId);
            await atomicWrite(path.join(o.out, 'china', `${id}.md`), md);
            card.china = matchChina(card, china);
            card.conflicts = card.china.conflicts;
          } catch (e) { card.china = { status: 'error', sourceUrl: urls[0], error: e.message }; }
        }
      }
      if (o.reports && card.inspection.full.status !== 'validated' && state.status !== 'blocked') {
        try {
          const full = await reportSchedule(async () => {
            if (reportNeedsLogin) return { status: 'needs_login' };
            if (state.status === 'blocked') return { status: 'blocked' };
            const result = await (await getBrowser()).report(id, card.sourceUrl);
            if (result.status === 'needs_login') reportNeedsLogin = true;
            return result;
          });
          if (full.payload) {
            await writeJson(path.join(o.out, 'reports', `${id}.json`), full);
            card.inspection.full = { ...normalizeGuaziReport(full, card), file: `reports/${id}.json` };
          } else card.inspection.full = full;
        } catch (e) {
          card.inspection.full = { status: e.code === 'SOURCE_BLOCKED' ? 'blocked' : 'error', error: e.message };
          if (e.code === 'SOURCE_BLOCKED') state.status = 'blocked';
        }
      }
      if (o.reports && card.inspection.full.status === 'validated') {
        // Separate directory keeps report evidence distinct from sales gallery.
        const full = card.inspection.full;
        const evidenceCard = { productId: id, images: full.images.filter(i => i.hasSourceAbnormality), photos: full.photos || [] };
        full.photos = await downloadPhotos(evidenceCard, path.join(o.out, 'inspection'), { count: 'all', mode: 'large', fetchImpl, schedule: photoSchedule });
        full.photoRoot = 'inspection';
      }
      // Persist metadata before downloading: an interrupted download is retried.
      await writeJson(cardFile(id), card);
      card.photos = await downloadPhotos(card, o.out, { count: o.photos, mode: o.image, fetchImpl, schedule: photoSchedule });
      await writeJson(cardFile(id), card);
      stored++;
      if (stored % 10 === 0 || stored === ids.length) log(JSON.stringify({ stage: 'stored', cards: stored, total: ids.length }));
      // Keep only counters in memory for a large run. Full records live on disk.
      return { productId: id, galleryCount: card.images.length, china: { status: card.china.status }, inspection: { full: { status: card.inspection.full.status, photos: (card.inspection.full.photos || []).map(p => ({status:p.status,bytes:p.bytes,reused:p.reused})) } }, conflicts: card.conflicts, photos: card.photos.map(p => ({ status: p.status, bytes: p.bytes, reused: p.reused, ...(p.status !== 'saved' ? p : {}) })) };
    })).filter(Boolean);
    timings.enrichmentSeconds = (Date.now() - phaseStart) / 1000;
    timings.totalSeconds = (Date.now() - Date.parse(startedAt)) / 1000;
    const photos = cards.flatMap(c => c.photos || []);
    const inspectionPhotos = cards.flatMap(c => c.inspection.full.photos || []);
    const countBy = fn => Object.fromEntries([...new Set(cards.map(fn))].map(s => [s, cards.filter(c => fn(c) === s).length]));
    const partial = errors.length || cards.length < o.limit || photos.some(p => p.status !== 'saved') ||
      (!o.skipChina && cards.some(c => ['error', 'index_incomplete', 'ambiguous', 'needs_review'].includes(c.china.status))) ||
      (o.reports && cards.some(c => c.inspection.full.status !== 'validated' || c.inspection.full.photos.some(p=>p.status!=='saved')));
    report = {
      schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(),
      timings, newCards: state.cards.length - initialCardCount,
      cardInput: o.captureDir ? 'saved_captures' : o.transport === 'session-http' ? 'browser_session_http' : 'browser',
      browserAccess: browser?.metrics ?? browserAccess,
      newCardsPerSecond: !o.captureDir && timings.detailSeconds ? (state.cards.length - initialCardCount) / timings.detailSeconds : null,
      status: state.status === 'blocked' ? 'blocked' : partial ? 'partial' : 'complete',
      requestedCards: o.limit, discoveredUnique: state.candidates.length, cards: cards.length, skipped: Object.keys(state.skipped).length,
      galleryUrls: cards.reduce((n, c) => n + c.galleryCount, 0), photosExpected: photos.length,
      photosSaved: photos.filter(p => p.status === 'saved').length, photosReused: photos.filter(p => p.reused).length,
      photoBytes: photos.reduce((n, p) => n + (p.bytes || 0), 0), china: countBy(c => c.china.status), fullReports: countBy(c => c.inspection.full.status),
      inspectionPhotosExpected: inspectionPhotos.length, inspectionPhotosSaved: inspectionPhotos.filter(p=>p.status==='saved').length,
      inspectionPhotoBytes: inspectionPhotos.reduce((n,p)=>n+(p.bytes||0),0),
      conflicts: cards.filter(c => c.conflicts.length).map(c => ({ productId: c.productId, conflicts: c.conflicts })),
      errors, photoErrors: cards.flatMap(c => c.photos.filter(p => p.status !== 'saved').map(p => ({ productId: c.productId, ...p }))),
      options: { limit: o.limit, pages: o.pages, workers: o.workers, photoWorkers: o.photoWorkers, transport: o.transport, requestInterval: o.requestInterval, verifyCheckbox: o.verifyCheckbox, delay: o.delay, photos: o.photos, image: o.image, skipChina: o.skipChina, reports: o.reports, captureDir: o.captureDir },
      catalogModified: false,
    };
    state.status = report.status;
    state.updatedAt = report.finishedAt;
    await saveState();
    await writeJson(path.join(o.out, 'summary.json'), report);
    return report;
  } finally {
    try { await browser?.close(); }
    finally { await lock.close(); await fs.rm(lockFile, { force: true }); }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const o = options(process.argv.slice(2));
    if (o.help) console.log(HELP);
    else {
      const summary = await runPilot(o);
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = summary.status === 'blocked' ? 2 : summary.status === 'complete' ? 0 : 3;
    }
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}

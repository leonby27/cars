import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openGuaziBrowser } from './guazi-pilot-browser.mjs';
import { makeSegments, searchBody, listCandidate } from './guazi-core.mjs';
import { productId } from './guazi-pilot-data.mjs';
import { checkGuaziJob } from './guazi-refresh-check.mjs';
import { discoverPartition, DISCOVERY_VERSION } from './guazi-discovery.mjs';
import { readJson, writeJson, mapLimit } from './guazi-pilot-io.mjs';
import { withGuaziRetries } from './guazi-retry.mjs';
import { removeDeadProcessLock } from './guazi-server-runtime.mjs';
import { orderGuaziBrands } from '../guazi-census.mjs';
import { circleFailure } from './circle-report.mjs';

export const refreshPaths = root => ({
  base: path.join(root, 'runtime', 'guazi-refresh'),
  state: path.join(root, 'runtime', 'guazi-refresh', 'current.json'),
  lock: path.join(root, 'runtime', 'guazi-refresh', 'worker.lock'),
  log: path.join(root, 'runtime', 'guazi-refresh', 'worker.log'),
});
const emptyCounts = () => ({ checked: 0, updated: 0, added: 0, unavailable: 0, review: 0, skipped: 0, rejected: 0 });
const stopError = () => Object.assign(new Error('Guazi refresh paused'), { code: 'GUAZI_PAUSED' });
const minutes = ms => Math.round(ms / 6000) / 10;
const discoveryPages = node => node.children?.length
  ? node.children.reduce((total, child) => total + discoveryPages(child), 0)
  : node.done ? node.lastPage || 0 : 0;
const discoverySections = node => node.children?.length
  ? node.children.reduce((total, child) => total + discoverySections(child), 0)
  : Number(node.done || false);

export function formatGuaziBrandReport({ brand, sourceCount, priceChanged, added, unavailable, remaining, pages, sections, elapsedMs, review, skipped, reactivated, rejected }) {
  return [
    `✅ ${brand}`,
    `Машин в выдаче источника: ${sourceCount}`,
    `Цены изменились от $100 у: ${priceChanged}`,
    `Новых заведено: ${added}`,
    `Снято с продажи: ${unavailable}`,
    `Осталось в каталоге: ${remaining}`,
    `Страниц прочитано: ${pages}${sections > 1 ? ` в ${sections} разделах выдачи` : ''} · ${minutes(elapsedMs)} мин`,
    ...((skipped || review) ? [`Пропущено автоматически: ${(skipped || 0) + (review || 0)}`] : []),
    ...(reactivated ? [`Вернулось в продажу: ${reactivated}`] : []),
    ...(rejected ? [`Отклонено новых: ${rejected}`] : []),
  ].join('\n');
}

export function formatGuaziRoundReport({ brands, checked, priceChanged, added, unavailable, remaining, elapsedMs, review, skipped, reactivated, rejected }) {
  return [
    '🏁 Каталог Guazi обновлён целиком',
    `Круг 2 закрыт: обойдено марок ${brands}`,
    '',
    `За этот круг проверено наших объявлений: ${checked} · изменилось цен: ${priceChanged} (от $100)`,
    `За этот круг новых заведено: ${added}`,
    `За этот круг снято с продажи: ${unavailable}`,
    `В каталоге Guazi сейчас: ${remaining}`,
    `Заняло: ${Math.round(elapsedMs / 360000) / 10} ч`,
    ...((skipped || review) ? [`Пропущено автоматически: ${(skipped || 0) + (review || 0)}`] : []),
    ...(reactivated ? [`Вернулось в продажу: ${reactivated}`] : []),
    ...(rejected ? [`Отклонено новых: ${rejected}`] : []),
  ].join('\n');
}

export async function loadRefreshPolicy(root) {
  const config = { ...await readJson(path.join(root, 'config/guazi-core.json')), priceBasis: 'FOB' };
  const { filters } = await readJson(path.join(root, config.sharedFilterFile));
  const { brands } = await readJson(path.join(root, 'config/guazi-core-brands.json'));
  return { config, segments: makeSegments(brands, filters, config) };
}

// Replay the small result journal, never old captures or accepted JSON. A result
// is appended only AFTER its DB transaction committed. A crash in between may
// repeat one check; it cannot skip an unchecked car.
async function readResults(file) {
  let text;
  try { text = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
  const end = text.lastIndexOf('\n') + 1;
  if (end !== text.length) await fs.truncate(file, Buffer.byteLength(text.slice(0, end)));
  return new Map(text.slice(0, end).split('\n').filter(Boolean).map(line => {
    const result = JSON.parse(line);
    if (!/^[a-z0-9]{10}$/.test(result.id) || !Object.hasOwn(emptyCounts(), result.outcome) || result.outcome === 'checked') throw Error('Invalid Guazi result journal');
    return [result.id, result];
  }));
}

export async function runGuaziRefresh({ root, newCircle = false, signal }, {
  store, browserFactory = openGuaziBrowser, policy, notify = async () => {}, log = console.log,
} = {}) {
  if (!store) throw Error('Guazi catalog store is required');
  const paths = refreshPaths(root);
  await fs.mkdir(paths.base, { recursive: true });
  await removeDeadProcessLock(paths.lock);
  const lock = await fs.open(paths.lock, 'wx');
  await lock.writeFile(String(process.pid));
  let state, browser, releaseStore, ownsState = false;
  const checkStop = () => { if (signal?.aborted) throw stopError(); };
  let brandTick = null, runTick = null;
  const save = async () => {
    const now = Date.now();
    if (runTick !== null) { state.activeElapsedMs = (state.activeElapsedMs || 0) + now - runTick; runTick = now; }
    if (brandTick !== null) { state.brandElapsedMs = (state.brandElapsedMs || 0) + now - brandTick; brandTick = now; }
    state.updatedAt = new Date().toISOString(); await writeJson(paths.state, state);
  };
  const message = async text => { try { await notify(text); } catch (error) { log(`[telegram] ${error.message}`); } };
  try {
    checkStop();
    releaseStore = await store.acquire();
    const { config, segments } = policy || await loadRefreshPolicy(root);
    const signature = createHash('sha256').update(JSON.stringify({ config, segments, target: store.target })).digest('hex');
    state = await readJson(paths.state);
    if (newCircle) {
      if (state && state.status !== 'complete') throw Error('Прошлый Круг 2 не завершён. Используйте «Продолжить 2».');
      const snapshot = await store.snapshot();
      const unique = new Set();
      for (const row of snapshot) {
        if (row.id !== `guazi-${row.externalId}` || productId(row.sourceUrl) !== row.externalId || unique.has(row.externalId)) throw Error('Invalid Guazi starting snapshot');
        unique.add(row.externalId);
      }
      const run = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      await writeJson(path.join(paths.base, run, 'snapshot.json'), snapshot);
      state = { version: 1, run, signature, status: 'starting', startedAt: new Date().toISOString(), snapshotTotal: snapshot.length, brandsDone: [], counts: emptyCounts() };
    } else {
      if (!state || state.status === 'complete') throw Error('Незавершённого Круга 2 нет. Используйте «Круг 2».');
      if (state.signature !== signature) throw Error('Guazi policy or database changed; review the unfinished round before resuming');
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9]{8}$/.test(state.run) || state.version !== 1) throw Error('Invalid Guazi round');
    const out = path.join(paths.base, state.run);
    const snapshot = await readJson(path.join(out, 'snapshot.json'));
    if (!Array.isArray(snapshot) || snapshot.length !== state.snapshotTotal) throw Error('Guazi starting snapshot is missing');
    const active = new Map(snapshot.map(row => [row.externalId, row]));
    const resultsFile = path.join(out, 'results.jsonl');
    const results = await readResults(resultsFile);
    state.counts = emptyCounts();
    for (const result of results.values()) { state.counts.checked++; state.counts[result.outcome]++; }
    state.status = 'running'; state.pid = process.pid; delete state.error;
    ownsState = true;
    runTick = Date.now();
    await save();
    let recording = Promise.resolve();
    const record = result => {
      recording = recording.then(async () => {
        await fs.appendFile(resultsFile, JSON.stringify({ ...result, at: new Date().toISOString() }) + '\n');
        const previous = results.get(result.id);
        if (previous) state.counts[previous.outcome]--; else state.counts.checked++;
        results.set(result.id, result); state.counts[result.outcome]++;
      });
      return recording;
    };
    const event = async data => {
      await fs.appendFile(path.join(out, 'events.jsonl'), JSON.stringify({ ...data, at: new Date().toISOString() }) + '\n');
    };
    const retry = operation => withGuaziRetries(() => { checkStop(); return operation(); }, { onRetry: event });
    browser = await browserFactory({ publicOnly: true, transport: 'session-http', verifyCheckbox: true, requestInterval: 750, delay: 250, onEvent: event });
    await retry(() => browser.publicBootstrap());
    const reader = await browser.worker();
    // Each NEW round has a fresh census and fresh discovery directories. Resume
    // can reuse completed partitions only inside this same round.
    const censusFile = path.join(out, 'census.json');
    const census = await readJson(censusFile, { counts: {} });
    state.phase = 'census'; await save();
    for (const segment of segments) for (const partition of config.exportEligibilityPartitions) {
      checkStop();
      const key = `${segment.id}:${partition}`;
      if (Number.isInteger(census.counts[key])) continue;
      const payload = await retry(() => browser.publicSearch({ ...searchBody(segment, config, 1, partition), clientScene: 'count', pageSize: 1 }));
      const count = payload.data?.totalCount;
      if (!Number.isInteger(count) || count < 0) throw Error('Invalid Guazi census count');
      census.counts[key] = count;
      await writeJson(censusFile, census);
    }
    const brands = orderGuaziBrands(segments, census.counts);
    // Include active cars whose canonical brand is a child of a source brand,
    // and even historical brands absent from today's source dictionary.
    const assigned = new Set();
    for (const brand of brands) {
      brand.existing = snapshot.filter(row => !assigned.has(row.externalId) && brand.segments.some(s => s.covers.includes(row.brand)));
      for (const row of brand.existing) assigned.add(row.externalId);
    }
    const remaining = snapshot.filter(row => !assigned.has(row.externalId));
    if (remaining.length) brands.push({ brand: 'Прочие сохранённые Guazi', segments: [], existing: remaining });
    state.brandsTotal = brands.length;
    for (const brand of brands) {
      checkStop();
      if (state.brandsDone.includes(brand.brand)) continue;
      if (state.brand !== brand.brand) state.brandElapsedMs = 0;
      brandTick = Date.now();
      state.brand = brand.brand; state.phase = 'discovery'; await save();
      const queue = new Map();
      let pages = 0, sections = 0;
      for (const segment of brand.segments) for (const partition of config.exportEligibilityPartitions) {
        checkStop();
        const file = path.join(out, 'discovery', `${segment.id}-${partition}.json`);
        const discovery = await readJson(file, { version: DISCOVERY_VERSION });
        // Do not skip zero-count partitions: the census is only for ordering.
        const found = await discoverPartition({
          search: body => retry(() => browser.publicSearch(body)), body: searchBody(segment, config, 1, partition),
          state: discovery, save: () => writeJson(file, discovery), event,
        });
        pages += Math.max(discovery.pagesRead || 0, discoveryPages(discovery.root));
        sections += discoverySections(discovery.root);
        for (const item of found) {
          const candidate = listCandidate(item, segment);
          if (!queue.has(candidate.id) || queue.get(candidate.id).candidate.violations.length) queue.set(candidate.id, { candidate, segment, partition, listed: true });
        }
      }
      for (const row of brand.existing) if (!queue.has(row.externalId)) queue.set(row.externalId, {
        candidate: { id: row.externalId, url: row.sourceUrl, violations: [] }, listed: false,
      });
      state.phase = 'details'; state.brandTotal = queue.size; await save();
      const jobs = [...queue.values()].filter(job => !results.has(job.candidate.id));
      let failure;
      for (let offset = 0; offset < jobs.length; offset += 25) {
        checkStop();
        await mapLimit(jobs.slice(offset, offset + 25), 4, async job => {
          if (failure || signal?.aborted) return;
          try {
            await record(await checkGuaziJob(job, { brand: brand.brand, active, segments, config, reader, retry, store, run: state.run }));
          } catch (error) { failure ||= error; }
        });
        await recording; await save();
        if (failure) throw failure;
      }
      checkStop();
      const brandResults = [...results.values()].filter(result => result.brand === brand.brand);
      const byOutcome = outcome => brandResults.filter(result => result.outcome === outcome).length;
      const countBrands = [...new Set([...brand.segments.flatMap(segment => segment.covers), ...brand.existing.map(row => row.brand)])];
      const remaining = await store.countActive(countBrands);
      state.brandsDone.push(brand.brand); await save();
      log(formatGuaziBrandReport({ brand: brand.brand, sourceCount: [...queue.values()].filter(job => job.listed).length,
        priceChanged: brandResults.filter(result => result.priceChanged).length,
        added: byOutcome('added'), unavailable: byOutcome('unavailable'), remaining, pages, sections,
        elapsedMs: state.brandElapsedMs, review: byOutcome('review'), skipped: byOutcome('skipped'), rejected: byOutcome('rejected') }));
      brandTick = null;
    }
    // Recheck the small uncertain set after the long main traversal. Replacement
    // results, including completed retries, are replayed on resume without losing
    // source URLs or double-counting checks. Legacy review journals are supported.
    state.phase = 'recheck'; await save();
    for (const result of [...results.values()].filter(r => ['skipped','review'].includes(r.outcome) && !r.rechecked)) {
      checkStop();
      let job = result.job && { ...result.job, segment: segments.find(s => s.id === result.job.segmentId) };
      if (!job) {
        const row = active.get(result.id);
        if (row) job = { candidate: { id: result.id, url: row.sourceUrl, violations: [] }, listed: false };
        for (const segment of segments) for (const partition of config.exportEligibilityPartitions) {
          const discovery = await readJson(path.join(out, 'discovery', `${segment.id}-${partition}.json`));
          const item = discovery?.candidates?.[result.id];
          if (item) job = { candidate: listCandidate(item, segment), segment, partition, listed: true };
        }
      }
      if (!job) throw Error(`Missing retry identity for Guazi ${result.id}`);
      await record(await checkGuaziJob(job, { brand: result.brand, active, segments, config, reader, retry, store, run: state.run, rechecked: true }));
      await save();
    }
    const unchecked = snapshot.filter(row => !results.has(row.externalId));
    if (unchecked.length) throw Error(`Incomplete Guazi refresh: ${unchecked.length} starting listings unchecked`);
    checkStop();
    state.phase = 'dedupe'; await save();
    await store.finalize();
    const remainingActive = await store.countActive();
    state.phase = 'audit'; await save();
    const expectedRemaining = [...results.values()].filter(r => ['updated','added'].includes(r.outcome)).length;
    state.audit = await store.audit({ run: state.run, results: [...results.values()], expectedRemaining });
    state.summary = { brands: brands.length, checked: snapshot.length,
      priceChanged: [...results.values()].filter(result => result.priceChanged).length,
      reactivated: [...results.values()].filter(r => r.action === 'reactivated').length,
      priceChangeThresholdUsd: 100, minorPriceChanges: [...results.values()].filter(r => r.quoteChanged && !r.priceChanged).length,
      skipped: state.counts.skipped, added: state.counts.added, unavailable: state.counts.unavailable, remaining: remainingActive,
      elapsedMs: state.activeElapsedMs, review: state.counts.review, rejected: state.counts.rejected };
    state.status = 'complete'; state.phase = 'complete'; state.finishedAt = new Date().toISOString(); await save();
    await message(formatGuaziRoundReport(state.summary));
    return state;
  } catch (error) {
    if (ownsState) {
      state.status = signal?.aborted || error.code === 'GUAZI_PAUSED' ? 'paused' : error.code === 'SOURCE_BLOCKED' ? 'blocked' : 'error';
      state.error = String(error.message).split('\n')[0].slice(0, 240); await save();
      await message(circleFailure('guazi', error, { state, elapsedMs: state.activeElapsedMs, logPath: paths.log }));
    }
    throw error;
  } finally {
    try { await browser?.close(); } finally {
      try { await releaseStore?.(); } finally {
        await lock.close(); await fs.rm(paths.lock, { force: true });
      }
    }
  }
}

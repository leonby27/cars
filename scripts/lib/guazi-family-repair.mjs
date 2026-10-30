import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openGuaziBrowser } from './guazi-pilot-browser.mjs';
import { GUAZI_HUAWEI_BRANDS, listCandidate, searchBody } from './guazi-core.mjs';
import { discoverPartition, DISCOVERY_VERSION } from './guazi-discovery.mjs';
import { checkGuaziJob } from './guazi-refresh-check.mjs';
import { refreshPaths, loadRefreshPolicy, readResults, emptyCounts } from './guazi-refresh.mjs';
import { readJson, writeJson, mapLimit } from './guazi-pilot-io.mjs';
import { removeDeadProcessLock } from './guazi-server-runtime.mjs';
import { withGuaziRetries } from './guazi-retry.mjs';

const REPAIR = 'guazi-huawei-v1';
const reasons = new Set(['brand is outside the Belarus import list', 'source_segment_unknown']);
export function familyRepairTargets(results) {
  return [...results.values()].filter(r => r.brand === 'AITO'
    && ['skipped', 'rejected'].includes(r.outcome) && reasons.has(r.reason))
    .map(({ id, outcome, reason }) => ({ id, outcome, reason }));
}
const signature = (policy, target) => createHash('sha256').update(JSON.stringify({ config: policy.config, segments: policy.segments, target })).digest('hex');

// One bounded repair inside the existing round. Never reset its snapshot,
// change its signature, or replay successful brands. Discovery is fresh and
// separate; only the explicitly selected failed outcomes may be rewritten.
export async function repairGuaziFamily({ root, signal }, {
  store, browserFactory = openGuaziBrowser, log = console.log,
} = {}) {
  if (!store) throw Error('Guazi catalog store is required');
  const paths = refreshPaths(root);
  await removeDeadProcessLock(paths.lock);
  const lock = await fs.open(paths.lock, 'wx'); await lock.writeFile(String(process.pid));
  let release, browser, state, repair, repairFile, results, selected;
  const checkStop = () => { if (signal?.aborted) throw Object.assign(Error('Guazi family repair paused'), { code: 'GUAZI_PAUSED' }); };
  const save = async () => {
    repair.updatedAt = new Date().toISOString();
    repair.completed = repair.targets.filter(t => results.get(t.id)?.familyRepair === REPAIR).length;
    repair.outcomes = {};
    for (const t of repair.targets) {
      const r = results.get(t.id);
      if (r?.familyRepair === REPAIR) repair.outcomes[r.outcome] = (repair.outcomes[r.outcome] || 0) + 1;
    }
    state.counts = emptyCounts();
    for (const r of results.values()) { state.counts.checked++; state.counts[r.outcome]++; }
    state.familyRepair = { status: repair.status, completed: repair.completed, total: repair.targets.length,
      outcomes: repair.outcomes, updatedAt: repair.updatedAt };
    state.updatedAt = repair.updatedAt;
    await writeJson(repairFile, repair);
    await writeJson(paths.state, state);
  };
  try {
    checkStop(); release = await store.acquire();
    state = await readJson(paths.state);
    if (!state || !['blocked', 'paused', 'error'].includes(state.status)
      || !/^\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{8}$/.test(state.run || '')) throw Error('Repair requires a stopped unfinished Guazi round');
    const pinned = await loadRefreshPolicy(root, state);
    if (signature(pinned, store.target) !== state.signature) throw Error('Original Guazi policy or database mismatch');
    const current = await loadRefreshPolicy(root);
    if (JSON.stringify(current.config) !== JSON.stringify(pinned.config)) throw Error('Repair cannot change the round selection/pricing policy');
    const policy = { config: current.config, segments: current.segments.filter(s => s.covers.some(b => GUAZI_HUAWEI_BRANDS.includes(b))) };
    for (const id of ['103950', '104071', '104015', '104070', '104068', '104069']) {
      if (!policy.segments.some(s => s.sourceBrandId === id)) throw Error(`Updated Guazi family dictionary is incomplete: ${id}`);
    }
    const out = path.join(paths.base, state.run);
    const snapshot = await readJson(path.join(out, 'snapshot.json'));
    if (!Array.isArray(snapshot) || snapshot.length !== state.snapshotTotal) throw Error('Invalid original Guazi snapshot');
    const active = new Map(snapshot.map(r => [r.externalId, r]));
    const journal = path.join(out, 'results.jsonl');
    results = await readResults(journal);
    const directory = path.join(out, REPAIR);
    repairFile = path.join(directory, 'current.json');
    repair = await readJson(repairFile);
    const policySignature = signature(policy, store.target);
    if (repair && (repair.run !== state.run || repair.signature !== policySignature || !Array.isArray(repair.targets))) throw Error('Repair policy changed; review its saved work');
    if (!repair) repair = { version: 1, run: state.run, signature: policySignature, policy,
      startedAt: new Date().toISOString(), targets: familyRepairTargets(results) };
    if (new Set(repair.targets.map(t => t.id)).size !== repair.targets.length || repair.targets.some(t => !results.has(t.id))) throw Error('Invalid repair target journal');
    selected = new Set(repair.targets.map(t => t.id));
    if (repair.status === 'complete') return repair;
    repair.status = 'running'; delete repair.error; await save();
    const event = async data => fs.appendFile(path.join(directory, 'events.jsonl'), JSON.stringify({ ...data, at: new Date().toISOString() }) + '\n');
    const retry = fn => withGuaziRetries(() => { checkStop(); return fn(); }, { onRetry: event });
    browser = await browserFactory({ publicOnly: true, transport: 'session-http', verifyCheckbox: true,
      requestInterval: 750, delay: 250, onEvent: event });
    await retry(() => browser.publicBootstrap());
    const reader = await browser.worker();
    const { config, segments } = policy;
    const queue = new Map();
    for (const segment of segments) for (const partition of config.exportEligibilityPartitions) {
      checkStop();
      const file = path.join(directory, 'discovery', `${segment.id}-${partition}.json`);
      const discovery = await readJson(file, { version: DISCOVERY_VERSION });
      const found = await discoverPartition({ search: body => retry(() => browser.publicSearch(body)),
        body: searchBody(segment, config, 1, partition), state: discovery,
        save: () => writeJson(file, discovery), event });
      for (const item of found) {
        if (!selected.has(item.productId)) continue;
        const candidate = listCandidate(item, segment);
        if (!queue.has(candidate.id) || queue.get(candidate.id).candidate.violations.length) queue.set(candidate.id, { candidate, segment, partition, listed: true });
      }
      log(JSON.stringify({ event: 'family_discovery', segment: segment.id, partition, selectedFound: queue.size }));
    }
    // A missing live-list match cannot reactivate a car merely because its
    // detail page still has a price. Normal explicit-sale/missing-page rules apply.
    for (const target of repair.targets) if (!queue.has(target.id)) {
      const previous = results.get(target.id);
      const row = active.get(target.id);
      const url = previous.job?.candidate?.url || row?.sourceUrl;
      if (!url) throw Error(`Missing repair identity for ${target.id}`);
      queue.set(target.id, { candidate: { id: target.id, url, violations: [] }, listed: false });
    }
    let recording = Promise.resolve(), failure;
    const jobs = [...queue.values()].filter(j => results.get(j.candidate.id)?.familyRepair !== REPAIR);
    for (let offset = 0; offset < jobs.length; offset += 25) {
      checkStop();
      await mapLimit(jobs.slice(offset, offset + 25), 4, async job => {
        if (failure || signal?.aborted) return;
        try {
          const result = await checkGuaziJob(job, { brand: 'AITO', active, segments, config, reader, retry, store, run: state.run, rechecked: true });
          recording = recording.then(async () => {
            const replacement = { ...result, familyRepair: REPAIR, at: new Date().toISOString() };
            await fs.appendFile(journal, JSON.stringify(replacement) + '\n');
            results.set(result.id, replacement);
          });
          await recording;
        } catch (error) { failure ||= error; }
      });
      await recording; await save();
      log(JSON.stringify({ event: 'family_progress', completed: repair.completed, total: repair.targets.length, outcomes: repair.outcomes }));
      if (failure) throw failure;
    }
    checkStop();
    const final = repair.targets.map(t => results.get(t.id));
    if (final.some(r => r.familyRepair !== REPAIR)) throw Error('Incomplete Guazi family repair');
    repair.audit = await store.auditSelected({ run: state.run, results: final });
    await store.finalize();
    repair.status = 'complete'; repair.finishedAt = new Date().toISOString(); await save();
    return repair;
  } catch (error) {
    if (repair) {
      repair.status = signal?.aborted || error.code === 'GUAZI_PAUSED' ? 'paused' : error.code === 'SOURCE_BLOCKED' ? 'blocked' : 'error';
      repair.error = String(error.message).split('\n')[0]; await save();
    }
    throw error;
  } finally {
    try { await browser?.close(); } finally {
      try { await release?.(); } finally { await lock.close(); await fs.rm(paths.lock, { force: true }); }
    }
  }
}

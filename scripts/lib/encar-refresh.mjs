import fs from 'node:fs/promises';
import path from 'node:path';
import { safeDiagnostic } from './circle-report.mjs';

export async function writeEncarJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(data)}\n`, { mode: 0o600 });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function readEncarCheckpoint(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Checkpoint contains the unresolved queue, not just a cursor: failures before
// that cursor must remain retryable. Successful writes are never queued again.
export async function runEncarRefresh({ client, db, upsert, policyViolation,
  canonicalBrand = value => value, concurrency = 2,
  brands, yearFrom = 2020, usdPerKrw, dryRun = false, resume = false,
  detailLimit = 0, stop = () => false, log = () => {}, now = Date.now,
  checkpointPath, reportPath, discoveriesPath,
}) {
  const options = { brands, yearFrom, dryRun };
  let state = resume ? await readEncarCheckpoint(checkpointPath) : null;
  if (resume && (!state || state.version !== 1 || JSON.stringify(state.options) !== JSON.stringify(options))) {
    throw new Error('Encar: нет совместимой сохранённой очереди; запустите новый полный проход');
  }
  if (resume && (!state.detailsReady || !state.summary.walk || state.summary.walk.broken || state.summary.walk.stopped)) {
    throw new Error('Encar: списки не завершены; нужен новый полный проход');
  }
  if (resume && state.phase === 'complete') throw new Error('Encar: сохранённый проход уже завершён');
  const iso = () => new Date(now()).toISOString();
  if (!state) state = {
    version: 1, options, phase: 'lists', pending: [], failures: {}, discoveries: [],
    summary: { startedAt: iso(), brands, active: 0, seenSamePrice: 0, priceChanged: 0,
      rewritten: 0, unseen: 0, sold: 0, stillAlive: 0, unknown: 0, discoveries: 0,
      requests: 0, errors: [] },
  };
  const summary = state.summary;
  const requestsBefore = summary.requests;
  delete summary.fatal;
  delete summary.finishedAt;
  if (resume) summary.resumedAt = iso();
  let pending = new Set(state.pending);
  let workQueue = [...pending];
  let saveChain = Promise.resolve();
  let processedSinceSave = 0, savedAt = now(), fatal = null;
  const diagnostics = () => {
    const failures = Object.values(state.failures);
    summary.unknown = failures.length;
    summary.readFailed = failures.filter(item => item.stage === 'read').length;
    summary.parseFailed = failures.filter(item => item.stage === 'parse').length;
    summary.writeFailed = failures.filter(item => item.stage === 'write').length;
    summary.responseStatuses = {};
    for (const failure of failures) if (failure.stage === 'read') {
      const key = String(failure.status ?? 0);
      summary.responseStatuses[key] = (summary.responseStatuses[key] || 0) + 1;
    }
    // Keep examples of every kind even if thousands of network failures came first.
    summary.errors = ['read', 'parse', 'write'].flatMap(stage => failures.filter(item => item.stage === stage).slice(0, 5));
    summary.remainingListings = pending.size;
    summary.requests = requestsBefore + client.requests;
    summary.checkpointPath = checkpointPath;
  };
  const save = () => {
    saveChain = saveChain.then(async () => {
      diagnostics();
      state.pending = [...pending];
      state.updatedAt = iso();
      // Capture together before awaiting I/O; workers can then continue safely.
      const snapshot = structuredClone(state);
      await writeEncarJson(checkpointPath, snapshot);
      await writeEncarJson(reportPath, snapshot.summary);
    });
    return saveChain;
  };
  const fail = (externalId, stage, error, status) => {
    const entry = { externalId, stage, status, code: error?.code || error?.cause?.code,
      error: safeDiagnostic(error?.message || error).slice(0, 240) };
    state.failures[externalId] = entry;
    log(`[${stage}] ${externalId}: ${status === undefined ? '' : `HTTP ${status} · `}${entry.code ? `${entry.code} · ` : ''}${entry.error}`);
  };
  try {
    if (!resume) {
      const { rows } = await db.query(`SELECT l.id, l.external_id, l.price_cny
        FROM listings l JOIN vehicles v ON v.id=l.vehicle_id
        WHERE l.source='Encar' AND l.status='active' AND v.brand=ANY($1::text[])`, [brands]);
      const active = new Map(rows.map(row => [String(row.external_id), { id: row.id, won: Number(row.price_cny) }]));
      const known = new Set((await db.query("SELECT external_id FROM listings WHERE source='Encar'")).rows.map(row => String(row.external_id)));
      summary.active = active.size;
      log(`[refresh] активных корейских машин ${active.size}, всего известных ${known.size}`);
      const seenPrice = new Map(), discoveries = new Map();
      await save();
      summary.walk = await client.walk({ brands, yearFrom, minYear: yearFrom, stop,
        onItem: candidate => {
          seenPrice.set(candidate.externalId, candidate.priceMan ? Math.round(candidate.priceMan * 10_000) : null);
          if (!known.has(candidate.externalId)) discoveries.set(candidate.externalId, { ...candidate, brand: canonicalBrand(candidate.manufacturer) });
        },
        onSlice: ({ label, total, items }) => log(`[list] ${label}: ${items} из ${total}`),
      });
      state.discoveries = [...discoveries.values()];
      state.discoveriesGeneratedAt = iso();
      summary.discoveries = discoveries.size;
      log(`[walk] в списках ${seenPrice.size} машин, находок ${discoveries.size}`);
      const same = [], changed = [], unseen = [];
      for (const [externalId, listing] of active) {
        if (!seenPrice.has(externalId)) unseen.push(externalId);
        else {
          const won = seenPrice.get(externalId);
          if (won === null || Math.abs(won - listing.won) < 10_000) same.push(listing.id);
          else changed.push(externalId);
        }
      }
      summary.seenSamePrice = same.length;
      summary.priceChanged = changed.length;
      summary.unseen = unseen.length;
      log(`[refresh] цена та же ${same.length} · цена изменилась ${changed.length} · не в списках ${unseen.length}`);
      if (!dryRun) for (let offset = 0; offset < same.length; offset += 1000) {
        await db.query('UPDATE listings SET last_seen_at=now(), last_checked_at=now() WHERE id=ANY($1::text[])', [same.slice(offset, offset + 1000)]);
      }
      pending = new Set([...changed, ...unseen]);
      workQueue = [...changed, ...(detailLimit > 0 ? unseen.slice(0, detailLimit) : unseen)];
      state.phase = 'details';
      await writeEncarJson(discoveriesPath, { generatedAt: state.discoveriesGeneratedAt, source: 'Encar', yearFrom, items: state.discoveries });
      state.detailsReady = true;
      await save();
    } else {
      if (detailLimit > 0) workQueue = workQueue.slice(0, detailLimit);
      log(`[resume] осталось проверить ${pending.size} карточек`);
    }
    let cursor = 0;
    const worker = async () => {
      while (cursor < workQueue.length && !stop() && !fatal) {
        const externalId = workQueue[cursor++];
        let stage = 'read';
        try {
          const { status, car, detail, error } = await client.car(externalId, { usdPerKrw, history: true });
          if (status !== 200 && status !== 404) {
            fail(externalId, 'read', error || `Encar: detail request failed (${status})`, status);
          } else if (status === 200 && (!detail || error)) {
            fail(externalId, 'parse', error || 'Encar: empty detail response', status);
          } else {
            stage = 'parse';
            const sold = status === 404 || (detail.advertisement?.status && detail.advertisement.status !== 'ADVERTISE') || !car || policyViolation(car);
            stage = 'write';
            if (sold) {
              if (!dryRun) await db.query("UPDATE listings SET status='unavailable', sold_at=COALESCE(sold_at, now()), last_checked_at=now() WHERE source='Encar' AND external_id=$1", [externalId]);
              summary.sold += 1;
            } else {
              if (!dryRun) { await upsert(car); summary.rewritten += 1; }
              summary.stillAlive += 1;
            }
            pending.delete(externalId);
            delete state.failures[externalId];
          }
        } catch (error) {
          if (error.code === 'ENCAR_GEO_BLOCKED') { fatal = error; break; }
          if (error.stage === 'parse') stage = 'parse';
          fail(externalId, stage, error);
        }
        processedSinceSave += 1;
        if (processedSinceSave >= 100 || now() - savedAt >= 30_000) {
          processedSinceSave = 0; savedAt = now();
          try { await save(); } catch (error) { fatal = error; break; }
        }
      }
    };
    const results = await Promise.allSettled(Array.from({ length: concurrency }, worker));
    const rejected = results.find(result => result.status === 'rejected');
    if (fatal || rejected) throw fatal || rejected.reason;
    diagnostics();
    summary.finishedAt = iso();
    summary.complete = !pending.size && !summary.walk?.broken && !summary.walk?.stopped;
    state.phase = summary.complete ? 'complete' : 'partial';
    await save();
    log(`[done] проданы ${summary.sold}, переписаны ${summary.rewritten}, ошибки чтения ${summary.readFailed}, разбора ${summary.parseFailed}, записи ${summary.writeFailed}, осталось ${pending.size}`);
    return summary;
  } catch (error) {
    summary.fatal = safeDiagnostic(error.message);
    summary.complete = false;
    state.phase = 'partial';
    // A failed checkpoint write must not poison subsequent attempts to save.
    await saveChain.catch(() => {});
    saveChain = Promise.resolve();
    await save().catch(saveError => log(`[checkpoint] ${saveError.message}`));
    throw error;
  }
}

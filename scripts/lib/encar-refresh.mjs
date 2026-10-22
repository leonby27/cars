import fs from 'node:fs/promises';
import path from 'node:path';
import { safeDiagnostic } from './circle-report.mjs';
import { encarOutcome, encarEvidence, encarSourceProblem } from './encar-result.mjs';
import { createEncarImportIdentity } from './encar-import-identity.mjs';

const accountedListings = (summary, pending) => summary.seenSamePrice + summary.stillAlive
  + summary.sold + (summary.skipped || 0) + pending;

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
  if (resume && (!state.detailsReady || !state.summary.walk)) {
    throw new Error('Encar: списки не завершены; нужен новый полный проход');
  }
  if (resume && state.phase === 'complete') throw new Error('Encar: сохранённый проход уже завершён');
  if (resume && (!Array.isArray(state.pending) || state.pending.some(id => typeof id !== 'string' || !id)
    || new Set(state.pending).size !== state.pending.length || !state.failures || !Array.isArray(state.discoveries))) {
    throw new Error('Encar: сохранённая очередь повреждена; рабочие данные не изменены');
  }
  if (resume && accountedListings(state.summary, state.pending.length) !== state.summary.active) {
    throw new Error('Encar: счётчики сохранённой очереди не совпадают с исходным набором; рабочие данные не изменены');
  }
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
  delete summary.failureCode;
  delete summary.failureStatus;
  delete summary.failureStage;
  if (resume) summary.resumedAt = iso();
  const attempt = summary.attempt = { startedAt: iso(), checked: 0, completed: 0, readFailed: 0, parseFailed: 0, writeFailed: 0, responseStatuses: {}, errors: [] };
  let pending = new Set(state.pending);
  let workQueue = [...pending];
  let saveChain = Promise.resolve();
  let processedSinceSave = 0, savedAt = now(), fatal = null;
  let identity;
  let knownRows;
  const readKnown = async () => (await db.query("SELECT external_id, status, source_payload->>'sourceVehicleId' AS source_vehicle_id FROM listings WHERE source='Encar' ORDER BY last_checked_at DESC NULLS LAST")).rows;
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
    summary.errors = ['read', 'parse', 'write'].flatMap(stage => [
      ...attempt.errors.filter(item => item.stage === stage),
      ...failures.filter(item => item.stage === stage && !attempt.errors.some(current => current.externalId === item.externalId)),
    ].slice(0, 5));
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
    attempt[`${stage}Failed`] += 1;
    if (stage === 'read') attempt.responseStatuses[String(status ?? 0)] = (attempt.responseStatuses[String(status ?? 0)] || 0) + 1;
    attempt.errors = [entry, ...attempt.errors].slice(0, 15);
    log(`[${stage}] ${externalId}: ${status === undefined ? '' : `HTTP ${status} · `}${entry.code ? `${entry.code} · ` : ''}${entry.error}`);
  };
  try {
    if (!resume) {
      const { rows } = await db.query(`SELECT l.id, l.external_id, l.price_cny, l.status, l.source_payload->>'historyUnavailable' AS history_unavailable
        FROM listings l JOIN vehicles v ON v.id=l.vehicle_id
        WHERE l.source='Encar' AND l.status IN ('active','skipped') AND v.brand=ANY($1::text[])`, [brands]);
      const active = new Map(rows.map(row => [String(row.external_id), { id: row.id, won: Number(row.price_cny), status: row.status, historyUnavailable: row.history_unavailable === 'true' }]));
      knownRows = await readKnown();
      identity = createEncarImportIdentity(knownRows);
      const known = new Map(knownRows.map(row => [String(row.external_id), row.status]));
      summary.active = active.size;
      log(`[refresh] активных корейских машин ${active.size}, всего известных ${known.size}`);
      const seenPrice = new Map(), discoveries = new Map(), returning = new Set();
      await save();
      summary.walk = await client.walk({ brands, yearFrom, minYear: yearFrom, stop,
        onItem: candidate => {
          seenPrice.set(candidate.externalId, candidate.priceMan ? Math.round(candidate.priceMan * 10_000) : null);
          if (!known.has(candidate.externalId)) discoveries.set(candidate.externalId, { ...candidate, brand: canonicalBrand(candidate.manufacturer) });
          else if (known.get(candidate.externalId) === 'unavailable') returning.add(candidate.externalId);
        },
        onSlice: ({ label, total, items }) => log(`[list] ${label}: ${items} из ${total}`),
      });
      if (summary.walk.broken && !summary.walk.slices) throw Object.assign(new Error('Encar: ни одного списка не удалось подтвердить; проверка карточек не запущена'), {
        code: encarSourceProblem(summary.walk.errors).failureCode || 'ENCAR_LIST_FAILED', status: summary.walk.errors?.[0]?.status,
      });
      state.discoveries = [...discoveries.values()];
      state.returning = [...returning, ...[...active].filter(([, listing]) => listing.status === 'skipped').map(([id]) => id)];
      summary.active += returning.size;
      state.discoveriesGeneratedAt = iso();
      summary.discoveries = discoveries.size;
      log(`[walk] в списках ${seenPrice.size} машин, находок ${discoveries.size}`);
      const same = [], changed = [], recheck = [...returning], unseen = [];
      for (const [externalId, listing] of active) {
        if (!seenPrice.has(externalId)) unseen.push(externalId);
        else {
          const won = seenPrice.get(externalId);
          if (won !== null && Math.abs(won - listing.won) >= 10_000) changed.push(externalId);
          else if (listing.status === 'skipped' || listing.historyUnavailable) recheck.push(externalId);
          else same.push(listing.id);
        }
      }
      summary.seenSamePrice = same.length;
      summary.priceChanged = changed.length;
      summary.unseen = unseen.length;
      log(`[refresh] цена та же ${same.length} · цена изменилась ${changed.length} · не в списках ${unseen.length}`);
      if (!dryRun) for (let offset = 0; offset < same.length; offset += 1000) {
        await db.query('UPDATE listings SET last_seen_at=now(), last_checked_at=now() WHERE id=ANY($1::text[])', [same.slice(offset, offset + 1000)]);
      }
      pending = new Set([...changed, ...recheck, ...unseen]);
      workQueue = [...changed, ...recheck, ...(detailLimit > 0 ? unseen.slice(0, detailLimit) : unseen)];
      state.phase = 'details';
      await writeEncarJson(discoveriesPath, { generatedAt: state.discoveriesGeneratedAt, source: 'Encar', yearFrom, items: state.discoveries });
      state.detailsReady = true;
      await save();
    } else {
      state.phase = 'details';
      await save();
      knownRows = await readKnown();
      identity = createEncarImportIdentity(knownRows);
      if (summary.walk.broken || summary.walk.stopped) {
        // Rebuild only the list evidence; keep the existing unresolved detail
        // queue and all successful card writes/counters from the same round.
        log('[resume] перепроверяю неполные списки; готовые карточки не повторяются');
        const known = new Set(knownRows.map(row => String(row.external_id)));
        const discoveries = new Map(state.discoveries.map(item => [item.externalId, item]));
        summary.walk = await client.walk({ brands, yearFrom, minYear: yearFrom, stop,
          onItem: candidate => {
            if (!known.has(candidate.externalId)) discoveries.set(candidate.externalId, { ...candidate, brand: canonicalBrand(candidate.manufacturer) });
          },
          onSlice: ({ label, total, items }) => log(`[list] ${label}: ${items} из ${total}`),
        });
        state.discoveries = [...discoveries.values()];
        summary.discoveries = discoveries.size;
        await writeEncarJson(discoveriesPath, { generatedAt: state.discoveriesGeneratedAt, source: 'Encar', yearFrom, items: state.discoveries });
        await save();
        if (summary.walk.broken || summary.walk.stopped) {
          const source = encarSourceProblem(summary.walk.errors);
          throw Object.assign(new Error('Encar: списки пока не завершены; очередь сохранена для продолжения'), { code: source.failureCode, status: source.failureStatus });
        }
      }
      if (detailLimit > 0) workQueue = workQueue.slice(0, detailLimit);
      log(`[resume] осталось проверить ${pending.size} карточек`);
    }
    if (workQueue.length && client.verifyAccess) {
      const sample = knownRows.find(row => row.status === 'active' && !pending.has(String(row.external_id)))
        || knownRows.find(row => row.status === 'active');
      const sampleId = sample?.external_id || workQueue[0];
      if (resume) await client.verifyAccess({ brands, yearFrom, sampleId });
      else client.controlId = sampleId; // The fresh walk already checked source access.
    }
    let cursor = 0;
    const worker = async () => {
      while (cursor < workQueue.length && !stop() && !fatal) {
        const externalId = workQueue[cursor++];
        attempt.checked += 1;
        let stage = 'read';
        let activationClaimed = false;
        try {
          const { status, car, detail, error, historyUnavailable, apiStatus, publicStatus, availabilitySource, unverifiedUnavailable } = await client.car(externalId, { usdPerKrw, history: true });
          if ((status !== 200 && status !== 404) || (status === 404 && error)) {
            fail(externalId, 'read', error || `Encar: detail request failed (${status})`, status);
          } else if (status === 200 && (!detail || error)) {
            fail(externalId, 'parse', error || 'Encar: empty detail response', status);
          } else {
            stage = 'parse';
            let { state: outcome, reason } = encarOutcome({ status, car, detail, error, unverifiedUnavailable }, policyViolation);
            if (outcome === 'active' && state.returning?.includes(externalId)) {
              const alreadyActive = identity.isActive(externalId);
              if (identity.claim(car, { reactivate: true })) { outcome = 'hidden'; reason = 'duplicate'; }
              else activationClaimed = !alreadyActive;
            }
            const evidence = encarEvidence({ status, detail, apiStatus, publicStatus, availabilitySource }, { state: outcome, reason }, iso());
            stage = 'write';
            if (outcome === 'hidden') {
              if (!dryRun) {
                const updated = await db.query("UPDATE listings SET status='skipped', sold_at=NULL, last_checked_at=now(), source_payload=source_payload || jsonb_build_object('sourceAvailability',$2::jsonb), content_changed_at=CASE WHEN status IS DISTINCT FROM 'skipped' THEN now() ELSE content_changed_at END WHERE source='Encar' AND external_id=$1", [externalId, JSON.stringify(evidence)]);
                if (updated.rowCount !== 1) throw new Error('Encar: не подтверждена запись статуса объявления');
              }
              summary.skipped = (summary.skipped || 0) + 1;
              identity.release(externalId);
            } else if (outcome === 'sold' || outcome === 'unavailable') {
              if (!dryRun) {
                const soldAt = outcome === 'sold' ? 'COALESCE(sold_at, now())' : 'NULL';
                const updated = await db.query(`UPDATE listings SET status='unavailable', sold_at=${soldAt}, last_checked_at=now(), source_payload=source_payload || jsonb_build_object('sourceAvailability',$2::jsonb), content_changed_at=CASE WHEN status IS DISTINCT FROM 'unavailable' THEN now() ELSE content_changed_at END WHERE source='Encar' AND external_id=$1`, [externalId, JSON.stringify(evidence)]);
                if (updated.rowCount !== 1) throw new Error('Encar: не подтверждена запись статуса объявления');
              }
              summary.sold += 1;
              if (outcome === 'unavailable') summary.unverifiedUnavailable = (summary.unverifiedUnavailable || 0) + 1;
              identity.release(externalId);
            } else {
              let saved;
              if (!dryRun) { saved = await upsert({ ...car, sourceAvailability: evidence }); summary.rewritten += 1; }
              summary.stillAlive += 1;
              if (state.returning?.includes(externalId)) summary.reactivated = (summary.reactivated || 0) + 1;
              if (historyUnavailable || saved?.historyUnavailable) summary.historyDeferred = (summary.historyDeferred || 0) + 1;
            }
            pending.delete(externalId);
            attempt.completed += 1;
            delete state.failures[externalId];
          }
        } catch (error) {
          if (activationClaimed) identity.release(externalId);
          if (error.code === 'ENCAR_GEO_BLOCKED') { fatal = error; break; }
          if (error.code === 'ENCAR_UNAVAILABLE') {
            fail(externalId, error.stage || 'read', error, error.status ?? 0);
            fatal = error;
            break;
          }
          if (error.stage === 'parse') stage = 'parse';
          fail(externalId, stage, error, error.status);
          if (stage === 'write' && /^(?:08|53|57P0|ECONN|ETIMEDOUT|EPIPE)/.test(error.code || '')) { fatal = error; break; }
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
    const accounted = accountedListings(summary, pending.size);
    if (accounted !== summary.active) throw Object.assign(new Error('Encar: итоги не совпадают с исходным набором объявлений'), { code: 'ENCAR_ACCOUNTING_MISMATCH', stage: 'write' });
    summary.finishedAt = iso();
    summary.complete = !pending.size && !summary.walk?.broken && !summary.walk?.stopped;
    const sourceProblems = [...Object.keys(attempt.responseStatuses).map(status => ({ status: Number(status) })), ...(summary.walk?.errors || [])];
    if (!summary.complete && !attempt.parseFailed && !attempt.writeFailed) Object.assign(summary, encarSourceProblem(sourceProblems));
    state.phase = summary.complete ? 'complete' : 'partial';
    await save();
    log(`[done] проданы ${summary.sold}, переписаны ${summary.rewritten}, ошибки чтения ${summary.readFailed}, разбора ${summary.parseFailed}, записи ${summary.writeFailed}, осталось ${pending.size}`);
    return summary;
  } catch (error) {
    summary.fatal = safeDiagnostic(error.message);
    summary.failureCode = error.code;
    summary.failureStatus = error.status;
    summary.failureStage = error.stage;
    summary.complete = false;
    state.phase = 'partial';
    // A failed checkpoint write must not poison subsequent attempts to save.
    await saveChain.catch(() => {});
    saveChain = Promise.resolve();
    await save().catch(saveError => log(`[checkpoint] ${saveError.message}`));
    throw error;
  }
}

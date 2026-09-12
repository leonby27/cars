// A cycle owns the active listings present at its start. Database check dates
// are its durable per-card checkpoint; a failed request never advances them.
export const PENDING_CYCLE_SQL = `first_seen_at <= $1::timestamptz
  AND (last_checked_at IS NULL OR last_checked_at < $1::timestamptz)`;

export function resumeRefreshCycle(saved, now) {
  const resumable = saved?.version === 2 && Number.isFinite(Date.parse(saved.startedAt));
  return {
    version: 2,
    round: Number(saved?.round) > 0 ? Number(saved.round) : 1,
    startedAt: resumable ? saved.startedAt : new Date(now).toISOString(),
    // Old cursors recorded visited brands, not successful checks. Never trust
    // their completion flags when migrating to the first complete cycle.
    brandsDone: resumable ? saved.brandsDone || [] : [],
  };
}

export function readCheckLimit(value) {
  if (value === undefined || value === null) return Infinity;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 0 || value === "" || value === "true") {
    throw new Error("Лимит проверок должен быть целым неотрицательным числом");
  }
  return limit;
}

export function oldestChecksFirst(rows) {
  const time = (row) => Date.parse(row.last_checked_at) || -Infinity;
  return [...rows].sort((a, b) => time(a) - time(b) || String(a.id).localeCompare(String(b.id)));
}

// Persist each conclusive result BEFORE acknowledging it or waiting. If a
// process is killed later, a restarted cycle selects only the outstanding rows.
export async function checkPendingListings(rows, {
  check, persist, afterAttempt = async () => {}, stopped = () => false, limit = Infinity,
}) {
  const verified = new Set();
  let attempted = 0;
  let unknown = 0;
  let sold = 0;
  for (const row of oldestChecksFirst(rows)) {
    if (stopped() || attempted >= limit) break;
    const result = await check(row.external_id);
    attempted += 1;
    if (result.verdict === "sold" || (result.verdict === "alive" && result.price > 0)) {
      await persist(row, result);
      verified.add(row.id);
      if (result.verdict === "sold") sold += 1;
    } else {
      unknown += 1;
    }
    await afterAttempt(result);
  }
  return { verified, attempted, unknown, sold, skipped: rows.length - attempted };
}

export function finishRefreshCycle(cursor, { remainingListings, remainingBrands, stopped = false }) {
  const complete = !stopped && remainingListings === 0 && remainingBrands === 0;
  return {
    complete,
    // The next invocation starts a new snapshot. No implicit infinite loop.
    cursor: complete
      ? { version: 2, round: cursor.round + 1, startedAt: null, brandsDone: [] }
      : cursor,
  };
}

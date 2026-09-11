const checkedAtMs = (row) => {
  const value = row?.last_checked_at ?? row?.checkedAt ?? null;
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};

const neverRechecked = (row) => {
  if (typeof row?.never_rechecked === "boolean") return row.never_rechecked;
  if (typeof row?.neverRechecked === "boolean") return row.neverRechecked;
  const checked = checkedAtMs(row);
  const addedValue = row?.first_seen_at ?? row?.firstSeenAt ?? row?.imported_at ?? row?.importedAt ?? null;
  const added = addedValue ? new Date(addedValue).getTime() : NaN;
  if (!Number.isFinite(added)) return false;
  const day = (value) => Math.floor(value / 86_400_000);
  return day(checked) <= day(added);
};

/**
 * Карточки, которые остались непроверенными в прошлом проходе марки, получают
 * первые места в уже существующей поштучной квоте. Следом ставим машины, которые
 * после импорта ещё ни разу отдельно не перепроверялись. Внутри групп сохраняем
 * исходный порядок (он идёт от самой старой проверки к самой новой).
 */
export function prioritizeBrandBacklog(rows, uncheckedBefore) {
  const cutoff = new Date(uncheckedBefore || "").getTime();
  return [...rows].sort((a, b) => {
    const aPending = Number.isFinite(cutoff) && checkedAtMs(a) < cutoff;
    const bPending = Number.isFinite(cutoff) && checkedAtMs(b) < cutoff;
    return Number(bPending) - Number(aPending)
      || Number(neverRechecked(b)) - Number(neverRechecked(a));
  });
}

/** Запомнить границу незакрытого прохода или убрать погашенный хвост марки. */
export function updateBrandBacklog(current, brand, uncheckedBefore = null) {
  const next = { ...(current || {}) };
  if (uncheckedBefore) next[brand] = uncheckedBefore;
  else delete next[brand];
  return next;
}

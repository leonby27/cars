const checkedAtMs = (row) => {
  const value = row?.last_checked_at ?? row?.checkedAt ?? null;
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
};

/**
 * Карточки, которые остались непроверенными в прошлом проходе марки, получают
 * первые места в уже существующей поштучной квоте. Внутри обеих групп сохраняем
 * исходный порядок (он идёт от самой старой проверки к самой новой).
 */
export function prioritizeBrandBacklog(rows, uncheckedBefore) {
  const cutoff = new Date(uncheckedBefore || "").getTime();
  if (!Number.isFinite(cutoff)) return [...rows];
  return [...rows].sort((a, b) => {
    const aPending = checkedAtMs(a) < cutoff;
    const bPending = checkedAtMs(b) < cutoff;
    return Number(bPending) - Number(aPending);
  });
}

/** Запомнить границу незакрытого прохода или убрать погашенный хвост марки. */
export function updateBrandBacklog(current, brand, uncheckedBefore = null) {
  const next = { ...(current || {}) };
  if (uncheckedBefore) next[brand] = uncheckedBefore;
  else delete next[brand];
  return next;
}

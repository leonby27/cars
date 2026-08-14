const DAY_MS = 24 * 60 * 60 * 1000;

export function getSourceListedAt(car) {
  return car?.sourceListedAt || null;
}

export function formatListingAge(value, now = Date.now()) {
  const firstSeen = new Date(value);
  const current = new Date(now);
  if (!value || Number.isNaN(firstSeen.getTime()) || Number.isNaN(current.getTime())) return null;
  const days = Math.max(0, Math.floor((current.getTime() - firstSeen.getTime()) / DAY_MS));
  if (days === 0) return "В продаже меньше дня";
  const mod10 = days % 10;
  const mod100 = days % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "день" : [2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100) ? "дня" : "дней";
  return `В продаже ${days} ${word}`;
}

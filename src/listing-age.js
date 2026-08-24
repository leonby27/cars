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

// Ярлык «Новое» на карточке: машина появилась в каталоге недавно. Дата первого
// появления — firstSeenAt (в статической сборке она тоже есть, см. summaryKeys
// в scripts/generate-seo-pages.mjs). У машин из массового первого импорта она у
// всех одна и та же (18.08.2026), поэтому всё, что не новее CATALOG_BASELINE,
// новинкой не считаем — иначе ярлык разом повис бы на всём каталоге.
export const NEW_LISTING_DAYS = 7;
const CATALOG_BASELINE = Date.parse("2026-08-19T00:00:00Z");

export function getListingAddedAt(car) {
  return car?.firstSeenAt || car?.importedAt || null;
}

export function isNewListing(car, now = Date.now()) {
  const value = getListingAddedAt(car);
  if (!value) return false;
  const addedAt = new Date(value).getTime();
  if (Number.isNaN(addedAt) || addedAt <= CATALOG_BASELINE) return false;
  return now - addedAt <= NEW_LISTING_DAYS * DAY_MS;
}

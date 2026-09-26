/* Полоска «Целевые / Квота» над таблицей заходов.
 *
 * Страницы про квоту на электромобили собирают много заходов из поиска, но машину
 * там почти не ищут: люди читают новости о льготе. Полоска показывает, какая доля
 * заходов пришлась на них, а какая — на всё остальное (каталог, карточки, обзоры).
 *
 * Считаем по странице входа — той, с которой начался заход. На 26.09.2026 за 60 дней
 * заходили на четыре такие страницы: раздел /ev-quota и статьи /blog/ev-quota-2027,
 * /blog/ev-quota-extra-2026, /blog/ev-quota-end. Новые статьи о квоте получают «quota»
 * в адресе, поэтому правило по адресу подхватит их без правки списка.
 */
const QUOTA_PATH = /^\/(ev-quota(\/|$)|blog\/[^/]*quota)/;

/** Страница входа относится к квоте: адрес без метки и хвоста «?…», «#…». */
export const isQuotaLandingPath = (landingPath = "") => {
  const path = String(landingPath || "/").split(/[?#]/)[0].toLowerCase();
  return QUOTA_PATH.test(path);
};

/** Сколько заходов пришлось на страницы квоты и сколько на все остальные. */
export const quotaVisitSplit = (visits = []) => {
  let quota = 0;
  for (const visit of visits) if (isQuotaLandingPath(visit.landingPath)) quota += 1;
  return { target:visits.length - quota, quota, total:visits.length };
};

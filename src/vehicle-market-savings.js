import { aggregateComparisonPrices, comparisonOwnPrices, hasEnoughComparisonSample, normalizeModel } from "./market-compare.js";

export const VEHICLE_MARKET_PRICE_OPTIONS = Object.freeze([
  { key: "mean", label: "По средней цене" },
  { key: "median", label: "По медианной цене" },
  { key: "min", label: "По минимальной цене" },
]);
const MILEAGE_LIMITS = [20000, 50000, 100000, 150000, 200000];

export function vehicleMarketComparisonUrl(car, { quotaOn = false, refund50 = false, base = "/" } = {}) {
  if (!car?.brand || !car.model || !car.type || car.available === false) return null;
  const params = new URLSearchParams({ quota: quotaOn ? "on" : "off", brand: car.brand, model: car.model, type: car.type });
  if (refund50) params.set("refund50", "1");
  return `${base}api/market/compare?${params}`;
}

/** Сначала год машины, затем вся модель; расширяем выборку только при нехватке данных. */
function vehicleMarketSample(car, data, { quotaOn = false } = {}, allowSparseChoice = false) {
  if (!car || car.available === false || !car.year || !car.type) return null;
  const card = data?.cards?.find((item) => item.brand === car.brand
    && normalizeModel(item.model) === normalizeModel(car.model) && item.type === car.type);
  // Длиннобазная версия и обычная — разные машины: короткое обещание не скрывает это.
  if (!card || card.longVersion) return null;
  const year = card.years?.find((item) => Number(item.year) === Number(car.year));
  const mileage = car.mileage == null || car.mileage === "" ? NaN : Number(car.mileage);
  const limits = Number.isFinite(mileage) && mileage >= 0
    ? [...MILEAGE_LIMITS.filter((limit) => limit >= mileage), null] : [null];
  const scopes = [
    ...(year ? [{ year: Number(year.year), years: [year] }] : []),
    ...(card.years?.some(item => item !== year) ? [{ year: null, years: card.years }] : []),
  ];
  for (const scope of scopes) for (const mileageMax of limits) {
    const key = mileageMax == null ? "all" : String(mileageMax);
    const raw = scope.years[0]?.prices?.[key];
    let prices;
    if (scope.year === null) {
      const buckets = scope.years.map(item => item.prices?.[key]).filter(Boolean);
      // Не превращаем неизвестное число объявлений в ноль при объединении лет.
      if (!buckets.length || buckets.some(bucket => {
        const ownCount = comparisonOwnPrices(bucket.ours, quotaOn)?.count;
        const localCount = bucket.belarus === null ? 0 : bucket.belarus?.count;
        return !Number.isSafeInteger(ownCount) || ownCount < 0
          || !Number.isSafeInteger(localCount) || localCount < 0;
      })) continue;
      prices = aggregateComparisonPrices(scope.years, key, quotaOn);
    } else {
      prices = { ours: comparisonOwnPrices(raw?.ours, quotaOn), belarus: raw?.belarus };
    }
    if (hasEnoughComparisonSample(prices)) return { year: scope.year, mileageMax, prices };
    // После расширения до всех пробегов малое число местных объявлений
    // мешает сравнению цен, но не скрывает большой выбор в нашем каталоге.
    const oursCount = prices.ours?.count;
    const belarusCount = prices.belarus === null ? 0 : prices.belarus?.count;
    if (allowSparseChoice && mileageMax === null && Number.isSafeInteger(oursCount) && oursCount >= 10
      && Number.isSafeInteger(belarusCount) && belarusCount >= 0 && belarusCount < 2) {
      return { year: scope.year, mileageMax, prices };
    }
  }
  return null;
}

/** Выгода модели, а не конкретного объявления. */
export function vehicleMarketSavings(car, data, options = {}) {
  const sample = vehicleMarketSample(car, data, options);
  if (!sample) return null;
  const { year, mileageMax, prices } = sample;
  const priceOptions = VEHICLE_MARKET_PRICE_OPTIONS.flatMap((option) => {
    const ours = prices.ours[option.key], belarus = prices.belarus[option.key];
    if (!Number.isFinite(ours) || !Number.isFinite(belarus) || ours <= 0 || belarus <= 0) return [];
    // Проверяем реальные 10% до округления: 9,99% не должны открывать плашку.
    if (ours > belarus * 0.9) return [];
    const percent = Math.round((belarus - ours) / belarus * 1000) / 10;
    return [{ ...option, percent }];
  });
  if (!priceOptions.length) return null;
  const best = priceOptions.reduce((winner, option) => option.percent > winner.percent ? option : winner);
  return { year, mileageMax, options: priceOptions, best };
}

/** Больший выбор не зависит от того, дешевле ли у нас машины. */
export function vehicleMarketChoice(car, data, options = {}) {
  const sample = vehicleMarketSample(car, data, options, true);
  if (!sample) return null;
  const ours = Number(sample.prices.ours.count), belarus = sample.prices.belarus === null ? 0 : Number(sample.prices.belarus.count);
  if (!Number.isSafeInteger(ours) || !Number.isSafeInteger(belarus) || belarus < 0 || ours < belarus * 2) return null;
  if (belarus < 2) return { year: sample.year, mileageMax: sample.mileageMax, ours, belarus, multiplier: "×10" };
  const ratio = ours / belarus;
  // Не завышаем: 2,99 → 2,9. Отображаемый множитель ограничен ×10.
  const shown = Math.floor(ratio * 10) / 10;
  const multiplier = ratio > 10 ? "×10" : `×${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(shown)}`;
  return { year: sample.year, mileageMax: sample.mileageMax, ours, belarus, multiplier };
}

// Быстрые просмотры одной модели разделяют запрос; ошибки можно повторить.
export function createVehicleMarketLoader({ fetcher = (...args) => fetch(...args), now = Date.now, ttl = 600000 } = {}) {
  const entries = new Map();
  return (url) => {
    const known = entries.get(url);
    if (known && (known.pending || now() < known.expires)) return known.promise;
    const entry = { pending: true, expires: 0 };
    entry.promise = Promise.resolve().then(() => fetcher(url, { signal: AbortSignal.timeout(15000) })).then((response) => {
      if (!response.ok) throw new Error("Market comparison unavailable");
      return response.json();
    }).then((data) => {
      entry.pending = false;
      entry.expires = now() + ttl;
      return data;
    }).catch((error) => {
      if (entries.get(url) === entry) entries.delete(url);
      throw error;
    });
    entries.set(url, entry);
    if (entries.size > 80) entries.delete(entries.keys().next().value);
    return entry.promise;
  };
}

import { MODEL_PAGES } from "./model-pages.js";
import { brandLandingPath, modelLandingPath } from "./catalog-landings.js";
import { carTitle } from "./car-title.js";

// Популярные модели для главной: сорок восемь моделей с наибольшим числом машин.
// До 25.09.2026 с главной на модели не вело ни одной ссылки (у IM4CAR — 370).
const POPULAR_MODELS_ON_HOME = 48;
// Вкладки марок: как у IM4CAR, главная — оглавление каталога. Крупные марки со всеми
// своими моделями (от трёх машин), числом машин и ценой «от» — ссылками на страницы
// моделей. До 25.09.2026 с главной на модели не вело ни одной ссылки, у них — 387.
const BRAND_TABS_ON_HOME = 16;

/**
 * Списки блока «Популярные модели» из сводки по моделям (`getModelFacts`: марка,
 * модель, число машин, цена «от», годы выпуска и снимок одной из машин модели). Один расчёт на двоих: сборка встраивает результат
 * в главную (scripts/generate-seo-pages.mjs), а локальный режим разработки считает его
 * из той же базы при открытии страницы (vite.config.mjs) — иначе без сборки блока нет.
 */
export function homePopularModels(rows = []) {
  const entries = homeModelEntries(rows);
  const models = entries.slice(0, POPULAR_MODELS_ON_HOME).map(({ brand: _brand, ...item }) => item);
  const brands = homeModelBrands(entries).slice(0, BRAND_TABS_ON_HOME);
  return { models, brands };
}

/** Все модели каталога от трёх машин, самые многочисленные первыми (с маркой у каждой). */
export function homeModelEntries(rows = []) {
  return rows
    .map(({ brand, model, count, priceMin, yearMin, yearMax, image }) => {
      const review = MODEL_PAGES.find((page) => page.brand === brand && page.model === model);
      const price = Number(priceMin) || null;
      return {
        brand,
        path: modelLandingPath(brand, model),
        name: review?.name || carTitle(brand, model),
        count: Number(count) || 0,
        priceFrom: price ? Math.round(price / 50) * 50 : null,
        yearFrom: Number(yearMin) || null,
        yearTo: Number(yearMax) || null,
        image: image || null,
      };
    })
    .filter((item) => item.path && item.count >= 3)
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "ru"));
}

/** Марки по числу машин, у каждой — все её модели из `entries`. */
export function homeModelBrands(entries = []) {
  const totals = new Map();
  for (const item of entries) totals.set(item.brand, (totals.get(item.brand) || 0) + item.count);
  return [...totals]
    .filter(([brand]) => brandLandingPath(brand))
    .sort((left, right) => right[1] - left[1])
    .map(([brand, total]) => ({
      brand,
      path: brandLandingPath(brand),
      total,
      models: entries.filter((item) => item.brand === brand).map(({ brand: _brand, ...item }) => item),
    }));
}

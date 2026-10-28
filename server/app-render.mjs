// Готовая разметка приложения для страниц каталога: общий каталог, разделы
// (марки, типы, кузова, цены) и страницы моделей.
//
// Одна разметка для человека и робота: сервер рисует ту же страницу, что браузер
// (renderCatalogApp в src/entry-server.jsx), встраивает данные, из которых она
// собрана, а браузер её оживляет, не перерисовывая. До 26.09.2026 разделы отдавали
// роботу отдельную упрощённую копию, и она со временем разошлась со страницей
// посетителя: другие машины, другие блоки, другие заголовки.
//
// Сборка приложения грузится лениво и один раз. Нет сборки или отрисовка упала —
// вызывающий отдаёт простую версию страницы: хуже, но живую.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CATALOG_SORTS, catalogShuffleSeed, catalogSort } from "../src/catalog-url.js";
import { isTrackingParam } from "../src/tracking-params.js";

const entryServerPath = fileURLToPath(new URL("../dist/ssr/entry-server.js", import.meta.url));
let entryServerPromise = null;

export const loadEntryServer = () => {
  if (!entryServerPromise) {
    entryServerPromise = existsSync(entryServerPath)
      ? import(pathToFileURL(entryServerPath).href).catch((error) => {
          console.error("страницы каталога: сборка приложения не загрузилась, отдаём простую версию", error);
          return null;
        })
      : Promise.resolve(null);
  }
  return entryServerPromise;
};

/** Разметка страницы каталога по адресу и встроенным данным; null — не получилось. */
export async function renderCatalogAppMarkup(path, search, boot, options = {}) {
  const entry = await loadEntryServer();
  const render = entry?.renderCatalogApp || entry?.renderModelApp;
  if (!render) return null;
  try {
    return render(path, search, boot, options);
  } catch (error) {
    console.error(`страницы каталога: отрисовка ${path} упала, отдаём простую версию`, error);
    return null;
  }
}

// Порядок «по умолчанию» перемешан по ключу (s0…s11, как в приложении). Для готовой
// страницы ключ выбирает сервер — один на минские сутки: робот при каждом заходе в
// течение дня видит ту же выдачу, а она всё равно обновляется каждый день.
export const dailyShuffleSeed = catalogShuffleSeed;

// Готовую первую страницу выдачи встраиваем только для адреса без своих фильтров
// (кроме страницы и порядка): фильтры каталог разбирает сам, и совпасть байт в байт
// список с ними не обязан — тогда обе стороны рисуют заглушку, а список приходит запросом.
// Метки переходов (utm, yclid, nocount…) фильтрами не считаются: выдачу они не меняют.
const PLAIN_KEYS = new Set(["page", "sort", "seed"]);
export const plainCatalogSearch = (params) => [...params.keys()].every((key) => PLAIN_KEYS.has(key) || isTrackingParam(key));

// Порядки из выпадающего списка каталога (sortOptions в src/App.jsx).
export { CATALOG_SORTS };

/**
 * Порядок первой выдачи совпадает с браузером: выбранный порядок из адреса,
 * иначе «Свежие и разные», включая модели и пагинацию.
 */
export function catalogSortFor(params) {
  return catalogSort(params);
}

/** Строка запроса для оживления: только номер страницы и порядок. */
export function catalogBootSearch(params) {
  const kept = new URLSearchParams();
  for (const [key, value] of params) if (PLAIN_KEYS.has(key)) kept.append(key, value);
  return kept.toString();
}

const LISTING_BOOT_FIELDS = new Set([
  "id", "externalId", "sourceId", "source", "sourceUrl", "origin", "brand", "model", "year", "title",
  "type", "drive", "bodyType", "bodyStructure", "vehicleClass", "description", "rawModel", "rawSeries",
  "battery", "electricRange", "combinedRange", "range", "batteryHealth", "appearanceScore",
  "engine", "engineCc", "engineVolume", "transmission", "sourceFuelType", "fuelType", "horsepower",
  "bodyColor", "mileage", "owners", "conditionGrade", "acceleration", "tireRim",
  "city", "manufactureDate", "firstRegistration", "dimensions", "curbWeight",
  "chinaPrice", "usdPrice", "sourcePrice", "sourceCurrency", "priceBasis", "fobPort", "fobPriceUsd",
  "previousPriceUsd", "priceChangedAt", "firstSeenAt", "importedAt", "checkedAt",
  "available", "soldAt", "availabilityStatus", "image",
]);

export const bootCars = (items) => items.map((item) => ({
  ...Object.fromEntries(Object.entries(item).filter(([key]) => LISTING_BOOT_FIELDS.has(key))),
  images: (item.images || []).slice(0, 5),
  _summary: true,
}));

// metaValue may be replaced by the browser preload. Hydration reads the immutable
// API snapshot so its first filter options/counts match the server's HTML.
export function catalogMetaBoot(query, meta) {
  const key = String(query || "");
  return { metaValue: meta, metaQuery: key, api: { [`/api/catalog/meta${key ? `?${key}` : ""}`]: meta } };
}

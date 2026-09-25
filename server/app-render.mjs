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
const SHUFFLE_SEEDS = 12;
export const dailyShuffleSeed = (now = Date.now()) => `s${Math.floor((now + 3 * 3600 * 1000) / 86400000) % SHUFFLE_SEEDS}`;

// Готовую первую страницу выдачи встраиваем только для адреса без своих фильтров
// (кроме страницы и порядка): фильтры каталог разбирает сам, и совпасть байт в байт
// список с ними не обязан — тогда обе стороны рисуют заглушку, а список приходит запросом.
const PLAIN_KEYS = new Set(["page", "sort"]);
export const plainCatalogSearch = (params) => [...params.keys()].every((key) => PLAIN_KEYS.has(key));

// Порядки из выпадающего списка каталога (sortOptions в src/App.jsx).
export const CATALOG_SORTS = new Set(["default", "price_asc", "price_desc", "newest", "mileage_asc", "range_desc", "year_desc", "year_asc"]);

/**
 * Порядок первой выдачи — так же, как решает каталог в браузере: порядок из адреса,
 * иначе у страницы списка («?page=7») и у страницы модели — по цене, иначе перемешано.
 */
export function catalogSortFor(params, { model = false } = {}) {
  const sort = params.get("sort");
  if (CATALOG_SORTS.has(sort)) return sort;
  return params.get("page") || model ? "price_asc" : "default";
}

/** Строка запроса для оживления: только номер страницы и порядок. */
export function catalogBootSearch(params) {
  const kept = new URLSearchParams();
  for (const key of ["page", "sort"]) if (params.get(key)) kept.set(key, params.get(key));
  return kept.toString();
}

// Лента карточки списка показывает пять кадров — остальные адреса (у машины их
// бывает сорок) только раздували бы страницу: список встраивается в неё целиком.
// История цены в браузере не нужна вовсе (стрелка цены берётся из двух полей записи).
export const bootCars = (items) => items.map(({ priceHistory: _history, ...item }) => ({ ...item, images: (item.images || []).slice(0, 5) }));

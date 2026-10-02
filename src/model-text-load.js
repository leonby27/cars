import {SITE} from './site-profile.js';
import {russianModelText} from './markets/ru-content.js';
// Текст обзора для браузера: подгружается отдельным файлом, когда открыли страницу
// модели или перешли на неё внутри сайта.
//
// Зачем: тексты 130 обзоров — 1,3 МБ, и раньше они лежали внутри общего файла
// приложения. Их скачивал каждый посетитель, даже если открыл только каталог.
// Сборщик разрезает эту папку на отдельные файлы, по одному на модель (2–7 КБ), и
// браузер берёт ровно тот, который нужен.
//
// Сервер и сборка этим загрузчиком не пользуются: там все тексты нужны сразу и
// читаются из `src/model-texts.js`.
import { rewriteEvDutyCopyDeep } from "./ev-duty-copy.js";

const loaded = new Map();

/** Уже загруженный текст обзора или `null` — для отрисовки без ожидания. */
export const loadedModelText = (slug) => loaded.get(slug) || null;

/**
 * Положить текст в загруженные заранее — для сервера: он собирает готовую страницу
 * модели и уже держит все тексты (src/model-texts.js), а разметка обязана совпасть
 * с той, что браузер оживит, подгрузив тот же файл до старта (main.jsx).
 */
export const primeModelText = (slug, text) => {
  if (slug && text) loaded.set(slug, text);
};

/**
 * Загружает текст обзора. Повторный вызов отдаёт уже загруженный, поэтому
 * возвращаться на страницу модели можно без новых запросов.
 * Неизвестный адрес — `null`: страницы с таким обзором просто нет.
 */
export async function loadModelText(slug) {
  // Российская версия получает собственный справочный текст из фактов каталога;
  // белорусские авторские обзоры не подставляем как региональную редакцию.
  if (!slug || SITE.market === 'RU') return null;
  if (loaded.has(slug)) return loaded.get(slug);
  const { files } = await import("./model-text-imports.js");
  const file = files[`./model-texts/${slug}.js`];
  if (!file) return null;
  // Пока действует льгота, текст отдаётся слово в слово; когда квота кончится,
  // фразы про нулевую пошлину переписываются — так же, как на сервере.
  const text = (SITE.market==='RU'?russianModelText((await file()).default):rewriteEvDutyCopyDeep((await file()).default));
  loaded.set(slug, text);
  return text;
}

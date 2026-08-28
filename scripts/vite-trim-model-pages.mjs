// Убирает из браузерной сборки поля обзоров, которые нужны только серверу.
//
// Зачем: `src/model-pages.js` — самый большой файл приложения (480 КБ, 449 обзоров).
// Браузер скачивает его на любой странице сайта, хотя двумя полями из записи не
// пользуется вовсе: `lead` стоит только в разметке, которую собирает сервер
// (server/seo-render.mjs и scripts/generate-seo-pages.mjs), а `seoDescription` шёл
// в описание страницы при переходах внутри сайта — там его никто не читает, поисковику
// же описание отдаёт сам сервер. Вместе это 113 КБ: сорок с лишним килобайт в сжатом
// виде, которые ехали к каждому посетителю впустую.
//
// Как: на сборке клиента вырезаем эти поля из текста файла. Сервер и генератор страниц
// читают тот же файл напрямую (без сборки Vite), поэтому у них остаются все поля.
//
// Что помнить: если поле `lead` или `seoDescription` понадобится в браузере, его нужно
// убрать из TRIMMED_FIELDS — иначе оно будет `undefined` без всякой ошибки. На случай
// молчаливой поломки есть проверка в tests/model-pages-trim.test.mjs: она сверяет, что
// после вырезания остальные поля всех 449 обзоров целы.
export const TRIMMED_FIELDS = ["lead", "seoDescription"];

/**
 * Вырезает перечисленные поля из объектных записей файла.
 *
 * Разбор простой, потому что записи обзоров — обычные объектные литералы: находим
 * `поле:` с начала строки, пропускаем пробелы и переводы строк, читаем строку в
 * двойных кавычках с учётом экранирования и убираем всё вместе с запятой. Если
 * значение окажется не строкой (например, склейкой или шаблоном), поле останется
 * на месте: лучше лишние килобайты, чем сломанный файл.
 */
export const trimFields = (code, fields = TRIMMED_FIELDS) => {
  let out = code;
  for (const field of fields) {
    const marker = new RegExp(`^([ \\t]*)${field}:`, "m");
    let guard = 0;
    for (;;) {
      if (guard++ > 5000) break;
      const match = marker.exec(out);
      if (!match) break;
      const start = match.index;
      let i = start + match[0].length;
      while (i < out.length && /\s/.test(out[i])) i += 1;
      if (out[i] !== '"') break; // не строковое значение — не трогаем поле вовсе
      i += 1;
      while (i < out.length) {
        if (out[i] === "\\") i += 2;
        else if (out[i] === '"') { i += 1; break; }
        else i += 1;
      }
      if (out[i] === ",") i += 1;
      while (i < out.length && (out[i] === " " || out[i] === "\t")) i += 1;
      if (out[i] === "\n") i += 1;
      out = out.slice(0, start) + out.slice(i);
    }
  }
  return out;
};

/**
 * Плагин Vite. Работает только на сборке клиента: в режиме разработки файл остаётся
 * целым, чтобы правки обзоров были видны сразу и без сюрпризов.
 */
export const trimModelPages = () => ({
  name: "abcars-trim-model-pages",
  apply: "build",
  enforce: "pre",
  transform(code, id) {
    if (!id.endsWith("/src/model-pages.js")) return null;
    const trimmed = trimFields(code);
    return trimmed === code ? null : { code: trimmed, map: null };
  },
});

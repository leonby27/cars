// Из браузерной сборки вырезаются поля обзоров, которые читает только сервер
// (scripts/vite-trim-model-pages.mjs). Проверяем, что вырезание аккуратное: обзоры
// все на месте, лишние поля ушли, остальные не изменились ни на символ. Без такой
// проверки ошибка была бы молчаливой — поле стало бы `undefined`, страница собралась
// бы, а заголовок или превью пропали.
import assert from "node:assert/strict";
import test from "node:test";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { TRIMMED_FIELDS, trimFields } from "../scripts/vite-trim-model-pages.mjs";
import { MODEL_PAGES } from "../src/model-pages.js";

test("вырезание полей обзоров не портит остальные данные", async () => {
  const source = readFileSync(new URL("../src/model-pages.js", import.meta.url), "utf8");
  const trimmed = trimFields(source);
  assert.ok(trimmed.length < source.length, "после вырезания файл должен стать меньше");

  // Импортируем урезанный файл как настоящий модуль: он лежит рядом с исходным,
  // чтобы относительные импорты внутри него разрешились.
  const path = new URL("../src/model-pages.trimmed.tmp.js", import.meta.url);
  writeFileSync(path, trimmed);
  let pages;
  try {
    ({ MODEL_PAGES: pages } = await import(`${path.href}?v=${Date.now()}`));
  } finally {
    unlinkSync(path);
  }

  assert.equal(pages.length, MODEL_PAGES.length, "число обзоров должно совпадать");
  for (let i = 0; i < MODEL_PAGES.length; i += 1) {
    const original = MODEL_PAGES[i];
    const short = pages[i];
    for (const field of TRIMMED_FIELDS) {
      assert.equal(short[field], undefined, `поле ${field} должно быть вырезано у ${original.slug}`);
      assert.ok(original[field], `поле ${field} должно быть в исходных данных у ${original.slug}`);
    }
    for (const [key, value] of Object.entries(original)) {
      if (TRIMMED_FIELDS.includes(key)) continue;
      assert.deepEqual(short[key], value, `поле ${key} обзора ${original.slug} изменилось при вырезании`);
    }
  }
});

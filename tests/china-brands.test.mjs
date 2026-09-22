import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_POWERTRAINS, CHINA_BRANDS, CHINA_MADE_FOREIGN } from "../src/china-brands.js";
import { brandLandingPath } from "../src/catalog-landings.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const all = [...CHINA_BRANDS, ...CHINA_MADE_FOREIGN];

test("у каждой марки справочника есть файл значка", () => {
  // Значки те же, что в каталоге. Опечатка в имени файла дала бы на странице
  // пустое место — и заметили бы это не мы, а посетитель.
  for (const item of all) {
    const file = path.join(root, "public", "brands", `${item.logo}.svg`);
    assert.ok(existsSync(file), `нет значка для ${item.brand}: ${item.logo}.svg`);
  }
});

test("марки не повторяются", () => {
  const names = all.map((item) => item.brand);
  assert.equal(new Set(names).size, names.length);
});

test("у каждой марки указаны выпускаемые типы машин", () => {
  const allowed = new Set(["Бензин", "Гибрид", "Электро"]);
  for (const item of all) {
    assert.ok(BRAND_POWERTRAINS[item.brand]?.length, `у ${item.brand} не указаны типы машин`);
    assert.ok(BRAND_POWERTRAINS[item.brand].every((type) => allowed.has(type)), `у ${item.brand} неизвестный тип машин`);
  }
});

test("у китайской марки заполнено всё, из чего состоит карточка", () => {
  for (const item of CHINA_BRANDS) {
    for (const field of ["say", "chinese", "group", "about", "since"]) {
      assert.ok(item[field], `у ${item.brand} не заполнено поле ${field}`);
    }
    assert.ok(item.since >= 1900 && item.since <= new Date().getFullYear(), `странный год у ${item.brand}`);
  }
});

test("названия марок совпадают с каталогом", () => {
  // Марка из справочника должна называться ровно так же, как в каталоге: иначе
  // число машин посчитается нулевым, а ссылка на раздел не построится.
  const missing = all.filter((item) => !brandLandingPath(item.brand));
  assert.deepEqual(missing.map((item) => item.brand), [], "этих марок нет среди разделов каталога");
});

test("у героя справочника есть флаг во всех форматах иллюстраций", () => {
  for (const extension of ["png", "webp", "avif"]) {
    assert.ok(existsSync(path.join(root, "public", "services", `china-brands.${extension}`)), `нет china-brands.${extension}`);
  }
});

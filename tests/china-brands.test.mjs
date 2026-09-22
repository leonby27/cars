import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_POWERTRAINS, CHINA_BRANDS, CHINA_MADE_FOREIGN } from "../src/china-brands.js";
import { BRAND_PRICE_SEGMENTS, brandMatchesPriceSegment } from "../src/brand-directory-filters.js";
import { brandLandingPath } from "../src/catalog-landings.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const all = [...CHINA_BRANDS, ...CHINA_MADE_FOREIGN];
const appSource = readFileSync(path.join(root, "src", "App.jsx"), "utf8");

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

test("ценовые сегменты отбирают марку по диапазонам её моделей", () => {
  const facts = { priceRanges:[{ min:15000, max:19000 }, { min:42000, max:48000 }] };
  assert.equal(brandMatchesPriceSegment(facts, "Все сегменты"), true);
  assert.equal(brandMatchesPriceSegment(facts, "До 20 000 $"), true);
  assert.equal(brandMatchesPriceSegment(facts, "20 000–40 000 $"), false);
  assert.equal(brandMatchesPriceSegment(facts, "От 40 000 $"), true);
  assert.deepEqual(BRAND_PRICE_SEGMENTS.map((item) => item.label), ["Все сегменты", "До 20 000 $", "20 000–40 000 $", "От 40 000 $"]);
});

test("поиск и сортировка стоят отдельно от трёх фильтров справочника", () => {
  assert.match(appSource, /className="brand-directory-shell"[\s\S]*?className="market-compare-controls brand-directory-controls"[\s\S]*?brand-directory-search[\s\S]*?market-compare-sort brand-directory-sort/);
  assert.match(appSource, /className="market-compare-sort brand-directory-sort"[\s\S]*?mobileIcon=\{SortAscending\}[\s\S]*?mobileActionSheet=\{narrow\}/);
  assert.match(appSource, /className="market-compare-filter-row brand-directory-filter-row"[\s\S]*?brand-directory-scope[\s\S]*?brand-directory-powertrain-filter[\s\S]*?brand-directory-price-filter/);
});

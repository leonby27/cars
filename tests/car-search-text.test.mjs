import test from "node:test";
import assert from "node:assert/strict";
import { NUMBER_ONLY_SPEC_FIELDS, SPEC_FIELDS, carSearchText, matchesSearchText, searchTextWords } from "../src/car-search-text.js";
import { vehicleSpecifications } from "../server/repository.mjs";
import { searchTerms } from "../server/repository.mjs";

const car = {
  brand: "BYD",
  model: "Yuan UP",
  title: "BYD Yuan UP 2025",
  description: "2024 401KM Surpass Edition",
  city: "Mudanjiang",
  bodyType: "SUV / кроссовер",
  batteryType: "LFP Battery",
  batteryBrand: "CATL",
  transmission: "Electric vehicle single-speed transmission",
  vehicleClass: "Compact SUV",
  tireSizeFront: "215/65 R16",
  enginePower: 163,
  torqueNm: 290,
};

test("в строку поиска попадают комплектация, город и характеристики", () => {
  const text = carSearchText(car);
  assert.ok(text.includes("surpass edition"));
  assert.ok(text.includes("lfp battery"));
  assert.ok(text.includes("catl"));
  assert.ok(text.includes("215/65 r16"));
  assert.ok(text.includes("mudanjiang"));
  // Голые числа в строку не идут: «290» не должно находиться поиском по тексту,
  // для момента и мощности есть свои фильтры.
  assert.ok(!text.includes("290"));
  assert.ok(!text.includes("163"));
});

test("подходит машина, в которой нашлось каждое слово", () => {
  assert.equal(matchesSearchText(car, ["surpass"]), true);
  assert.equal(matchesSearchText(car, ["surpass", "lfp"]), true);
  assert.equal(matchesSearchText(car, ["surpass", "nmc"]), false);
  assert.equal(matchesSearchText(car, []), true);
});

test("строка запроса режется на слова одинаково на сервере и в браузере", () => {
  const query = "  BYD Yuan UP, Surpassing 430; ЛФП  ";
  assert.deepEqual(searchTextWords(query), searchTerms(query));
  // Однобуквенные обрывки выбрасываются: по ним совпадает пол-каталога.
  assert.deepEqual(searchTextWords("a b лфп"), ["лфп"]);
  // Знаки внутри слова остаются — размер шин и обозначение мотора набирают целиком.
  assert.deepEqual(searchTextWords("215/65 1.3t dm-i"), ["215/65", "1.3t", "dm-i"]);
});

test("в строку поиска входят все текстовые характеристики машины", () => {
  const known = new Set([...SPEC_FIELDS, ...NUMBER_ONLY_SPEC_FIELDS]);
  const missing = Object.keys(vehicleSpecifications({})).filter((field) => !known.has(field));
  assert.deepEqual(missing, [], `новые характеристики не попали в поиск: ${missing.join(", ")}`);
});

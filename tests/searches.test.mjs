import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchFilters } from "../server/searches.mjs";

// Сохранённый поиск приходит с клиента целиком: сервер принимает только известные
// ключи и строковые значения разумной длины, всё остальное отклоняет или отбрасывает.

const validFilters = {
  type: "Электромобиль",
  brand: "Audi",
  model: ["Q4 e-tron"],
  bodyType: [],
  yearMin: "2022",
  yearMax: "До",
  mileage: "до 30 000 км",
  priceMin: "Цена от",
  priceMax: "40000",
  drive: "Полный",
  owners: "1 владелец",
  battery: "От 60 кВт·ч",
  condition: "Отличное состояние",
  sort: "price_asc",
};

test("корректный набор фильтров проходит и очищается от лишних ключей", () => {
  const normalized = normalizeSearchFilters({ ...validFilters, extra: "мусор", __proto__: null });
  assert.deepEqual(normalized, validFilters);
  assert.equal("extra" in normalized, false);
});

test("наборы не той формы отклоняются целиком", () => {
  assert.equal(normalizeSearchFilters(null), null);
  assert.equal(normalizeSearchFilters("строка"), null);
  assert.equal(normalizeSearchFilters([]), null);
  // Пропущенный ключ, число вместо строки, слишком длинное значение.
  assert.equal(normalizeSearchFilters({ ...validFilters, brand: undefined }), null);
  assert.equal(normalizeSearchFilters({ ...validFilters, yearMin: 2022 }), null);
  assert.equal(normalizeSearchFilters({ ...validFilters, brand: "x".repeat(81) }), null);
  // Списочные поля принимают только массивы строк ограниченной длины.
  assert.equal(normalizeSearchFilters({ ...validFilters, model: "Q4 e-tron" }), null);
  assert.equal(normalizeSearchFilters({ ...validFilters, model: [42] }), null);
  assert.equal(normalizeSearchFilters({ ...validFilters, bodyType: Array.from({ length: 31 }, () => "Седан") }), null);
});

test("пустые списочные поля допустимы и означают «все»", () => {
  const normalized = normalizeSearchFilters({ ...validFilters, model: [], bodyType: [] });
  assert.deepEqual(normalized.model, []);
  assert.deepEqual(normalized.bodyType, []);
});

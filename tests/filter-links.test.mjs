import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_LANDINGS, catalogLandingForFilters, landingFilterParams } from "../src/catalog-landings.js";

// С 25.09.2026 пункты марки, типа двигателя и кузова в фильтре каталога — ссылки на
// разделы (FilterPanel в src/App.jsx): пункт становится ссылкой, только если его выбор
// ведёт на другой уже существующий раздел. Проверяем то же правило на всех страницах
// каталога: новых адресов оно не порождает, и до каждого раздела можно дойти.

const value = (landing, key) => [...landingFilterParams(landing)].find(([name]) => name === key)?.[1];
const valuesOf = (kind, key) => [...new Set(CATALOG_LANDINGS.filter((landing) => landing.kind === kind).map((landing) => value(landing, key)))];
const brands = valuesOf("brand", "brand");
const types = valuesOf("powertrain", "type");
const bodies = valuesOf("bodyType", "body");

function filterLinks(page) {
  const base = page.path === "/catalog" ? [] : [...landingFilterParams(page)].filter(([key]) => ["brand", "type", "body"].includes(key));
  const links = [];
  for (const [key, options] of [["brand", brands], ["type", types], ["body", bodies]]) {
    for (const option of options) {
      const params = base.filter(([name]) => name !== key);
      params.push([key, option]);
      const target = catalogLandingForFilters(new URLSearchParams(params).toString(), page.path)?.path;
      if (target && target !== page.path) links.push(target);
    }
  }
  return links;
}

test("ссылки фильтра ведут только на существующие разделы, и до каждого можно дойти", () => {
  const pages = [{ path: "/catalog" }, ...CATALOG_LANDINGS.filter((landing) => landing.kind !== "price")];
  const known = new Set(CATALOG_LANDINGS.map((landing) => landing.path));
  const reached = new Set();
  for (const page of pages) {
    for (const link of filterLinks(page)) {
      assert.ok(known.has(link), `${page.path}: ссылка на несуществующий раздел ${link}`);
      reached.add(link);
    }
  }
  const missing = CATALOG_LANDINGS.filter((landing) => landing.kind !== "price" && !reached.has(landing.path)).map((landing) => landing.path);
  assert.deepEqual(missing, [], "до этих разделов фильтр не доводит");
});

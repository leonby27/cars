import assert from "node:assert/strict";
import test from "node:test";

// Модуль работает с sessionStorage браузера, поэтому подставляем простое хранилище
// до его загрузки.
const store = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
};

const { readCatalogReturn, saveCatalogReturn, saveCatalogReturnScroll } = await import("../src/catalog-return.js");

test("позиция прокрутки пишется только в состояние той же страницы", () => {
  // У разделов каталога («/catalog/byd», «/catalog/suv») параметров в адресе нет.
  // Пока сверялись только параметры, состояние одного раздела применялось к другому:
  // заголовок менялся, а выдача оставалась от прежней марки.
  store.clear();
  saveCatalogReturn({ catalog: { filters: { brand: "BYD" } }, path: "/catalog/byd", search: "", scrollY: 100 });

  saveCatalogReturnScroll(900, "/catalog/suv", "");
  assert.equal(readCatalogReturn().scrollY, 100, "состояние чужого раздела трогать нельзя");

  saveCatalogReturnScroll(900, "/catalog/byd", "");
  assert.equal(readCatalogReturn().scrollY, 900);

  // Параметры адреса по-прежнему учитываются: тот же путь с другим отбором — другая выдача.
  saveCatalogReturnScroll(1500, "/catalog/byd", "?yearFrom=2024");
  assert.equal(readCatalogReturn().scrollY, 900);
});

test("состояние без каталога не читается", () => {
  store.clear();
  saveCatalogReturn({ path: "/catalog", search: "", scrollY: 10 });
  assert.equal(readCatalogReturn(), null);
});

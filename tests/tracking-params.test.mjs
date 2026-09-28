import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { isTrackingParam, withoutTrackingParams } from "../src/tracking-params.js";
import { catalogBootSearch, plainCatalogSearch } from "../server/app-render.mjs";
import { plainModelSearch } from "../server/model-page.mjs";

// 27.09.2026: с любой меткой в адресе раздела (utm из рекламы, yclid, наш nocount)
// сервер и браузер отказывались от готового списка — человек из объявления видел
// пустые заготовки вместо 48 машин.

test("метки переходов распознаются, фильтры каталога — нет", () => {
  for (const key of ["utm_source", "UTM_Campaign", "yclid", "ysclid", "gclid", "fbclid", "nocount", "_openstat"]) assert.equal(isTrackingParam(key), true, key);
  for (const key of ["page", "sort", "brand", "model", "priceTo", "yearFrom", "q", "type"]) assert.equal(isTrackingParam(key), false, key);
});

test("без меток остаются только настоящие параметры, порядок сохраняется", () => {
  assert.equal(withoutTrackingParams("?utm_source=ya&page=2&yclid=1&sort=newest").toString(), "page=2&sort=newest");
  assert.equal(withoutTrackingParams(new URLSearchParams("nocount=1")).toString(), "");
  const source = new URLSearchParams("utm_source=x&page=3");
  withoutTrackingParams(source);
  assert.equal(source.toString(), "utm_source=x&page=3");
});

test("адрес раздела и модели с метками рекламы получает готовый список", () => {
  for (const search of ["utm_source=yandex&utm_medium=cpc", "yclid=123", "nocount=1", "page=2&gclid=abc", "sort=newest&fbclid=z"]) {
    const params = new URLSearchParams(search);
    assert.equal(plainCatalogSearch(params), true, search);
    assert.equal(plainModelSearch(params), true, search);
  }
  assert.equal(plainCatalogSearch(new URLSearchParams("utm_source=x&priceTo=20000")), false);
  assert.equal(plainModelSearch(new URLSearchParams("utm_source=x&yearFrom=2023")), false);
});

test("браузер сверяет встроенный список с адресом без меток — как сервер", () => {
  const address = "?utm_source=yandex&page=2&sort=newest&yclid=5";
  assert.equal(withoutTrackingParams(address).toString(), catalogBootSearch(new URLSearchParams(address.slice(1))));
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /boot\.catalogSearch \|\| ""\) === withoutTrackingParams\(window\.location\.search\)\.toString\(\)/);
  assert.match(app, /const pageHref = \(n\) => \{[\s\S]{0,300}withoutTrackingParams\(window\.location\.search\)/);
});

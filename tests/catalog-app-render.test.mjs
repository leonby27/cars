import assert from "node:assert/strict";
import test from "node:test";
import { findCatalogLanding } from "../src/catalog-landings.js";
import { bootCars, catalogBootSearch, catalogSortFor, dailyShuffleSeed, plainCatalogSearch } from "../server/app-render.mjs";
import { createSeoRenderer } from "../server/seo-render.mjs";

// С 26.09.2026 каталог и разделы отдаются готовой разметкой приложения — одной для
// человека и робота. До этого робот получал отдельную упрощённую копию, и она
// разошлась со страницей посетителя (другие машины, другие блоки, другие заголовки).

test("порядок первой выдачи — как решает каталог в браузере", () => {
  assert.equal(catalogSortFor(new URLSearchParams()), "default");
  assert.equal(catalogSortFor(new URLSearchParams("page=3")), "price_asc");
  assert.equal(catalogSortFor(new URLSearchParams("sort=newest&page=2")), "newest");
  assert.equal(catalogSortFor(new URLSearchParams("sort=что-то")), "default");
  assert.equal(catalogSortFor(new URLSearchParams(), { model: true }), "price_asc");
});

test("ключ перемешивания один на минские сутки и из того же набора, что у приложения", () => {
  const day = Date.UTC(2026, 8, 26, 12);
  assert.match(dailyShuffleSeed(day), /^s(\d|1[01])$/);
  assert.equal(dailyShuffleSeed(day), dailyShuffleSeed(day + 3600 * 1000));
  // Полночь по Минску (21:00 UTC) — новый ключ.
  assert.notEqual(dailyShuffleSeed(Date.UTC(2026, 8, 26, 20, 59)), dailyShuffleSeed(Date.UTC(2026, 8, 26, 21, 1)));
});

test("готовый список встраивается только для адреса без своих фильтров", () => {
  assert.equal(plainCatalogSearch(new URLSearchParams("page=2&sort=newest")), true);
  assert.equal(plainCatalogSearch(new URLSearchParams("yearMin=2022")), false);
  assert.equal(catalogBootSearch(new URLSearchParams("utm_source=x&page=2&sort=newest")), "page=2&sort=newest");
});

test("во встроенных данных у машины не больше пяти кадров и нет истории цены", () => {
  const [car] = bootCars([{ id: "che168-1", images: Array.from({ length: 30 }, (_, i) => `/p/${i}.jpg`), priceHistory: [{ at: "2026-09-01" }] }]);
  assert.equal(car.images.length, 5);
  assert.equal("priceHistory" in car, false);
});

test("раздел с готовой разметкой: метка оживления, данные в странице, один FAQPage", () => {
  const shell = `<!doctype html><html lang="ru"><head><title>abcars.by</title></head><body><div id="root"></div></body></html>`;
  const renderer = createSeoRenderer({ shell, siteUrl: "https://abcars.by", allowIndexing: true });
  const landing = findCatalogLanding("/catalog/electric");
  const app = { appRoot: '<main><h1>Электромобили из Китая</h1><script type="application/ld+json">{"@type":"FAQPage"}</script></main>', appRootPath: landing.path, bootData: { catalogPath: landing.path, catalogSeed: "s3" } };
  const { html } = renderer.landingPage({ landing, cars: [], total: 10, app });
  assert.match(html, /<div id="root" data-prerender="\/catalog\/electric">/);
  assert.match(html, /"catalogSeed":"s3"/);
  assert.doesNotMatch(html, /class="seo-body"/, "упрощённой копии в странице быть не должно");
  assert.equal((html.match(/FAQPage/g) || []).length, 1, "разметку вопросов ставит приложение, вторая копия не нужна");
});

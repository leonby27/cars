import assert from "node:assert/strict";
import test from "node:test";
import { createSeoRenderer } from "../server/seo-render.mjs";
import { landingIndexable } from "../server/catalog-page.mjs";
import { findCatalogLanding } from "../src/catalog-landings.js";

// 25.09.2026 (разбор против IM4CAR): 22 раздела вычеркнутых марок (Ford, Jeep,
// Maserati, smart, Chevrolet…) отдавались с «index, follow» и текстом «машин нет».
// Для человека страница остаётся — с предложением привезти под заказ, — а поисковику
// говорим «не индексировать»: пустая страница в выдаче только портит впечатление о сайте.

const shell = `<!doctype html><html lang="ru"><head><meta charset="utf-8" /><title>abcars.by</title></head><body><div id="root"></div></body></html>`;

test("раздел без машин закрыт от индексации, раздел с машинами — открыт", () => {
  assert.equal(landingIndexable({ total: 0, allowIndexing: true }), false);
  assert.equal(landingIndexable({ total: 12, allowIndexing: true }), true);
  assert.equal(landingIndexable({ total: 12, allowIndexing: false }), false);
});

test("пустой раздел рендерится с noindex и остаётся страницей для человека", () => {
  const renderer = createSeoRenderer({ shell, siteUrl: "https://abcars.by", allowIndexing: true });
  const landing = findCatalogLanding("/catalog/ford");
  assert.ok(landing, "раздел Ford должен существовать в справочнике");
  const { html } = renderer.landingPage({ landing, cars: [], total: 0, indexable: landingIndexable({ total: 0, allowIndexing: true }) });
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /Сейчас в этом разделе машин нет/);
  assert.match(html, /<link rel="canonical" href="https:\/\/abcars\.by\/catalog\/ford"/);
});

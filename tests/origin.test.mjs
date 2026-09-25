import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVE_ORIGINS, fromPhrase, siteAdjective, siteFromPhrase } from "../src/origin.js";
import { CATALOG_INDEX_SEO, HOME_SEO } from "../src/catalog-landings.js";
import { modelCatalogSeo, modelPageIndexable } from "../src/model-landing.js";

// Страна происхождения — одна настройка (src/origin.js). Пока только Китай; когда
// добавим Корею, общие страницы скажут «из Китая и Кореи» сами.

test("пока возим только из Китая, и общие заголовки говорят именно это", () => {
  assert.deepEqual([...ACTIVE_ORIGINS], ["china"]);
  assert.equal(siteFromPhrase(), "из Китая");
  assert.equal(siteAdjective(), "китайские");
  assert.equal(fromPhrase("korea"), "из Кореи");
  assert.match(HOME_SEO.title, /^Авто из Китая в Беларусь — китайские автомобили/);
  assert.match(CATALOG_INDEX_SEO.title, /^Купить авто из Китая — каталог и цены/);
  assert.equal(CATALOG_INDEX_SEO.h1, "Каталог авто из Китая");
  // Главные запросы — «в Беларусь» и «китайские автомобили» — остаются за главной:
  // каталог их не повторяет, чтобы две страницы не спорили за одну выдачу.
  assert.doesNotMatch(CATALOG_INDEX_SEO.title, /Беларус|китайск/i);
  assert.doesNotMatch(`${HOME_SEO.title} ${CATALOG_INDEX_SEO.title}`, /Минск|б\/у|с пробегом/i);
});

test("заголовок страницы модели: «в Беларусь», число машин и цена «от»", () => {
  const seo = modelCatalogSeo({ name: "BYD Seal", facts: { total: 286, priceFrom: 27400, priceTo: 61900 }, review: { h1: "Купить BYD Seal б/у из Китая с доставкой в Минск" } });
  assert.equal(seo.title, "BYD Seal из Китая в Беларусь — 286 в наличии, от 27\u00a0400 $ | abcars.by");
  assert.equal(seo.h1, "Купить BYD Seal из Китая с доставкой в Беларусь");
  assert.match(seo.description, /б\/у/);
  assert.match(seo.description, /Минска/);
});

test("модель без обзора и меньше чем с тремя машинами не индексируется", () => {
  assert.equal(modelPageIndexable({ facts: { total: 2 } }), false);
  assert.equal(modelPageIndexable({ facts: { total: 3 } }), true);
  assert.equal(modelPageIndexable({ facts: { total: 0 }, review: { slug: "x" } }), true);
});

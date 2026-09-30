import assert from "node:assert/strict";
import test from "node:test";
import { ACTIVE_ORIGINS, fromPhrase, inPhrase, originForSource, originFromParam, siteAdjective, siteAdjectiveCapital, siteCountriesGenitive, siteFromPhrase, siteInPhrase, siteMarketplacesPhrase, siteWording } from "../src/origin.js";
import { CATALOG_INDEX_SEO, HOME_H1_PARTS, HOME_SEO } from "../src/catalog-landings.js";
import { modelCatalogSeo, modelPageIndexable } from "../src/model-landing.js";
import { bootScreen } from "../server/boot-screen.mjs";

// Страна происхождения — одна настройка (src/origin.js). С 29.09.2026 возим из Китая и
// Кореи, и общие страницы говорят «из Китая и Кореи» (решение Сергея по образцу IM4CAR);
// своя страна — только у машины и страниц стран.

test("общие страницы говорят «из Китая и Кореи», машина — свою страну", () => {
  assert.deepEqual([...ACTIVE_ORIGINS], ["china", "korea"]);
  assert.equal(siteFromPhrase(), "из Китая и Кореи");
  assert.equal(siteFromPhrase({ nbsp: true }), "из\u00a0Китая и\u00a0Кореи");
  assert.equal(siteAdjective(), "китайские и корейские");
  assert.equal(siteAdjectiveCapital(), "Китайские и корейские");
  assert.equal(siteInPhrase(), "в Китае и Корее");
  assert.equal(siteCountriesGenitive(), "Китая и Кореи");
  assert.equal(siteMarketplacesPhrase(), "с китайских и корейских площадок");
  assert.equal(fromPhrase("korea"), "из Кореи");
  assert.equal(fromPhrase("china"), "из Китая");
  assert.equal(inPhrase("korea"), "в Корее");
  assert.equal(originForSource("Che168"), "china");
  assert.equal(originForSource("Guazi"), "china");
  assert.equal(originForSource("Encar"), "korea");
  assert.equal(originFromParam("KR"), "korea");
  assert.equal(originFromParam("china"), "china");
  assert.equal(originFromParam("mars"), null);
  assert.match(HOME_SEO.title, /^Авто из Китая и Кореи в Беларусь — китайские и корейские автомобили/);
  assert.match(CATALOG_INDEX_SEO.title, /^Купить авто из Китая и Кореи — каталог и цены/);
  assert.equal(CATALOG_INDEX_SEO.h1, "Авто из Китая и Кореи");
  // Главные запросы — «в Беларусь» и «китайские автомобили» — остаются за главной:
  // каталог их не повторяет, чтобы две страницы не спорили за одну выдачу.
  assert.doesNotMatch(CATALOG_INDEX_SEO.title, /Беларус|китайск/i);
  assert.doesNotMatch(`${HOME_SEO.title} ${CATALOG_INDEX_SEO.title}`, /Минск|б\/у|с пробегом/i);
  // Слово «Китай» строкой в описании главной не живёт.
  assert.doesNotMatch(HOME_SEO.description, /в Китае/);
});

test("ссылки на страны в заголовке главной сохраняют исходный текст и первый кадр", () => {
  assert.equal(HOME_H1_PARTS.map((part) => part.text).join(""), HOME_SEO.h1);
  assert.deepEqual(HOME_H1_PARTS.filter((part) => part.href).map(({ text, href }) => [text, href]), [
    ["Китая", "/catalog/china"],
    ["Кореи", "/catalog/korea"],
  ]);
  const boot = bootScreen({ kind: "home", hrefRoute: (path) => `/preview${path}` });
  assert.match(boot, /href="\/preview\/catalog\/china"[^>]*>Китая<\/a>/);
  assert.match(boot, /href="\/preview\/catalog\/korea"[^>]*>Кореи<\/a>/);
});

test("старые тексты переводятся на фразу сайта и не портятся при повторе", () => {
  const cases = [
    ["Автомобили BYD с пробегом из Китая — доставка в Беларусь", "Автомобили BYD с пробегом из Китая и Кореи — доставка в Беларусь"],
    ["Китайские седаны с доставкой", "Китайские и корейские седаны с доставкой"],
    ["Объявления X с китайского вторичного рынка", "Объявления X с китайских и корейских площадок"],
    ["Электромобили китайского вторичного рынка", "Электромобили с китайских и корейских площадок"],
    ["Авто из\u00a0Китая с\u00a0доставкой", "Авто из\u00a0Китая и\u00a0Кореи с\u00a0доставкой"],
    ["Уже из Китая и Кореи", "Уже из Китая и Кореи"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(siteWording(input), expected);
    assert.equal(siteWording(siteWording(input)), expected);
  }
});

test("заголовок страницы модели: «в Беларусь», число машин и цена «от»", () => {
  const seo = modelCatalogSeo({ name: "BYD Seal", facts: { total: 286, priceFrom: 27400, priceTo: 61900 }, review: { h1: "Купить BYD Seal б/у из Китая с доставкой в Минск" } });
  assert.equal(seo.title, "BYD Seal из Китая и Кореи в Беларусь — 286 в наличии, от 27\u00a0400 $ | abcars.by");
  assert.equal(seo.h1, "Купить BYD Seal из Китая и Кореи с доставкой в Беларусь");
  assert.match(seo.description, /б\/у/);
  assert.match(seo.description, /Минска/);
});

test("заголовок страницы модели не показывает пояснение после двоеточия", () => {
  const seo = modelCatalogSeo({
    name: "Toyota RAV4",
    review: { h1: "Toyota RAV4 с пробегом из Китая и Кореи: сколько стоит доставка в Минск" },
  });
  assert.equal(seo.h1, "Toyota RAV4 из Китая и Кореи");
});

test("модель без обзора и меньше чем с тремя машинами не индексируется", () => {
  assert.equal(modelPageIndexable({ facts: { total: 2 } }), false);
  assert.equal(modelPageIndexable({ facts: { total: 3 } }), true);
  assert.equal(modelPageIndexable({ facts: { total: 0 }, review: { slug: "x" } }), true);
});

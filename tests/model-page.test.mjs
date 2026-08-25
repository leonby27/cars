import assert from "node:assert/strict";
import test from "node:test";
import { createSeoRenderer } from "../server/seo-render.mjs";
import { MODEL_PAGES, findModelPage } from "../src/model-pages.js";
import { modelPageWithText } from "../src/model-texts.js";
import { CATALOG_LANDINGS, findCatalogLanding, landingsForCar } from "../src/catalog-landings.js";

const shell = `<!doctype html>
<html lang="ru">
  <head><meta charset="utf-8" /><title>abcars.by</title></head>
  <body><div id="root"></div></body>
</html>
`;
const render = (options = {}) => createSeoRenderer({ shell, siteUrl: "https://abcars.by", allowIndexing: true, ...options });

// Странице для поисковика нужен обзор целиком: обложка из model-pages.js плюс текст.
const page = modelPageWithText(findModelPage("/models/byd-han"));
const cars = [
  { id: "che168-1", title: "BYD Han 2023", brand: "BYD", model: "Han", year: 2023, mileage: 21400, chinaPrice: 128000, type: "Электромобиль" },
  { id: "che168-2", title: "BYD Han 2022", brand: "BYD", model: "Han", year: 2022, mileage: 54000, chinaPrice: 96000, type: "Электромобиль" },
];
const siblings = MODEL_PAGES.filter((item) => item.brand === "BYD" && item.path !== page.path).slice(0, 8);
const brandLanding = findCatalogLanding("/catalog/byd");

test("обзор модели показывает наличие и цену, а не только текст", () => {
  // До этого 130 обзоров приходили в выдачу статьёй без единой цены: список машин под
  // текстом рисует скрипт. Запрос «BYD Han цена» покупательский — цена обязана быть
  // в самой странице.
  const { html } = render().modelPage({ modelPage: page, cars, total: 616, siblings, brandLanding });
  assert.match(html, /в наличии: 616 автомобилей/);
  // Одна цена, когда машина одна, и вилка «от … до …», когда цены разные.
  assert.match(html, /от [\d\s  ]+(?: до [\d\s  ]+)? \$ с доставкой до Минска/);
  assert.match(html, /<h2>BYD Han в наличии — цены до Минска<\/h2>/);
  assert.match(html, /<a href="\/cars\/1">BYD Han 2023<\/a>/);
});

test("обзор модели ведёт в раздел марки и к другим её моделям", () => {
  const { html } = render().modelPage({ modelPage: page, cars, total: 616, siblings, brandLanding });
  assert.match(html, /<a href="\/catalog\/byd">/);
  assert.match(html, /<h2>Другие модели BYD<\/h2>/);
  const links = [...html.matchAll(/<a href="(\/[^"]*)"/g)].map((m) => m[1]);
  // Раньше с обзора модели вели ровно 12 ссылок — меню и подвал. Здесь машин и
  // соседних моделей в примере меньше, чем на живой странице, и всё равно вдвое больше.
  assert.ok(links.length >= 20, `ссылок на странице ${links.length}, ожидалось не меньше 20`);
  // Своей же страницы среди ссылок быть не должно.
  assert.equal(links.includes(page.path), false);
});

test("текст обзора и частые вопросы остаются в странице", () => {
  const { html } = render().modelPage({ modelPage: page, cars, total: 616, siblings, brandLanding });
  assert.match(html, /<h2>Электрический или гибрид/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/abcars\.by\/models\/byd-han"/);
  // Внутренние ссылки без косой черты на конце — хостинг с чертой перебрасывает.
  assert.doesNotMatch(html, /<a href="\/[^"]+\/"/);
});

test("модель без машин в наличии не обещает предложений", () => {
  const { html } = render().modelPage({ modelPage: page, cars: [], total: 0, siblings, brandLanding });
  assert.match(html, /в наличии нет/);
  assert.doesNotMatch(html, /<ul><\/ul>/);
  assert.doesNotMatch(html, /"@type":"ItemList"/);
});

test("страница машины ведёт в разделы своей марки, типа и кузова", () => {
  const car = { id: "che168-9", title: "BYD Han 2023", brand: "BYD", model: "Han", year: 2023, mileage: 21400, chinaPrice: 128000, type: "Электромобиль", bodyType: "Седан" };
  const sections = landingsForCar(car);
  // Совпасть должны все условия раздела: электрический седан BYD попадает и в раздел
  // марки, и в раздел типа, и в раздел кузова, и в оба сочетания — но не в «гибридные
  // седаны» и не в «хэтчбеки BYD».
  assert.deepEqual(sections.map((item) => item.path).sort(), ["/catalog/byd", "/catalog/byd-sedan", "/catalog/electric", "/catalog/electric-sedan", "/catalog/sedan"]);
  const hybridSedan = landingsForCar({ ...car, type: "Гибрид" });
  assert.equal(hybridSedan.some((item) => item.path === "/catalog/electric-sedan"), false);
  assert.equal(hybridSedan.some((item) => item.path === "/catalog/hybrid-sedan"), true);
  const { html } = render().carPage({ car, related: [], sections });
  assert.match(html, /<h2>Похожие подборки<\/h2>/);
  for (const path of ["/catalog/byd", "/catalog/electric", "/catalog/sedan"]) {
    assert.match(html, new RegExp(`<a href="${path}">`));
  }
});

test("блок ссылок на разделы собирается по видам", () => {
  const html = render().sectionLinks(CATALOG_LANDINGS, { heading: "Разделы" });
  assert.match(html, /<h2>Разделы<\/h2>/);
  assert.match(html, /<h3>Марки<\/h3>/);
  assert.match(html, /<h3>Тип двигателя<\/h3>/);
  assert.match(html, /<h3>Тип кузова<\/h3>/);
  const links = [...html.matchAll(/<a href="(\/[^"]*)"/g)].map((m) => m[1]);
  assert.equal(links.length, CATALOG_LANDINGS.length);
  // Текущую страницу из списка убираем, чтобы не ссылаться на саму себя.
  const withoutSelf = render().sectionLinks(CATALOG_LANDINGS, { skip: "/catalog/byd" });
  assert.doesNotMatch(withoutSelf, /<a href="\/catalog\/byd">/);
});

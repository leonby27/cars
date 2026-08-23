import assert from "node:assert/strict";
import test from "node:test";
import { findCatalogLanding } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";
import { estimateLandedCost } from "../src/pricing.js";
import { createSeoRenderer } from "../server/seo-render.mjs";

// Раньше поисковику уходил список названий без единой суммы, хотя цена — главное,
// зачем человек открывает подборку. Теперь у машин в разметке есть цена, а у страницы
// модели — вилка по всем предложениям.

const shell = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>evcars.by</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const renderer = createSeoRenderer({ shell, siteUrl: "https://evcars.by", allowIndexing: true });
const car = (id, chinaPrice, year = 2023) => ({
  id: `che168-${id}`,
  title: `BYD Han ${year}`,
  brand: "BYD",
  model: "Han",
  year,
  mileage: 40000,
  chinaPrice,
  type: "Электромобиль",
  city: "Гуанчжоу",
});
const priceOf = (item) => estimateLandedCost(item).totalUsd;
const pricesIn = (html) => [...html.matchAll(/"price":(\d+)/g)].map((match) => Number(match[1]));

test("в разделе видна вилка цен, а у машин в разметке — своя цена", () => {
  const cheapest = car(1, 90000);
  const dearest = car(2, 400000);
  const shown = [cheapest, car(3, 120000), car(4, 150000)];
  const page = renderer.landingPage({
    landing: findCatalogLanding("/catalog/byd"),
    cars: shown,
    total: 5673,
    page: 1,
    pages: 50,
    perPage: 99,
    edges: { cheapest, dearest },
    priced: shown,
  });
  assert.match(page.html, new RegExp(`цены от ${priceOf(cheapest).toLocaleString("ru-RU").replace(/ /g, "\\s")} до`));
  const prices = pricesIn(page.html);
  assert.equal(prices.length, shown.length, "цена должна стоять у каждой показанной машины");
  for (const item of shown) assert.ok(prices.includes(priceOf(item)), `нет цены машины ${item.id}`);
  // Раздел — не товар, поэтому вилки как разметки товара здесь быть не должно.
  assert.doesNotMatch(page.html, /AggregateOffer/);
});

test("нижняя граница вилки не выше цены, показанной на этой же странице", () => {
  // Порядок в разделе задаёт столбец с ценой в базе, а он после смены правил расчёта
  // какое-то время отстаёт: «самая дешёвая» машина набора может оказаться дороже той,
  // что стоит в списке. Публиковать вилку, которая спорит со списком под ней, нельзя.
  const stale = car(1, 200000);
  const cheaperInList = car(2, 60000);
  const page = renderer.landingPage({
    landing: findCatalogLanding("/catalog/byd"),
    cars: [cheaperInList],
    total: 10,
    page: 1,
    pages: 1,
    perPage: 99,
    edges: { cheapest: stale, dearest: stale },
    priced: [cheaperInList],
  });
  const prices = pricesIn(page.html);
  const shownLow = Math.min(...prices);
  const written = Number(page.html.match(/цены от ([\d\s ]+) /)[1].replace(/[\s ]/g, ""));
  assert.ok(written <= shownLow, `в тексте «от ${written} $», а в списке есть машина за ${shownLow} $`);
});

test("на странице модели стоит вилка цен по всем предложениям", () => {
  const modelPage = MODEL_PAGES.find((item) => item.brand === "BYD" && item.model === "Han") || MODEL_PAGES[0];
  const cheapest = car(1, 90000);
  const dearest = car(2, 300000);
  const shown = [cheapest, car(3, 130000)];
  const page = renderer.modelPage({
    modelPage,
    cars: shown,
    total: 616,
    edges: { cheapest, dearest },
  });
  const aggregate = page.html.match(/"@type":"AggregateOffer","priceCurrency":"USD","lowPrice":(\d+),"highPrice":(\d+),"offerCount":(\d+)/);
  assert.ok(aggregate, "вилки цен в разметке нет");
  assert.equal(Number(aggregate[1]), priceOf(cheapest));
  assert.equal(Number(aggregate[2]), priceOf(dearest));
  assert.equal(Number(aggregate[3]), 616, "число предложений должно быть по всему наличию, а не по показанным");
  const prices = pricesIn(page.html);
  assert.ok(Number(aggregate[1]) <= Math.min(...prices), "нижняя граница выше цены в списке");
  assert.ok(Number(aggregate[2]) >= Math.max(...prices), "верхняя граница ниже цены в списке");
  assert.match(page.html, /в наличии: 616 [^<]*с доставкой до Минска/);
});

test("когда модели нет в наличии, вилки цен не появляется", () => {
  const modelPage = MODEL_PAGES[0];
  const page = renderer.modelPage({ modelPage, cars: [], total: 0, edges: null });
  assert.doesNotMatch(page.html, /AggregateOffer/);
  assert.doesNotMatch(page.html, /"price":/);
});

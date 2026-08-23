import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_LANDINGS, CATALOG_MAX_PAGES, CATALOG_PAGE_SIZE, catalogPageCount, findCatalogLanding } from "../src/catalog-landings.js";
import { maxOffset } from "../server/repository.mjs";
import { createSeoRenderer } from "../server/seo-render.mjs";

// Постраничный обход раздела — единственный путь, по которому поисковик доходит до
// машин глубже первой страницы: кнопку «Подгрузить ещё» он нажать не может. Раньше
// в разделе было 48 ссылок и никакого продолжения, и из 31 332 машин ссылками было
// покрыто около 4 300.

// Числа в проверках считаются от размера страницы, а не вписаны руками: размер
// меняли уже дважды, и проверки не должны переписываться следом.
const nbsp = (value) => new Intl.NumberFormat("ru-RU").format(value).replace(/\u00a0/g, "\\s");
const rangeLine = (page, pages, count) => {
  const first = (page - 1) * CATALOG_PAGE_SIZE;
  return new RegExp(`Страница ${page} из ${pages}: автомобили с ${nbsp(first + 1)}-го по ${nbsp(first + count)}-й`);
};

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
const landing = findCatalogLanding("/catalog/electric");
const cars = (from, count) =>
  Array.from({ length: count }, (_, index) => ({
    id: `che168-${from + index}`,
    title: `BYD Han ${2020 + (index % 5)}`,
    brand: "BYD",
    model: "Han",
    year: 2020 + (index % 5),
    mileage: 10000 + index,
  }));

test("страниц у списка ровно столько, сколько нужно, и не глубже потолка", () => {
  assert.equal(catalogPageCount(0), 1, "пустой список — всё равно одна страница");
  assert.equal(catalogPageCount(CATALOG_PAGE_SIZE), 1);
  assert.equal(catalogPageCount(CATALOG_PAGE_SIZE + 1), 2);
  assert.equal(catalogPageCount(20114), CATALOG_MAX_PAGES, "глубже потолка страниц быть не должно");
  // Потолок обхода не должен уходить дальше, чем каталог вообще умеет отдавать:
  // иначе поисковик получил бы адрес, по которому человек увидит пустую выдачу.
  assert.ok(CATALOG_MAX_PAGES * CATALOG_PAGE_SIZE <= maxOffset, `потолок обхода ${CATALOG_MAX_PAGES * CATALOG_PAGE_SIZE} глубже, чем отдаёт каталог (${maxOffset})`);
});

test("первая страница раздела — обычный адрес, без номера", () => {
  const page = renderer.landingPage({ landing, cars: cars(1, CATALOG_PAGE_SIZE), total: 20114, page: 1, pages: 50, perPage: CATALOG_PAGE_SIZE });
  assert.equal(page.canonical, "https://evcars.by/catalog/electric");
  assert.doesNotMatch(page.html, /rel="prev"/);
  assert.match(page.html, /<link rel="next" href="https:\/\/evcars\.by\/catalog\/electric\?page=2"/);
  assert.match(page.html, /<a href="\/catalog\/electric\?page=2">2<\/a>/);
  assert.match(page.html, rangeLine(1, 50, CATALOG_PAGE_SIZE));
});

test("вторая страница сама себе первоисточник и знает соседей", () => {
  const page = renderer.landingPage({ landing, cars: cars(101, CATALOG_PAGE_SIZE), total: 20114, page: 2, pages: 50, perPage: CATALOG_PAGE_SIZE });
  assert.equal(page.canonical, "https://evcars.by/catalog/electric?page=2");
  assert.match(page.html, /<link rel="canonical" href="https:\/\/evcars\.by\/catalog\/electric\?page=2"/);
  assert.match(page.html, /<link rel="prev" href="https:\/\/evcars\.by\/catalog\/electric"/);
  assert.match(page.html, /<link rel="next" href="https:\/\/evcars\.by\/catalog\/electric\?page=3"/);
  assert.match(page.html, /<title>[^<]*— страница 2 \| evcars\.by<\/title>/);
  assert.match(page.html, /<h1>[^<]*— страница 2<\/h1>/);
  assert.match(page.html, rangeLine(2, 50, CATALOG_PAGE_SIZE));
  assert.match(page.html, /<meta name="robots" content="index, follow/, "страницы списка закрывать от индексации нечем");
  // Нумерация в разметке списка сквозная: иначе на каждой странице первая машина
  // была бы «номером один» и страницы выглядели бы одинаковыми.
  assert.match(page.html, new RegExp(`"position":${CATALOG_PAGE_SIZE + 1}`));
  assert.match(page.html, /<a href="\/catalog\/electric" rel="prev">Предыдущая страница<\/a>/);
  assert.match(page.html, /<a href="\/catalog\/electric\?page=3" rel="next">Следующая страница<\/a>/);
  // До последней страницы должен быть переход с любой: иначе робот шёл бы к пятидесятой
  // полусотней переходов подряд.
  assert.match(page.html, /<a href="\/catalog\/electric\?page=50">50<\/a>/);
});

test("на последней странице продолжения нет", () => {
  const page = renderer.landingPage({ landing, cars: cars(4901, 14), total: 49 * CATALOG_PAGE_SIZE + 14, page: 50, pages: 50, perPage: CATALOG_PAGE_SIZE });
  assert.doesNotMatch(page.html, /rel="next"/);
  assert.match(page.html, rangeLine(50, 50, 14));
});

test("список из одной страницы обходится без навигации", () => {
  const page = renderer.landingPage({ landing, cars: cars(1, 12), total: 12, page: 1, pages: 1, perPage: CATALOG_PAGE_SIZE });
  assert.doesNotMatch(page.html, /Страницы каталога/);
  assert.doesNotMatch(page.html, /rel="next"/);
  assert.equal(page.canonical, "https://evcars.by/catalog/electric");
});

test("у каждого раздела свой постраничный адрес", () => {
  for (const item of CATALOG_LANDINGS) {
    const page = renderer.landingPage({ landing: item, cars: cars(101, 10), total: 5000, page: 2, pages: 50, perPage: CATALOG_PAGE_SIZE });
    assert.equal(page.canonical, `https://evcars.by${item.path}?page=2`);
  }
});

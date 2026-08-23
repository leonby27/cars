import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_LANDINGS, brandLandingPath, findCatalogLanding, landingApiParams, landingFilterParams } from "../src/catalog-landings.js";
import { createSeoRenderer, plural } from "../server/seo-render.mjs";

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

const render = (options = {}) => createSeoRenderer({ shell, siteUrl: "https://evcars.by", allowIndexing: true, ...options });

const cars = [
  { id: "che168-1", title: "BYD Han 2023", brand: "BYD", model: "Han", year: 2023, mileage: 21400, chinaPrice: 128000, type: "Электромобиль" },
  { id: "che168-2", title: "BYD Seal 2024", brand: "BYD", model: "Seal", year: 2024, mileage: 12000, chinaPrice: 145000, type: "Электромобиль" },
];

test("у каждого раздела свой адрес, заголовок и описание", () => {
  const paths = CATALOG_LANDINGS.map((landing) => landing.path);
  const titles = CATALOG_LANDINGS.map((landing) => landing.seoTitle);
  assert.equal(new Set(paths).size, paths.length, "адреса разделов повторяются");
  assert.equal(new Set(titles).size, titles.length, "заголовки разделов повторяются");
  for (const landing of CATALOG_LANDINGS) {
    assert.match(landing.path, /^\/catalog\/[a-z0-9-]+$/, landing.path);
    assert.ok(landing.seoTitle.length <= 70, `${landing.path}: заголовок ${landing.seoTitle.length} символов`);
    assert.ok(landing.seoDescription.length >= 70 && landing.seoDescription.length <= 175, `${landing.path}: описание ${landing.seoDescription.length} символов`);
    assert.ok(landing.notes.length >= 1, `${landing.path}: нет текста`);
    for (const note of landing.notes) assert.ok(note.length > 80, `${landing.path}: текст слишком короткий`);
  }
});

test("раздел находится по адресу и задаёт свой фильтр", () => {
  assert.equal(findCatalogLanding("/catalog/byd").brand, "BYD");
  // Косая черта на конце адреса не должна ломать поиск раздела.
  assert.equal(findCatalogLanding("/catalog/byd/").brand, "BYD");
  assert.equal(findCatalogLanding("/catalog/nonsense"), null);
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/byd")).get("brand"), "BYD");
  // В адресе каталога тип двигателя называется во множественном числе, а в запросе
  // к базе — в единственном. Без этого страница типа показывала бы весь каталог.
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/electric")).get("type"), "Электромобили");
  assert.equal(landingApiParams(findCatalogLanding("/catalog/electric")).get("type"), "Электромобиль");
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/hybrid")).get("type"), "Гибриды");
  // Кузов в адресе страницы называется `body`, а в запросе к каталогу — `bodyType`:
  // из-за этого расхождения страница кузова показывала бы весь каталог.
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/suv")).get("body"), "SUV / кроссовер");
  assert.equal(landingApiParams(findCatalogLanding("/catalog/suv")).get("bodyType"), "SUV / кроссовер");
});

test("ссылка на марку с главной ведёт на её страницу", () => {
  // Иначе ссылка ведёт на адрес с параметром, а он указывает поисковику на общий
  // каталог — то есть страницы под марку по такой ссылке не существует.
  assert.equal(brandLandingPath("BYD"), "/catalog/byd");
  assert.equal(brandLandingPath("Li Auto"), "/catalog/li-auto");
  assert.equal(brandLandingPath("Lynk & Co"), "/catalog/lynk-co");
  assert.equal(brandLandingPath("Такой марки нет"), null);
});

test("страница раздела отдаётся с текстом, машинами и разметкой списка", () => {
  const landing = findCatalogLanding("/catalog/byd");
  const modelPages = [{ path: "/models/byd-han", name: "BYD Han" }];
  // Блок «другие разделы» группирует их по виду, поэтому нужен настоящий раздел.
  const others = [findCatalogLanding("/catalog/tesla"), findCatalogLanding("/catalog/electric")];
  const { html } = render().landingPage({ landing, cars, total: 5673, modelPages, others });
  assert.match(html, /<title>BYD из Китая — каталог с ценами до Минска \| evcars\.by<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/evcars\.by\/catalog\/byd"/);
  assert.match(html, /<h1>Автомобили BYD из Китая с доставкой в Беларусь<\/h1>/);
  assert.match(html, /В наличии 5[^<]*673 автомобиля/);
  // Текст раздела лежит в самой странице, а не подгружается скриптом.
  assert.match(html, /собственный тип батареи Blade/);
  // Ссылки: машины, обзор модели, соседний раздел.
  assert.match(html, /<a href="\/cars\/1">BYD Han 2023<\/a>/);
  assert.match(html, /<a href="\/models\/byd-han">BYD Han<\/a>/);
  assert.match(html, /<a href="\/catalog\/tesla">Tesla<\/a>/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /"numberOfItems":5673/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  // Адреса без косой черты на конце — хостинг с чертой перебрасывает.
  assert.doesNotMatch(html, /<a href="\/[^"]+\/"/);
  assert.doesNotMatch(html, /"item":"https:\/\/evcars\.by\/[^"]+\/"/);
});

test("пустой раздел не показывает пустой список", () => {
  const { html } = render().landingPage({ landing: findCatalogLanding("/catalog/wagon"), cars: [], total: 0 });
  assert.doesNotMatch(html, /<ul><\/ul>/);
  assert.match(html, /<a href="\/catalog">Все автомобили с пробегом из Китая<\/a>/);
});

test("несуществующий раздел не притворяется страницей", () => {
  const html = render().landingMissingPage();
  assert.match(html, /<h1>Такого раздела каталога нет<\/h1>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test("на закрытой сборке раздел не индексируется", () => {
  const { html } = render({ allowIndexing: false }).landingPage({ landing: findCatalogLanding("/catalog/byd"), cars, total: 2 });
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
});

test("числа склоняются по-русски", () => {
  const word = (n) => plural(n, "автомобиль", "автомобиля", "автомобилей");
  assert.equal(word(1), "автомобиль");
  assert.equal(word(2), "автомобиля");
  assert.equal(word(5), "автомобилей");
  assert.equal(word(11), "автомобилей");
  assert.equal(word(21), "автомобиль");
  assert.equal(word(5673), "автомобиля");
});

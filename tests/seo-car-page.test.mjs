import assert from "node:assert/strict";
import test from "node:test";
import { createSeoRenderer, photoHref } from "../server/seo-render.mjs";
import { PHOTO_BROWSER_CACHE_VERSION } from "../src/photo-source.js";

// Заготовка страницы — то, что отдаёт сборка: пустое место под содержимое и ссылки
// на стили со скриптами. Отрисовщик обязан работать с любой такой заготовкой, поэтому
// здесь она короткая и от сборки не зависит.
const shell = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>abcars.by</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const car = {
  id: "che168-56135000",
  title: "BYD Han 2023",
  brand: "BYD",
  model: "Han",
  year: 2023,
  mileage: 21400,
  chinaPrice: 128000,
  type: "Электромобиль",
  drive: "Задний",
  bodyType: "Седан",
  battery: 85.4,
  electricRange: 605,
  owners: 1,
  city: "guangzhou",
  image: "https://example.com/han-1.jpg",
};

const related = [
  { id: "che168-56135001", title: "BYD Han 2022", brand: "BYD", model: "Han", year: 2022, mileage: 43000, chinaPrice: 99000, type: "Электромобиль" },
  { id: "guazi-777", title: "BYD Han 2024", brand: "BYD", model: "Han", year: 2024, mileage: 8000, chinaPrice: 158000, type: "Электромобиль" },
];

const modelPage = { path: "/models/byd-han", name: "BYD Han", brand: "BYD", model: "Han" };

const render = (options = {}) =>
  createSeoRenderer({ shell, siteUrl: "https://abcars.by", allowIndexing: true, ...options });

// Крошки и поля машины в разметке: та же цепочка, что над заголовком карточки, и те
// поля, что видны на странице. Латиница источника и неизвестные значения не попадают.
test("разметка карточки: полная цепочка крошек и поля машины по-русски", () => {
  const { html } = render().carPage({ car: { ...car, bodyColor: "Black", seats: "5", doors: "4", horsepower: "517", firstRegistration: "2023.4" } });
  const crumbs = JSON.parse(html.match(/<script type="application\/ld\+json">(\{[^<]*"BreadcrumbList"[^<]*)<\/script>/)[1]);
  assert.deepEqual(crumbs.itemListElement.map((item) => item.name), ["Главная", "Каталог авто из Китая", "BYD", "BYD Han", "BYD Han 2023"]);
  assert.equal(crumbs.itemListElement[2].item, "https://abcars.by/catalog/byd");
  assert.equal(crumbs.itemListElement[3].item, "https://abcars.by/catalog/byd/han");
  const vehicle = JSON.parse(html.match(/<script type="application\/ld\+json">(\{[^<]*"@type":"Vehicle"[^<]*)<\/script>/)[1]);
  assert.equal(vehicle.bodyType, "Седан");
  assert.equal(vehicle.color, "Чёрный");
  assert.equal(vehicle.seatingCapacity, 5);
  assert.equal(vehicle.numberOfDoors, 4);
  assert.equal(vehicle.vehicleEngine.enginePower.value, 517);
  assert.equal(vehicle.dateVehicleFirstRegistered, "2023-04");
  assert.equal(vehicle.itemCondition, "https://schema.org/UsedCondition");

  const bare = JSON.parse(render().carPage({ car: { ...car, bodyType: "", bodyColor: "Champagne Gold" } }).html.match(/<script type="application\/ld\+json">(\{[^<]*"@type":"Vehicle"[^<]*)<\/script>/)[1]);
  assert.equal(bare.color, undefined);
  assert.equal(bare.seatingCapacity, undefined);
});

test("страница машины несёт свой заголовок, описание и адрес-первоисточник", () => {
  const { html } = render().carPage({ car });
  assert.match(html, /<title>BYD Han 2023, пробег 21[^<]*400 км, батарея 85,4 кВт·ч — [^<]+\$ с доставкой в Беларусь \| abcars\.by<\/title>/);
  // Тема — в описании и в хлебных крошках, а не в названии машины: заголовок остаётся
  // тем, что человек ищет («BYD Han 2023»), а слова «из Китая» идут второй строкой.
  assert.match(html, /<meta name="description" content="BYD Han 2023 из Китая: пробег 21[^"]*400 км, электромобиль, ориентировочная цена до Минска — [^"]+\$\. Проверка перед покупкой\."/);
  assert.match(html, /"name":"Каталог авто из Китая"/);
  // Приставка источника из адреса убрана, косой черты на конце нет.
  assert.match(html, /<link rel="canonical" href="https:\/\/abcars\.by\/cars\/56135000"/);
  assert.match(html, /<meta property="og:url" content="https:\/\/abcars\.by\/cars\/56135000"/);
  assert.match(html, /<meta property="og:image" content="https:\/\/example\.com\/han-1\.jpg"/);
});

test("содержимое страницы лежит в разметке, а не подгружается скриптом", () => {
  const { html } = render().carPage({ car });
  const body = html.slice(html.indexOf('<div id="root">'));
  assert.match(body, /<h1>BYD Han 2023<\/h1>/);
  assert.match(body, /<dt>Пробег<\/dt><dd>21[^<]*400 км<\/dd>/);
  assert.match(body, /<dt>Год выпуска<\/dt><dd>2023<\/dd>/);
  assert.match(body, /<dt>Батарея<\/dt><dd>85,4 кВт·ч<\/dd>/);
  // Город в базе лежит латиницей («guangzhou») и показывается по-русски.
  assert.match(body, /<dt>Город в Китае<\/dt><dd>Гуанчжоу<\/dd>/);
  assert.match(body, /<dt>Ориентировочная цена до Минска<\/dt>/);
  assert.match(body, /<img src="https:\/\/example\.com\/han-1\.jpg"/);
});

test("поисковик получает разметку машины, предложения и хлебные крошки", () => {
  const { html } = render().carPage({ car });
  assert.match(html, /"@type":"Vehicle"/);
  assert.match(html, /"@type":"Offer"/);
  assert.match(html, /"priceCurrency":"USD"/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  assert.match(html, /"@type":"Brand","name":"BYD"/);
  assert.match(html, /"mileageFromOdometer":\{"@type":"QuantitativeValue","value":21400,"unitCode":"KMT"\}/);
  // Крошки ведут на те же адреса, что и первоисточник: без косой черты на конце.
  assert.doesNotMatch(html, /"item":"https:\/\/abcars\.by\/[^"]+\/"/);
});

test("страница ссылается на другие машины модели и на обзор модели", () => {
  const { html } = render().carPage({ car, related, modelPage });
  // Единственный путь, по которому робот уходит из карточки в карточку: списки
  // в приложении рисует скрипт, и в разметке их нет.
  assert.match(html, /<a href="\/cars\/56135001">BYD Han 2022<\/a>/);
  assert.match(html, /<a href="\/cars\/777">BYD Han 2024<\/a>/);
  assert.match(html, /<a href="\/models\/byd-han">Обзор модели BYD Han<\/a>/);
  assert.match(html, /<a href="\/catalog">/);
  // Внутренние ссылки без косой черты на конце — хостинг с чертой перебрасывает.
  assert.doesNotMatch(html, /<a href="\/[^"]+\/"/);
});

test("из карточки ведут ссылки на разделы каталога этой машины", () => {
  // Марка, тип двигателя, кузов и их сочетания — постоянные страницы, ради которых
  // карточки и нужны: сама карточка живёт до продажи машины, раздел остаётся. Список
  // разделов приходит из landingsForCar; здесь достаточно, что он попадает в разметку.
  const sections = [
    { path: "/catalog/byd", h1: "Автомобили BYD из Китая" },
    { path: "/catalog/electric-sedan", h1: "Электрические седаны из Китая" },
  ];
  const { html } = render().carPage({ car, related, modelPage, sections });
  assert.match(html, /<a href="\/catalog\/byd">Автомобили BYD из Китая<\/a>/);
  assert.match(html, /<a href="\/catalog\/electric-sedan">Электрические седаны из Китая<\/a>/);
});

test("без похожих машин пустого списка не остаётся", () => {
  // Заголовок над пустым списком читается поисковиком как сломанная страница.
  const { html } = render().carPage({ car, related: [] });
  assert.doesNotMatch(html, /<ul><\/ul>/);
  assert.match(html, /<a href="\/catalog">Все автомобили с пробегом из Китая<\/a>/);
});

test("на закрытой сборке страница машины не индексируется", () => {
  const { html } = render({ allowIndexing: false }).carPage({ car });
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /data-seo-indexing="false"/);
});

test("временная страница проданной машины закрыта от поиска и помечена SoldOut", () => {
  const { html } = render().carPage({ car:{ ...car, available:false, soldAt:"2026-09-10T12:00:00.000Z" }, indexable:false });
  assert.match(html, /<title>BYD Han 2023 — продано \| abcars\.by<\/title>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(html, /"availability":"https:\/\/schema\.org\/SoldOut"/);
  assert.match(html, /BYD Han 2023 продан/);
});

test("снятое объявление отдаёт страницу без индексации и без первоисточника", () => {
  const html = render().carGonePage();
  assert.match(html, /<h1>Объявление больше не доступно<\/h1>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  // Первоисточник у такой страницы указывать нельзя: настоящего адреса за ней нет.
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.match(html, /<a href="\/catalog">Перейти в каталог автомобилей из Китая<\/a>/);
});

test("чужая разметка в данных объявления не попадает в страницу как разметка", () => {
  const dangerous = { ...car, title: 'BYD "Han" <script>alert(1)</script>' };
  const { html } = render().carPage({ car: dangerous });
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

// Адреса фотографий должны совпадать с теми, что просит приложение (imageSource
// в src/App.jsx): серверная разметка и приложение показывают один и тот же снимок,
// и если адреса разойдутся, браузер скачает фотографию дважды.
test("photoHref просит у хранилища нужный размер снимка", () => {
  const source = "https://erscglobal2.autoimg.cn/escimg/auto/g34/M02/DF/A9/1400x0_c42_autohomecar__Chtp063.jpg.webp";
  // Настоящий оригинал: части «1400x0_c42_» в адресе нет.
  assert.equal(
    photoHref(source, "original"),
    `/photo/escimg/auto/g34/M02/DF/A9/autohomecar__Chtp063.jpg.webp?v=${PHOTO_BROWSER_CACHE_VERSION}`,
  );
  // Обычная ширина по-прежнему подставляется на место прежней.
  assert.equal(
    photoHref(source, 900),
    `/photo/escimg/auto/g34/M02/DF/A9/900x0_c42_autohomecar__Chtp063.jpg.webp?v=${PHOTO_BROWSER_CACHE_VERSION}`,
  );
  // Чужие адреса не трогаем.
  assert.equal(photoHref("https://example.com/a.jpg", "original"), "https://example.com/a.jpg");
});

// Ссылки на страницы-расчёты из карточки. До этого на каждый расчёт вела ровно одна
// ссылка — из подвала, одинаковая на всех страницах сайта: вес она почти не передаёт,
// а человеку от строки «таможня и сборы» идти было некуда.
test("из карточки ведут ссылки на растаможку и калькулятор", () => {
  const { html } = render().carPage({ car });
  // Сверяем текст самой карточки, а не всю страницу: те же адреса стоят в подвале,
  // одинаковом у всех страниц, и проверка прошла бы и без единой ссылки по делу.
  const text = html.slice(html.indexOf("<article>"), html.indexOf("</article>"));
  assert.match(text, /<a href="\/customs">калькуляторе растаможки<\/a>/);
  assert.match(text, /<a href="\/delivery-cost">Стоимость доставки авто из Китая<\/a>/);
  // У электромобиля добавляется квота: для него это не общая справка, а причина,
  // по которой в цене может не быть пошлины.
  assert.match(text, /<a href="\/ev-quota">Квота на электромобили<\/a>/);
  // У бензиновой машины строки про квоту нет. Сверяем сам текст карточки, а не всю
  // страницу: ссылка на квоту есть ещё и в подвале, он одинаков у всех страниц.
  const petrol = render().carPage({ car: { ...car, type: "ДВС", engine: "1.5" } }).html;
  const article = petrol.slice(petrol.indexOf("<article>"), petrol.indexOf("</article>"));
  assert.doesNotMatch(article, /ev-quota/);
  assert.match(article, /href="\/customs"/);
});

// Полный идентификатор с именем источника отвечает переездом на короткий адрес:
// такой адрес остался в старых ссылках и в кабинете, но снаружи существовать не должен.
test("адрес с приставкой источника переезжает на короткий", async () => {
  const { renderCarPage } = await import("../server/car-page.mjs");
  const moved = await renderCarPage("che168-59355862");
  assert.equal(moved.status, 301);
  assert.equal(moved.location, "/cars/59355862");
  const old = await renderCarPage("guazi_777");
  assert.equal(old.location, "/cars/777");
});

test("на странице машины есть ценовая полоса среди подборок и материалы журнала", () => {
  // 25.09.2026 (разбор против IM4CAR): из карточки не было пути ни на ценовые полосы,
  // ни в журнал — а это постоянные страницы, которые и должны собирать поиск.
  const sections = [
    { path: "/catalog/byd", h1: "BYD из Китая", name: "BYD" },
    { path: "/catalog/under-30000", h1: "Автомобили до 30 000 $", name: "До 30 000 $" },
  ];
  const journal = [{ path: "/blog/byd-han-vs-tesla-model-3", name: "BYD Han или Tesla Model 3", teaser: "Что взять за те же деньги." }];
  const { html } = render().carPage({ car, related, modelPage, sections, journal });
  assert.match(html, /<a href="\/catalog\/under-30000">Автомобили до 30 000 \$<\/a>/);
  assert.match(html, /<h2>Об этой модели в журнале<\/h2>/);
  assert.match(html, /<a href="\/blog\/byd-han-vs-tesla-model-3">BYD Han или Tesla Model 3<\/a> — Что взять за те же деньги\./);
  // Без материалов блока нет вовсе.
  assert.doesNotMatch(render().carPage({ car, sections }).html, /в журнале/);
});

test("на странице машины с готовой разметкой приложения вопросы размечены один раз", () => {
  // 25.09.2026: FAQPage стоял дважды — в заголовке от сервера и рядом с блоком вопросов
  // от приложения. Приложение ставит его само, сервер — только в простой версии.
  const appRoot = '<main><script type="application/ld+json">{"@type":"FAQPage"}</script></main>';
  const withApp = render().carPage({ car, appRoot, appRootPath: "/cars/56135000" }).html;
  assert.equal((withApp.match(/"@type":"FAQPage"/g) || []).length, 1);
  const plain = render().carPage({ car }).html;
  assert.equal((plain.match(/"@type":"FAQPage"/g) || []).length, 1);
});

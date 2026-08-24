import assert from "node:assert/strict";
import test from "node:test";
import { createSeoRenderer } from "../server/seo-render.mjs";

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

test("страница машины несёт свой заголовок, описание и адрес-первоисточник", () => {
  const { html } = render().carPage({ car });
  assert.match(html, /<title>BYD Han 2023, 21[^<]*400 км — цена до Минска \| abcars\.by<\/title>/);
  assert.match(html, /<meta name="description" content="BYD Han 2023: пробег 21[^"]*400 км, электромобиль, ориентировочная цена до Минска — [^"]+\$\. Проверка перед покупкой\."/);
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

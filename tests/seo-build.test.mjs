import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { CATALOG_LANDINGS } from "../src/catalog-landings.js";

// Генератор прогоняем на трёх машинах в своей папке. Раньше тесты читали общий
// `dist/`, поэтому зависели и от дампа каталога (441 МБ вне git), и от того,
// успела ли iCloud досинхронизировать папку после сборки.
const run = promisify(execFile);
const script = new URL("../scripts/generate-seo-pages.mjs", import.meta.url).pathname;
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
const fixtureCars = [
  {
    id: "guazi-170268619192114",
    brand: "BYD",
    model: "Song Pro",
    rawModel: "比亚迪 2024款 荣耀版 DM-i 71KM领航型",
    year: 2024,
    mileage: 21400,
    chinaPrice: 67300,
    type: "Гибрид",
    drive: "Передний",
    engine: "1.5",
    image: "https://example.com/song-pro-1.jpg",
    images: ["https://example.com/song-pro-1.jpg", "https://example.com/song-pro-2.jpg"],
    importedAt: "2026-08-18T19:18:05.086Z",
  },
  {
    id: "che168-52186096",
    brand: "Zeekr",
    model: "001",
    year: 2023,
    mileage: 18000,
    chinaPrice: 185000,
    type: "Электромобиль",
    drive: "Полный",
    image: "https://example.com/zeekr-1.jpg",
    images: ["https://example.com/zeekr-1.jpg", "https://example.com/zeekr-2.jpg"],
    importedAt: "2026-08-18T19:18:05.086Z",
  },
  {
    id: "che168-52866829",
    brand: "BYD",
    model: "Yuan Plus",
    year: 2022,
    mileage: 42000,
    chinaPrice: 79000,
    type: "Электромобиль",
    drive: "Передний",
    image: "https://example.com/yuan-plus-1.jpg",
    images: ["https://example.com/yuan-plus-1.jpg", "https://example.com/yuan-plus-2.jpg"],
    importedAt: "2026-08-18T19:18:05.086Z",
  },
];

async function build(env = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "seo-build-"));
  const clientDir = path.join(dir, "client");
  await mkdir(clientDir, { recursive: true });
  await writeFile(path.join(clientDir, "index.html"), shell);
  const catalogPath = path.join(dir, "cars.json");
  await writeFile(catalogPath, JSON.stringify({ generatedAt: "2026-08-18T19:18:05.086Z", cars: fixtureCars }));
  await run(process.execPath, [script], {
    env: { ...process.env, SEO_OUTPUT_DIR: clientDir, SEO_CATALOG: catalogPath, SITE_URL: "https://abcars.by", SEO_ALLOW_INDEXING: "", SEO_VEHICLE_PAGES: "", SEO_SITEMAP_TOKEN: "testtoken", ...env },
  });
  return {
    read: (relative) => readFile(path.join(clientDir, relative), "utf8"),
    missing: async (relative) => {
      await assert.rejects(access(path.join(clientDir, relative)), { code: "ENOENT" }, `${relative} должен отсутствовать`);
    },
  };
}

// Имя карты сайта задаётся токеном; в тестах фиксируем свой, чтобы проверки не зависели
// от значения по умолчанию и от того, что задано в окружении сборки.
const sitemapToken = "testtoken";
const sitemapIndex = `sitemap-${sitemapToken}.xml`;
const sitemapCars = `sitemap-${sitemapToken}-cars.xml`;

test("preview build ships public pages as noindex and no vehicle pages", async () => {
  const { read, missing } = await build();
  const [home, robots, sitemap] = await Promise.all([read("index.html"), read("robots.txt"), read(sitemapIndex)]);
  assert.match(home, /<h1>Автомобили с пробегом из Китая/);
  assert.match(home, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  // Общая страница каталога файлом не собирается: её отдаёт сервер, а готовый файл
  // перекрыл бы и переброс адресов с фильтрами на разделы. В карте сайта она есть.
  await missing("catalog/index.html");
  assert.match(sitemap, /sitemap-testtoken-pages\.xml/);
  assert.match(robots, /Disallow: \/$/m);
  // Страницы машин выключены — ни ссылок на них, ни карты, ни статического каталога.
  assert.doesNotMatch(home, /<a href="\/cars\//);
  assert.doesNotMatch(sitemap, new RegExp(sitemapCars.replace(/\./g, "\\.")));
  await missing(sitemapCars);
  await missing("cars/170268619192114/index.html");
  await missing("data/catalog.json");
});

test("предсказуемых имён карты сайта в сборке нет", async () => {
  const { read, missing } = await build();
  // `/sitemap.xml` — готовый список адресов каталога для конкурента, поэтому карта лежит
  // под именем с токеном, а robots.txt на неё не ссылается: адрес задают вручную.
  await missing("sitemap.xml");
  await missing("sitemap-pages.xml");
  const [robots, sitemap] = await Promise.all([read("robots.txt"), read(sitemapIndex)]);
  assert.doesNotMatch(robots, /Sitemap:/i);
  assert.match(sitemap, /<loc>https:\/\/abcars\.by\/sitemap-testtoken-pages\.xml<\/loc>/);
});

test("заготовка страницы машины отдаётся без чужого адреса-первоисточника", async () => {
  // Без этого файла адреса `/cars/<id>` отвечали «страница не найдена»: статических
  // страниц машин в сборке нет. Свой адрес-первоисточник дописывает приложение, поэтому
  // в заготовке его быть не должно — иначе все карточки указывали бы на одну страницу.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const shell = await read("car.html");
  assert.doesNotMatch(shell, /rel="canonical"/);
  assert.doesNotMatch(shell, /og:url/);
  // Запрет индексации в готовом HTML оставлять нельзя: поисковик выбросит страницу,
  // не дожидаясь, пока скрипт этот запрет снимет.
  assert.match(shell, /<meta name="robots" content="index, follow/);
  assert.match(shell, /<div id="root">/);
});

test("сборка кладёт пустую заготовку приложения для серверных страниц", async () => {
  // Страницу машины собирает сервер и вставляет содержимое в это место. Если заготовка
  // окажется непустой (например, сборка возьмёт за неё готовую главную), вставка молча
  // не сработает и все карточки покажут чужой текст.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const appShell = await read("app-shell.html");
  assert.match(appShell, /<div id="root"><\/div>/);
  assert.match(appShell, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  // Файл нигде не связан ссылками, но на всякий случай закрыт и в robots.txt.
  // Одной строки без расширения достаточно: адрес там сравнивается по началу строки.
  // Полный разбор правил — в tests/robots-rules.test.mjs.
  assert.match(await read("robots.txt"), /^Disallow: \/app-shell$/m);
});

test("на тестовой сборке заготовка машины закрыта от индексации", async () => {
  const { read } = await build();
  assert.match(await read("car.html"), /<meta name="robots" content="noindex, nofollow, noarchive"/);
});

test("SEO_VEHICLE_PAGES adds indexable vehicle pages with structured data", async () => {
  const { read } = await build({ SEO_ALLOW_INDEXING: "1", SEO_VEHICLE_PAGES: "1" });
  const [home, html, robots, sitemap] = await Promise.all([read("index.html"), read("cars/170268619192114/index.html"), read("robots.txt"), read(sitemapIndex)]);
  // Адрес карточки — короткий номер объявления: приставка источника из ссылок убрана.
  assert.match(home, /<a href="\/cars\/170268619192114"/);
  assert.doesNotMatch(home, /<a href="\/cars\/guazi-/);
  assert.match(html, /<title>BYD Song Pro 2024, 21[^<]*400 км — цена до Минска/);
  assert.match(html, /<link rel="canonical" href="https:\/\/abcars\.by\/cars\/170268619192114"/);
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.match(html, /"@type":"Vehicle"/);
  assert.match(html, /<h1>BYD Song Pro 2024<\/h1>/);
  // Исходные китайские названия в разметку не попадают.
  assert.doesNotMatch(html, /比亚迪/);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(sitemap, new RegExp(sitemapCars.replace(/\./g, "\\.")));
});

test("static fallback ships a compact catalog and addressable full records", async () => {
  const { read } = await build({ SEO_VEHICLE_PAGES: "1" });
  const compact = JSON.parse(await read("data/catalog.json"));
  const detail = JSON.parse(await read("data/cars/170268619192114.json"));
  assert.equal(compact.cars.length, fixtureCars.length);
  assert.equal(compact.cars[0]._summary, true);
  assert.equal(compact.cars[0].description, undefined);
  assert.equal(compact.cars[0].technicalSpecs, undefined);
  assert.equal(Array.isArray(detail.images) && detail.images.length > 1, true);
});

test("обзоры моделей файлами не собираются, но остаются в карте сайта", async () => {
  // Обзор модели отдаёт сервер: в нём нужны живые цены и наличие, а готовый файл по
  // этому адресу перекрыл бы правило переадресации, и сервер до отрисовки не дошёл бы.
  // Содержимое обзора проверяется в tests/model-page.test.mjs.
  const { read, missing } = await build({ SEO_ALLOW_INDEXING: "1" });
  await missing("models/zeekr-007gt/index.html");
  const [index, pagesXml] = await Promise.all([read("models/index.html"), read(`sitemap-${sitemapToken}-pages.xml`)]);
  // Общая страница «О моделях авто» файлом остаётся: она не зависит от каталога.
  assert.match(index, /<h1>/);
  assert.match(index, /<a href="\/models\/zeekr-007gt">/);
  assert.match(pagesXml, /<loc>https:\/\/abcars\.by\/models\/zeekr-007gt<\/loc>/);
});

test("страницы-инструменты собираются с живыми цифрами", async () => {
  // Квота, растаможка, стоимость доставки и калькулятор — отдельные запросы, и у
  // конкурентов такие страницы есть. Цифры на них берутся из тех же данных, что расчёт
  // в карточке, поэтому страница не может разойтись с каталогом.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const quota = await read("ev-quota/index.html");
  assert.match(quota, /<h1>Квота на беспошлинный ввоз электромобилей в Беларусь<\/h1>/);
  assert.match(quota, /Гражданам доступно ещё [\d\s  ]+ электромобил/);
  assert.match(quota, /История сводок таможни/);
  for (const [file, heading] of [
    ["customs/index.html", "Растаможка авто из Китая"],
    ["delivery-cost/index.html", "Сколько стоит привезти авто из Китая"],
    ["calculator/index.html", "Калькулятор стоимости авто из Китая"],
  ]) {
    const html = await read(file);
    assert.match(html, new RegExp(heading));
    assert.match(html, /<meta name="robots" content="index, follow/);
    const body = html.slice(html.indexOf('<div id="root">'), html.indexOf("</body>"));
    const words = body.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
    assert.ok(words >= 150, `${file}: слов ${words}, ожидалось не меньше 150`);
  }
  // Все четыре попадают в карту сайта.
  const pagesXml = await read(`sitemap-${sitemapToken}-pages.xml`);
  for (const path of ["/ev-quota", "/customs", "/delivery-cost", "/calculator"]) {
    assert.match(pagesXml, new RegExp(`<loc>https://abcars\\.by${path}</loc>`));
  }
});

test("на страницы-инструменты ведёт подвал каждой страницы", async () => {
  // Иначе эти четыре страницы ссылаются только друг на друга: в подвале приложения они
  // есть, но его рисует скрипт, и в разметке страницы ссылок не остаётся. Тогда вес с
  // остального сайта на них не приходит вовсе.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  for (const file of ["index.html", "faq/index.html", "delivered/index.html"]) {
    const html = await read(file);
    for (const path of ["/ev-quota", "/customs", "/delivery-cost", "/calculator", "/contacts", "/catalog"]) {
      assert.match(html, new RegExp(`href="${path}"`), `${file}: нет ссылки на ${path}`);
    }
  }
});

test("страницы «О нас» больше нет, а её содержимое живёт на странице «О сервисе»", async () => {
  // Дубль заголовка: у `/about` и `/how-it-works` был один и тот же h1 «О сервисе
  // abcars.by», и обе отвечали на один запрос. Адрес перебрасывается на хостинге
  // (vercel.json), поэтому страницы в сборке быть не должно — иначе готовый файл
  // окажется в карте сайта и снова начнёт соревноваться со «О сервисе».
  const { read, missing } = await build({ SEO_ALLOW_INDEXING: "1" });
  await missing("about/index.html");
  const pagesXml = await read(`sitemap-${sitemapToken}-pages.xml`);
  assert.doesNotMatch(pagesXml, /<loc>https:\/\/abcars\.by\/about<\/loc>/);
  const service = await read("how-it-works/index.html");
  assert.match(service, /Прозрачность на каждом шаге/);
  assert.match(service, /Чего мы не обещаем/);
  assert.match(service, /Факты отдельно от оценки/);
});

test("на главной есть разметка сайта и поиска по нему", async () => {
  // По этой разметке Google иногда показывает строку поиска прямо в выдаче.
  // Адрес поиска обязан работать: каталог разбирает `?q=` тем же разбором,
  // что и поиск на главной.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const home = await read("index.html");
  assert.match(home, /"@type":"WebSite"/);
  assert.match(home, /"@type":"SearchAction"/);
  assert.match(home, /"urlTemplate":"https:\/\/abcars\.by\/catalog\?q=\{search_term_string\}"/);
  assert.match(home, /"query-input":"required name=search_term_string"/);
  // Только на главной: на остальных страницах эта разметка не нужна.
  assert.doesNotMatch(await read("faq/index.html"), /"@type":"SearchAction"/);
});

test("тексты информационных страниц лежат в самой странице", async () => {
  // Раньше поисковик видел на этих страницах 32–43 слова — заголовок и одну фразу, —
  // а всё остальное появлялось только после запуска приложения в браузере.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const words = async (file) => {
    const html = await read(file);
    const body = html.slice(html.indexOf('<div id="root">'), html.indexOf("</body>"));
    return body.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  };
  for (const [file, least] of [["index.html", 180], ["faq/index.html", 300], ["how-it-works/index.html", 250], ["delivered/index.html", 150], ["payment-and-contract/index.html", 120], ["guarantees/index.html", 110], ["privacy/index.html", 110], ["terms/index.html", 110]]) {
    const count = await words(file);
    assert.ok(count >= least, `${file}: слов ${count}, ожидалось не меньше ${least}`);
  }
  // Вопросы попадают в разметку — по ней они показываются в выдаче списком.
  assert.match(await read("faq/index.html"), /"@type":"FAQPage"/);
  // Отзывы и имена клиентов в разметку не тащим: в данных они помечены как
  // демонстрационные.
  const delivered = await read("delivered/index.html");
  assert.doesNotMatch(delivered, /Алексей, Минск/);
});

test("на главной есть ссылки на все разделы каталога и на обзоры моделей", async () => {
  // Раньше с главной вели ровно двенадцать ссылок — меню и подвал, — и в разделы
  // нельзя было попасть ниоткуда, кроме карты сайта. Потом появились 33 раздела из 57:
  // ценовые полосы и сочетания («электрические кроссоверы», «седаны BYD») ссылок с
  // главной не получали, хотя запросы «электромобиль до 20 000» — самые покупательские.
  // Обзоров моделей на главной не было вовсе, хотя это самые содержательные страницы.
  // Те же ссылки есть и в каталоге, но он собирается сервером — это проверяет
  // tests/catalog-landings.test.mjs.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const html = await read("index.html");
  const body = html.slice(html.indexOf('<div id="root">'), html.indexOf("</body>"));
  const sections = new Set([...body.matchAll(/<a href="(\/catalog\/[a-z0-9-]+)"/g)].map((match) => match[1]));
  assert.equal(sections.size, CATALOG_LANDINGS.length, `ссылок на разделы ${sections.size}, а разделов ${CATALOG_LANDINGS.length}`);
  for (const landing of CATALOG_LANDINGS) assert.ok(sections.has(landing.path), `на главной нет ссылки на ${landing.path}`);
  const reviews = [...body.matchAll(/<a href="\/models\/[a-z0-9-]+"/g)];
  assert.ok(reviews.length >= 20, `ссылок на обзоры моделей ${reviews.length}, ожидалось не меньше 20`);
});

test("с информационных страниц и расчётов ведут ссылки в каталог", async () => {
  // Пять самых содержательных страниц сайта (от 1 100 до 1 800 слов) были тупиками:
  // ни одной ссылки в каталог, только меню и подвал. Вес с них никуда не переносился,
  // а человеку после «на электромобиль пошлины нет» некуда было нажать.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const pages = [
    ["customs/index.html", "Растаможка по типам машин"],
    ["ev-quota/index.html", "Что можно ввезти по квоте"],
    ["delivery-cost/index.html", "Машины, для которых считаем доставку"],
    ["calculator/index.html", "Посчитать на конкретной машине"],
    ["faq/index.html", "Ответы, которые видно в каталоге"],
    ["how-it-works/index.html", "С чего начать выбор"],
    ["guarantees/index.html", "Что именно мы проверяем"],
    ["payment-and-contract/index.html", "Сколько это выходит в деньгах"],
    ["delivered/index.html", "Где выбрать такую же"],
    ["contacts/index.html", "Пока мы отвечаем"],
  ];
  for (const [file, heading] of pages) {
    const html = await read(file);
    const body = html.slice(html.indexOf('<div id="root">'), html.indexOf("</body>"));
    assert.match(body, new RegExp(heading), `${file}: нет блока «${heading}»`);
    const sections = new Set([...body.matchAll(/<a href="(\/catalog\/[a-z0-9-]+)"/g)].map((match) => match[1]));
    assert.ok(sections.size >= 4, `${file}: ссылок на разделы каталога ${sections.size}, ожидалось не меньше четырёх`);
    for (const path of sections) assert.ok(CATALOG_LANDINGS.some((landing) => landing.path === path), `${file}: ссылка на несуществующий раздел ${path}`);
  }
});

test("на каждой странице ровно один заголовок первого уровня", async () => {
  // На главной их было два: один рисовал первый экран-заглушку до запуска приложения,
  // второй стоял в версии страницы для поисковика. Человек видит один — приложение
  // подменяет собой и то и другое, — а поисковик без скриптов видел оба.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  const pages = ["index.html", "catalog/index.html", "models/index.html", "faq/index.html", "customs/index.html", "how-it-works/index.html", "ev-quota/index.html"];
  for (const file of pages) {
    const html = await read(file).catch(() => null);
    if (html === null) continue;
    const headings = (html.match(/<h1[\s>]/g) || []).length;
    assert.equal(headings, 1, `${file}: заголовков первого уровня ${headings}`);
  }
});

test("адреса не оканчиваются косой чертой ни в страницах, ни в карте сайта", async () => {
  // Хостинг настроен на адреса без черты и сам перебрасывает `/catalog/` на `/catalog`.
  // Пока черта оставалась, сайт указывал поисковику на адрес, которого нет: карта сайта
  // вела на перебросы, а внутренние ссылки добавляли лишний шаг на каждом переходе.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1", SEO_VEHICLE_PAGES: "1" });
  const [home, car, pagesXml, carsXml] = await Promise.all([
    read("index.html"), read("cars/170268619192114/index.html"),
    read(`sitemap-${sitemapToken}-pages.xml`), read(sitemapCars),
  ]);
  // Главная — единственный адрес, у которого черта на конце законна.
  for (const [name, html] of [["главная", home], ["машина", car]]) {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${name}: адрес-первоисточник должен быть указан`);
    if (canonical !== "https://abcars.by/") assert.doesNotMatch(canonical, /\/$/, `${name}: ${canonical}`);
    // Хлебные крошки и og:url ссылаются на те же адреса, что и первоисточник.
    assert.doesNotMatch(html, /"item":"https:\/\/abcars\.by\/[^"]+\/"/, `${name}: крошки с чертой`);
    assert.doesNotMatch(html, /<meta property="og:url" content="https:\/\/abcars\.by\/[^"]+\/"/, `${name}: og:url с чертой`);
    // Внутренние ссылки ведут туда же, куда указывает первоисточник.
    assert.doesNotMatch(html, /<a href="\/[^"]+\/"/, `${name}: внутренняя ссылка с чертой`);
  }
  for (const [name, xml] of [["страницы", pagesXml], ["машины", carsXml]]) {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.ok(locs.length, `карта «${name}» не должна быть пустой`);
    for (const loc of locs) {
      if (loc !== "https://abcars.by/") assert.doesNotMatch(loc, /\/$/, `карта «${name}»: ${loc}`);
    }
  }
});

// Журнал за выключателем: пока BLOG_ENABLED выключен, у сайта нет ни его страниц,
// ни адресов в карте сайта — сайт можно выкладывать, не показывая недоделанный раздел.
test("выключенный журнал в сборку не попадает", async () => {
  const { missing, read } = await build({ SEO_ALLOW_INDEXING: "1" });
  await missing("blog/index.html");
  await missing("blog/electric-range-700/index.html");
  const [pages, home, about] = await Promise.all([read(`sitemap-${sitemapToken}-pages.xml`), read("index.html"), read("how-it-works/index.html")]);
  assert.doesNotMatch(pages, /\/blog/);
  // Ни ссылки в подвале, ни блока на главной: пока раздел выключен, его на сайте нет.
  assert.doesNotMatch(home, /href="\/blog/);
  assert.doesNotMatch(about, /href="\/blog/);
});

test("включённый журнал собирается страницами и попадает в карту сайта", async () => {
  const { read } = await build({ SEO_ALLOW_INDEXING: "1", BLOG_ENABLED: "1" });
  const [index, post, pages, home, about] = await Promise.all([
    read("blog/index.html"),
    read("blog/electric-range-700/index.html"),
    read(`sitemap-${sitemapToken}-pages.xml`),
    read("index.html"),
    read("how-it-works/index.html"),
  ]);
  assert.match(index, /<h1>Журнал abcars\.by/);
  assert.match(index, /href="\/blog\/electric-range-700"/);
  // Содержимое подборки лежит в разметке, а не подгружается скриптом: текст, вопросы
  // и разметка статьи с датой.
  assert.match(post, /<h1>Топ 10 электромобилей из Китая с запасом хода от 700 километров<\/h1>/);
  assert.match(post, /Что стоит за цифрой в паспорте/);
  assert.match(post, /"@type":"BlogPosting"/);
  assert.match(post, /"@type":"FAQPage"/);
  assert.match(post, /<link rel="canonical" href="https:\/\/abcars\.by\/blog\/electric-range-700"/);
  assert.match(post, /<meta name="robots" content="index, follow/);
  assert.match(pages, /<loc>https:\/\/abcars\.by\/blog<\/loc>/);
  assert.match(pages, /<loc>https:\/\/abcars\.by\/blog\/electric-range-700<\/loc>/);
  // Дата обновления у материалов есть: только по ней поисковик узнаёт, что списки
  // машин в подборках пересобираются каждую ночь, и приходит перепроверять чаще.
  assert.match(pages, /<loc>https:\/\/abcars\.by\/blog\/electric-range-700<\/loc><lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  // Ссылки на журнал должны быть в самой разметке: в приложении они есть, но их
  // рисует скрипт, а Яндекс ходит по готовой странице. Без них материалы держались
  // бы на одной карте сайта.
  assert.match(about, /<footer[\s\S]*href="\/blog"/);
  assert.match(home, /href="\/blog\/electric-range-700"/);
  // Те же правила, что у остальных страниц: один заголовок первого уровня и ни одного
  // адреса с косой чертой на конце.
  for (const [name, html] of [["журнал", index], ["подборка", post]]) {
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${name}: заголовков первого уровня не один`);
    assert.doesNotMatch(html, /<a href="\/[^"]+\/"/, `${name}: внутренняя ссылка с чертой`);
    assert.doesNotMatch(html, /"item":"https:\/\/abcars\.by\/[^"]+\/"/, `${name}: крошки с чертой`);
  }
});

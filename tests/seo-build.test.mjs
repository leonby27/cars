import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

// Генератор прогоняем на трёх машинах в своей папке. Раньше тесты читали общий
// `dist/`, поэтому зависели и от дампа каталога (441 МБ вне git), и от того,
// успела ли iCloud досинхронизировать папку после сборки.
const run = promisify(execFile);
const script = new URL("../scripts/generate-seo-pages.mjs", import.meta.url).pathname;
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
    env: { ...process.env, SEO_OUTPUT_DIR: clientDir, SEO_CATALOG: catalogPath, SITE_URL: "https://evcars.by", SEO_ALLOW_INDEXING: "", SEO_VEHICLE_PAGES: "", SEO_SITEMAP_TOKEN: "testtoken", ...env },
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
  const [home, catalog, robots, sitemap] = await Promise.all([read("index.html"), read("catalog/index.html"), read("robots.txt"), read(sitemapIndex)]);
  assert.match(home, /<h1>Автомобили с пробегом из Китая/);
  assert.match(catalog, /<link rel="canonical" href="https:\/\/evcars\.by\/catalog"/);
  assert.match(catalog, /<meta name="robots" content="noindex, nofollow, noarchive"/);
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
  assert.match(sitemap, /<loc>https:\/\/evcars\.by\/sitemap-testtoken-pages\.xml<\/loc>/);
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
  assert.match(html, /<link rel="canonical" href="https:\/\/evcars\.by\/cars\/170268619192114"/);
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
  assert.match(pagesXml, /<loc>https:\/\/evcars\.by\/models\/zeekr-007gt<\/loc>/);
});

test("на главной и в каталоге есть ссылки на разделы каталога", async () => {
  // Раньше с этих двух страниц вели ровно двенадцать ссылок — меню и подвал, — и в
  // разделы нельзя было попасть ниоткуда, кроме карты сайта.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1" });
  for (const file of ["index.html", "catalog/index.html"]) {
    const html = await read(file);
    const body = html.slice(html.indexOf('<div id="root">'), html.indexOf("</body>"));
    const sections = [...body.matchAll(/<a href="\/catalog\/[a-z0-9-]+"/g)];
    assert.ok(sections.length >= 25, `${file}: ссылок на разделы ${sections.length}, ожидалось не меньше 25`);
    assert.match(body, /<a href="\/catalog\/byd">/);
    assert.match(body, /<a href="\/catalog\/electric">/);
    assert.match(body, /<a href="\/catalog\/suv">/);
  }
});

test("адреса не оканчиваются косой чертой ни в страницах, ни в карте сайта", async () => {
  // Хостинг настроен на адреса без черты и сам перебрасывает `/catalog/` на `/catalog`.
  // Пока черта оставалась, сайт указывал поисковику на адрес, которого нет: карта сайта
  // вела на перебросы, а внутренние ссылки добавляли лишний шаг на каждом переходе.
  const { read } = await build({ SEO_ALLOW_INDEXING: "1", SEO_VEHICLE_PAGES: "1" });
  const [home, catalog, car, pagesXml, carsXml] = await Promise.all([
    read("index.html"), read("catalog/index.html"), read("cars/170268619192114/index.html"),
    read(`sitemap-${sitemapToken}-pages.xml`), read(sitemapCars),
  ]);
  // Главная — единственный адрес, у которого черта на конце законна.
  for (const [name, html] of [["главная", home], ["каталог", catalog], ["машина", car]]) {
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${name}: адрес-первоисточник должен быть указан`);
    if (canonical !== "https://evcars.by/") assert.doesNotMatch(canonical, /\/$/, `${name}: ${canonical}`);
    // Хлебные крошки и og:url ссылаются на те же адреса, что и первоисточник.
    assert.doesNotMatch(html, /"item":"https:\/\/evcars\.by\/[^"]+\/"/, `${name}: крошки с чертой`);
    assert.doesNotMatch(html, /<meta property="og:url" content="https:\/\/evcars\.by\/[^"]+\/"/, `${name}: og:url с чертой`);
    // Внутренние ссылки ведут туда же, куда указывает первоисточник.
    assert.doesNotMatch(html, /<a href="\/[^"]+\/"/, `${name}: внутренняя ссылка с чертой`);
  }
  for (const [name, xml] of [["страницы", pagesXml], ["машины", carsXml]]) {
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    assert.ok(locs.length, `карта «${name}» не должна быть пустой`);
    for (const loc of locs) {
      if (loc !== "https://evcars.by/") assert.doesNotMatch(loc, /\/$/, `карта «${name}»: ${loc}`);
    }
  }
});

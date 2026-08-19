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
    env: { ...process.env, SEO_OUTPUT_DIR: clientDir, SEO_CATALOG: catalogPath, SITE_URL: "https://evcars.by", SEO_ALLOW_INDEXING: "", SEO_VEHICLE_PAGES: "", ...env },
  });
  return {
    read: (relative) => readFile(path.join(clientDir, relative), "utf8"),
    missing: async (relative) => {
      await assert.rejects(access(path.join(clientDir, relative)), { code: "ENOENT" }, `${relative} должен отсутствовать`);
    },
  };
}

test("preview build ships public pages as noindex and no vehicle pages", async () => {
  const { read, missing } = await build();
  const [home, catalog, robots, sitemap] = await Promise.all([read("index.html"), read("catalog/index.html"), read("robots.txt"), read("sitemap.xml")]);
  assert.match(home, /<h1>Автомобили с пробегом из Китая/);
  assert.match(catalog, /<link rel="canonical" href="https:\/\/evcars\.by\/catalog\/"/);
  assert.match(catalog, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(robots, /Disallow: \/$/m);
  // Страницы машин выключены — ни ссылок на них, ни карты, ни статического каталога.
  assert.doesNotMatch(home, /<a href="\/cars\//);
  assert.doesNotMatch(sitemap, /sitemap-cars\.xml/);
  await missing("sitemap-cars.xml");
  await missing("cars/guazi-170268619192114/index.html");
  await missing("data/catalog.json");
});

test("SEO_VEHICLE_PAGES adds indexable vehicle pages with structured data", async () => {
  const { read } = await build({ SEO_ALLOW_INDEXING: "1", SEO_VEHICLE_PAGES: "1" });
  const [home, html, robots, sitemap] = await Promise.all([read("index.html"), read("cars/guazi-170268619192114/index.html"), read("robots.txt"), read("sitemap.xml")]);
  assert.match(home, /<a href="\/cars\/guazi-170268619192114\//);
  assert.match(html, /<title>BYD Song Pro 2024, 21[^<]*400 км — цена до Минска/);
  assert.match(html, /<link rel="canonical" href="https:\/\/evcars\.by\/cars\/guazi-170268619192114\/"/);
  assert.match(html, /<meta name="robots" content="index, follow/);
  assert.match(html, /"@type":"Vehicle"/);
  assert.match(html, /<h1>BYD Song Pro 2024<\/h1>/);
  // Исходные китайские названия в разметку не попадают.
  assert.doesNotMatch(html, /比亚迪/);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(sitemap, /sitemap-cars\.xml/);
});

test("static fallback ships a compact catalog and addressable full records", async () => {
  const { read } = await build({ SEO_VEHICLE_PAGES: "1" });
  const compact = JSON.parse(await read("data/catalog.json"));
  const detail = JSON.parse(await read("data/cars/guazi-170268619192114.json"));
  assert.equal(compact.cars.length, fixtureCars.length);
  assert.equal(compact.cars[0]._summary, true);
  assert.equal(compact.cars[0].description, undefined);
  assert.equal(compact.cars[0].technicalSpecs, undefined);
  assert.equal(Array.isArray(detail.images) && detail.images.length > 1, true);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

// Последний шаг сборки кладёт в главную готовую разметку приложения вместо заглушки.
// 28.08.2026 он заодно выбросил текст для поисковика, лежавший в том же #root, и на
// главной не осталось ни одной ссылки на машину и ни одной на обзор модели — заметили
// это только 30.08. Тест закрепляет починку: разметка приложения на месте, а текст
// для поисковика переехал за пределы #root, где React его не трогает.

const run = promisify(execFile);
const script = new URL("../scripts/prerender-home.mjs", import.meta.url).pathname;

const shell = `<!doctype html>
<html lang="ru">
  <head><meta charset="utf-8" /><title>abcars.by</title></head>
  <body>
    <div id="root"><div class="boot-screen"><div class="hero-title">abcars.by</div></div><div class="seo-body"><main><h1>Автомобили из Китая</h1><ul><li><a href="/cars/59034691">BYD Han 2020</a></li></ul><a href="/models/byd-han">Обзор BYD Han</a></main></div></div>
  </body>
</html>
`;

const entryServer = `export const renderAppPage = () => '<link rel="preload" href="/logo.svg" /><div class="app-content"><h1>Автомобили из Китая</h1><footer class="site-footer"></footer></div>';
`;

async function prerender() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prerender-home-"));
  const clientDir = path.join(dir, "client");
  const ssrDir = path.join(dir, "ssr");
  await mkdir(clientDir, { recursive: true });
  await mkdir(ssrDir, { recursive: true });
  await writeFile(path.join(clientDir, "index.html"), shell);
  await writeFile(path.join(ssrDir, "entry-server.js"), entryServer);
  // Пути относительные: скрипт складывает адрес разметки приложения с рабочей папкой.
  await run(process.execPath, [script, "--dir=client", "--ssr=ssr"], { cwd: dir });
  return readFile(path.join(clientDir, "index.html"), "utf8");
}

test("готовая главная сохраняет текст для поисковика за пределами #root", async () => {
  const html = await prerender();
  // Разметка приложения на месте и помечена как готовая к оживлению.
  assert.match(html, /<div id="root" data-prerender="\/">/);
  assert.match(html, /class="app-content"/);
  // Ссылки на машины и обзоры не потерялись.
  assert.match(html, /href="\/cars\/59034691"/);
  assert.match(html, /href="\/models\/byd-han"/);
  // И лежат они снаружи #root: React сверяет только его содержимое, и чужая
  // разметка внутри заставила бы его перерисовать страницу целиком.
  const rootAt = html.indexOf('<div id="root"');
  const seoAt = html.indexOf('<div class="seo-body">');
  assert.ok(seoAt > rootAt, "текст для поисковика должен идти после начала #root");
  assert.doesNotMatch(html.slice(rootAt, seoAt), /class="seo-body"/);
  // Подсказки-предзагрузки переехали в шапку — иначе оживление провалится.
  assert.match(html.slice(0, html.indexOf("</head>")), /rel="preload"/);
});

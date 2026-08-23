import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

// robots.txt сравнивает адрес по началу строки, а не по «папке». Из-за этого строка
// «Disallow: /car» запрещала заодно «/cars/59372753» — то есть все карточки машин,
// главные страницы сайта для поиска. Ошибка тихая: сайт работает, страницы отдаются,
// а поисковик их просто не берёт. Поэтому правила проверяются здесь целиком.
const run = promisify(execFile);
const script = new URL("../scripts/generate-seo-pages.mjs", import.meta.url).pathname;
const shell = `<!doctype html>
<html lang="ru">
  <head><meta charset="utf-8" /><title>evcars.by</title></head>
  <body><div id="root"></div></body>
</html>
`;

async function robots(env = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "robots-"));
  const clientDir = path.join(dir, "client");
  await mkdir(clientDir, { recursive: true });
  await writeFile(path.join(clientDir, "index.html"), shell);
  await run(process.execPath, [script], {
    env: { ...process.env, SEO_OUTPUT_DIR: clientDir, SITE_URL: "https://evcars.by", SEO_VEHICLE_PAGES: "", SEO_CARS_SITEMAP: "", SEO_CARS_FROM_DB: "", SEO_SITEMAP_TOKEN: "testtoken", ...env },
  });
  return readFile(path.join(clientDir, "robots.txt"), "utf8");
}

/**
 * Разрешён ли адрес по правилам robots.txt. Сравнение по началу строки, `$` означает
 * точное совпадение, `*` — любую последовательность. Побеждает самое длинное правило —
 * так же, как это делают Google и Яндекс.
 */
function allowed(rules, url) {
  const matches = (pattern) => {
    const anchored = pattern.endsWith("$");
    const body = anchored ? pattern.slice(0, -1) : pattern;
    const source = `^${body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`;
    return new RegExp(source).test(url);
  };
  let verdict = true;
  let best = -1;
  for (const line of rules.split("\n")) {
    const rule = line.match(/^(Allow|Disallow):\s*(\S*)$/i);
    if (!rule) continue;
    const [, kind, pattern] = rule;
    if (!pattern || !matches(pattern)) continue;
    if (pattern.length > best) {
      best = pattern.length;
      verdict = kind.toLowerCase() === "allow";
    }
  }
  return verdict;
}

test("карточки машин, разделы каталога и обзоры моделей открыты для поисковика", async () => {
  const rules = await robots({ SEO_ALLOW_INDEXING: "1" });
  for (const url of [
    "/",
    "/catalog",
    "/catalog/byd",
    "/catalog/electric",
    "/cars/59372753",
    "/cars/che168-59372753",
    "/models",
    "/models/byd-han",
    "/faq",
    "/contacts",
    "/og.jpg",
    "/fonts/manrope-latin.woff2",
    "/sitemap-testtoken.xml",
  ]) {
    assert.equal(allowed(rules, url), true, `${url} должен быть открыт`);
  }
});

test("личные разделы и служебные заготовки закрыты — и с чертой, и без", async () => {
  const rules = await robots({ SEO_ALLOW_INDEXING: "1" });
  for (const url of [
    "/api",
    "/api/cars",
    "/account",
    "/account/",
    "/favorites",
    "/searches",
    "/login",
    "/register",
    "/orders/draft/12",
    "/analytics",
    "/app-shell",
    "/app-shell.html",
    "/car",
    "/car.html",
  ]) {
    assert.equal(allowed(rules, url), false, `${url} должен быть закрыт`);
  }
});

test("для Яндекса склеены адреса каталога с фильтрами", async () => {
  // Clean-param — правило Яндекса: он не тратит обход на адреса, отличающиеся только
  // этими параметрами. Правило не должно ломать разбор остальных строк.
  const rules = await robots({ SEO_ALLOW_INDEXING: "1" });
  const line = rules.split("\n").find((row) => row.startsWith("Clean-param:"));
  assert.ok(line, "правила Clean-param нет");
  assert.match(line, /\/catalog$/);
  const params = line.replace(/^Clean-param:\s*/, "").split(" ")[0].split("&");
  for (const param of ["model", "priceTo", "sort", "color", "q"]) {
    assert.ok(params.includes(param), `в Clean-param нет параметра ${param}`);
  }
  // Марку, тип двигателя и кузов сюда возвращать нельзя: у таких адресов есть свой
  // раздел, и сервер перебрасывает на него. Склеенный адрес до переброса не дойдёт.
  for (const param of ["brand", "type", "body"]) {
    assert.equal(params.includes(param), false, `параметр ${param} в Clean-param перекрывает переброс на раздел`);
  }
  // Само правило не запрещает обход каталога.
  assert.equal(allowed(rules, "/catalog"), true);
  assert.equal(allowed(rules, "/catalog/byd"), true);
});

test("на тестовой сборке закрыто всё", async () => {
  const rules = await robots();
  assert.match(rules, /^Disallow: \/$/m);
  assert.equal(allowed(rules, "/cars/59372753"), false);
});

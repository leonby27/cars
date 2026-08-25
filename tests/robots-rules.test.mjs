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
  <head><meta charset="utf-8" /><title>abcars.by</title></head>
  <body><div id="root"></div></body>
</html>
`;

async function robots(env = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "robots-"));
  const clientDir = path.join(dir, "client");
  await mkdir(clientDir, { recursive: true });
  await writeFile(path.join(clientDir, "index.html"), shell);
  await run(process.execPath, [script], {
    env: { ...process.env, SEO_OUTPUT_DIR: clientDir, SITE_URL: "https://abcars.by", SEO_VEHICLE_PAGES: "", SEO_CARS_SITEMAP: "", SEO_CARS_FROM_DB: "", SEO_SITEMAP_TOKEN: "testtoken", ...env },
  });
  return readFile(path.join(clientDir, "robots.txt"), "utf8");
}

/**
 * Правила для одного робота. В robots.txt правила разбиты на группы: строки
 * `User-agent` перечисляют, к кому относится группа, и робот читает только свою.
 * Поэтому запрет для сборщиков данных нельзя проверять вместе с правилами для
 * поисковиков — иначе тест не заметит, что запрет случайно накрыл Google.
 */
function group(rules, agent = "*") {
  const groups = [];
  let current = null;
  for (const line of rules.split("\n")) {
    const header = line.match(/^User-agent:\s*(\S+)$/i);
    if (header) {
      if (!current || current.rules.length) current = { agents:[], rules:[] };
      if (!groups.includes(current)) groups.push(current);
      current.agents.push(header[1].toLowerCase());
      continue;
    }
    if (current && /^(Allow|Disallow):/i.test(line)) current.rules.push(line);
  }
  const name = String(agent).toLowerCase();
  const own = groups.find((item) => item.agents.includes(name));
  const fallback = groups.find((item) => item.agents.includes("*"));
  return ((own || fallback)?.rules || []).join("\n");
}

/**
 * Разрешён ли адрес по правилам robots.txt. Сравнение по началу строки, `$` означает
 * точное совпадение, `*` — любую последовательность. Побеждает самое длинное правило —
 * так же, как это делают Google и Яндекс.
 */
function allowed(rules, url, agent = "*") {
  rules = group(rules, agent);
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

// Роботов, которые вычитывают сайт для обучения ИИ и для оптовых SEO-сервисов, мы
// закрыли: пользы от них нет, а сервер они грузят как настоящая толпа. Поисковики
// при этом обязаны остаться открытыми — иначе сайт выпадет из выдачи.
test("поисковики открыты, а сборщики данных для ИИ закрыты", async () => {
  const rules = await robots({ SEO_ALLOW_INDEXING: "1" });
  for (const agent of ["Googlebot", "Googlebot-Image", "Google-InspectionTool", "YandexBot", "Bingbot", "Applebot", "DuckDuckBot", "OAI-SearchBot", "PerplexityBot"]) {
    assert.equal(allowed(rules, "/", agent), true, `${agent} должен видеть главную`);
    assert.equal(allowed(rules, "/cars/59372753", agent), true, `${agent} должен видеть карточку машины`);
    assert.equal(allowed(rules, "/catalog/byd", agent), true, `${agent} должен видеть раздел каталога`);
  }
  for (const agent of ["ClaudeBot", "GPTBot", "CCBot", "Bytespider", "AhrefsBot", "SemrushBot", "MJ12bot", "DataForSeoBot"]) {
    assert.equal(allowed(rules, "/", agent), false, `${agent} должен быть закрыт`);
    assert.equal(allowed(rules, "/cars/59372753", agent), false, `${agent} должен быть закрыт`);
  }
  // Личные разделы закрыты по-прежнему для всех, включая поисковиков.
  assert.equal(allowed(rules, "/account", "Googlebot"), false);
});

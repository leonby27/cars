// Журнал, страницы-инструменты и справочные страницы — готовой разметкой приложения
// в момент запроса.
//
// До 26.09.2026 эти страницы лежали файлами сборки с отдельным текстом для робота
// (.seo-body), а приложение в браузере стирало его и рисовало себя заново. Робот и
// человек видели разное. Теперь шапку страницы (заголовок, описание, разметка для
// поиска) по-прежнему готовит сборка (scripts/generate-seo-pages.mjs), а содержимое
// сервер рисует тем же приложением, что и браузер, и встраивает данные, из которых
// оно собрано: браузер оживляет страницу, не перерисовывая.
//
// Почему в момент запроса, а не при сборке: в журнале стоят «опубликовано 3 дня
// назад» и живые подборки машин — собранная заранее страница уже на следующий день
// разошлась бы с тем, что нарисует браузер. Главная — по той же причине: на ней блок
// журнала с такими же датами, и сам набор материалов зависит от сегодняшнего дня.
// Её файл сборки уже несёт готовую разметку (scripts/prerender-home.mjs) — он и
// остаётся запасным ответом.
//
// Нет сборки приложения или отрисовка упала — отдаём файл сборки как есть: прежняя
// страница с текстом для робота, приложение нарисует себя с нуля.
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadEntryServer } from "./app-render.mjs";
import { renderWithApi } from "./api-replay.mjs";
import { listCars } from "./repository.mjs";
import { injectAppRoot } from "./root-inject.mjs";
import { findBlogPost } from "../src/blog-posts.js";
import { BLOG_TEXTS } from "../src/blog-texts.js";
import { findToolPage } from "../src/tool-pages.js";
import { TOOL_PAGE_TEXTS } from "../src/tool-page-texts.js";

const clientDir = fileURLToPath(new URL("../dist/client/", import.meta.url));
// Популярные модели и витрина главной: их считает сборка (generate-seo-pages) и кладёт
// рядом с dist/client; те же данные уже встроены в файл главной — первый кадр браузера
// рисуется из них, поэтому и сервер рисует из них же.
const homeDataFile = fileURLToPath(new URL("../dist/popular-models.json", import.meta.url));

// Справочные страницы и инструменты. Личные разделы (вход, избранное, аналитика)
// сюда не входят: их поисковику не показываем, и рисовать их заранее незачем.
const INFO_PATHS = new Set(["/how-it-works", "/contacts", "/customs", "/delivery-cost", "/ev-quota", "/range", "/price-belarus", "/china-brands", "/models"]);

/** Адрес, который отдаёт этот модуль: журнал, его материалы и справочные страницы. */
export const isStaticAppPath = (path) => path === "/" || INFO_PATHS.has(path) || path === "/blog" || /^\/blog\/[a-z0-9-]+$/.test(path);

// Файлы сборки держим в памяти до смены даты изменения (новая выкладка).
const files = new Map();
async function cachedFile(file) {
  try {
    const { mtimeMs } = await stat(file);
    const cached = files.get(file);
    if (cached?.mtimeMs === mtimeMs) return cached.text;
    const text = await readFile(file, "utf8");
    files.set(file, { mtimeMs, text });
    return text;
  } catch {
    return null;
  }
}
const pageFile = (path) => cachedFile(path === "/" ? `${clientDir}index.html` : `${clientDir}${path.replace(/^\//, "")}/index.html`);

/**
 * Размер каталога и дата последней сверки — строкой над заголовком главной. Раньше
 * обе цифры приходили только после загрузки скриптов, и поисковик не видел, сколько
 * машин в каталоге (размер ассортимента Яндекс прямо называет коммерческим признаком).
 * Те же поля, что отдаёт /api/cars: `total` и `refreshedAt`.
 */
async function catalogFacts() {
  try {
    const answer = await listCars(new URLSearchParams({ limit: "1", sort: "price_asc" }));
    return Number(answer?.total) > 0 ? { catalogFacts: { total: Number(answer.total), updatedAt: answer.refreshedAt ? new Date(answer.refreshedAt).toISOString() : "" } } : {};
  } catch {
    return {};
  }
}

/** Данные главной в том виде, в каком их встроил scripts/prerender-home.mjs, и цифры каталога. */
async function homeBoot() {
  const facts = await catalogFacts();
  try {
    const saved = JSON.parse((await cachedFile(homeDataFile)) || "null");
    if (!saved) return facts;
    const popularModels = Array.isArray(saved) ? saved : saved.models || [];
    const brandModelTabs = Array.isArray(saved) ? [] : saved.brands || [];
    const homeShowcase = Array.isArray(saved?.showcase) ? saved.showcase : [];
    return { ...(popularModels.length || homeShowcase.length ? { popularModels, brandModelTabs, homeShowcase } : {}), ...facts };
  } catch {
    return facts;
  }
}

/**
 * Страница по адресу: `{ status, html }`; `null` — такого адреса у модуля нет или
 * файла сборки нет (тогда отвечает обычное правило сайта).
 */
export async function renderStaticPage(rawPath, search = "") {
  const path = `/${String(rawPath || "").replace(/^\/+|\/+$/g, "")}`;
  if (!isStaticAppPath(path)) return null;
  const file = await pageFile(path);
  if (!file) return null;
  const entry = await loadEntryServer();
  if (!entry?.renderStaticApp) return { status: 200, html: file };
  const post = path.startsWith("/blog/") ? findBlogPost(path) : null;
  const options = {
    blogSlug: post?.slug || null,
    blogText: post ? BLOG_TEXTS[post.slug] || null : null,
    toolTexts: findToolPage(path) ? TOOL_PAGE_TEXTS : null,
  };
  const extra = path === "/" ? await homeBoot() : {};
  try {
    const { markup, api } = await renderWithApi((answers) => entry.renderStaticApp(path, search, { ...extra, api: answers }, options));
    // Цифры каталога — в данные страницы: первый кадр браузера рисует ту же строку.
    const html = markup ? injectAppRoot(file, markup, { path, boot: { api, ...(extra.catalogFacts ? { catalogFacts: extra.catalogFacts } : {}) } }) : null;
    return { status: 200, html: html || file };
  } catch (error) {
    console.error(`готовая страница ${path}: отрисовка упала, отдаём файл сборки`, error);
    return { status: 200, html: file };
  }
}

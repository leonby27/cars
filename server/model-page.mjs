// Каталожная страница модели `/catalog/<марка>/<модель>`, собранная в момент запроса.
//
// С 25.09.2026 у модели одна страница, и она — раздел каталога: сверху список
// объявлений с сортировкой, ценами и листалкой, под ним живые цифры, обзор (если
// написан, см. src/model-pages.js) и вопросы. Прежние обзоры `/models/<slug>`
// уводят сюда постоянным перебросом.
//
// Разметка одна для человека и робота: сервер рисует настоящую страницу приложения
// (renderModelApp в src/entry-server.jsx) и встраивает в неё данные, из которых она
// собрана, а браузер её оживляет. Если сборка приложения недоступна, отдаётся
// простая версия с теми же данными — страница хуже, но живая.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { brandModels, getCatalogMeta, listCars, modelCatalogFacts, modelClassStock, priceEdges } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
import { MODEL_PAGES, modelPageRedirect } from "../src/model-pages.js";
import { modelPageWithText } from "../src/model-texts.js";
import { brandForSlug, brandLandingPath, landingsForCar, modelFromSlug, modelLandingPath, priceBandsForCar } from "../src/catalog-landings.js";
import { modelSlug } from "../src/model-slug.js";
import { modelAutoText, modelCatalogSeo, modelFaq, modelFaqTitle, modelPageIndexable, modelStockLine } from "../src/model-landing.js";
import { estimateLandedCost } from "../src/pricing.js";
import { CATALOG_MAX_PAGES, CATALOG_PAGE_SIZE, catalogPageCount } from "../src/catalog-landings.js";
import { BLOG_ENABLED } from "../src/feature-flags.js";
import { blogPostsForModel } from "../src/blog-posts.js";

const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));

// Порядки, которые понимает страница; остальное считаем «по цене».
export const MODEL_SORTS = new Set(["price_asc", "price_desc", "newest", "mileage_asc", "range_desc", "year_desc", "year_asc"]);
// Ссылки на другие модели той же марки и похожие модели других марок внизу.
const siblingsOnPage = 12;
// Похожие модели других марок: тот же тип двигателя и кузов, по убыванию наличия.
const similarOnPage = 8;

/** Модели других марок того же класса — теперь страница есть у каждой модели с машинами. */
async function similarModels(brand, klass, limit = similarOnPage) {
  if (!klass.type || !klass.bodyType) return [];
  const seen = new Set();
  const picked = [];
  for (const row of await modelClassStock()) {
    if (row.brand === brand || row.powertrain !== klass.type || row.bodyType !== klass.bodyType) continue;
    const path = modelLandingPath(row.brand, row.model);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    picked.push({ path, name: `${row.brand} ${row.model}` });
    if (picked.length >= limit) break;
  }
  return picked;
}

// Готовая разметка приложения — лениво и один раз (см. car-page.mjs).
const entryServerPath = fileURLToPath(new URL("../dist/ssr/entry-server.js", import.meta.url));
let entryServerPromise = null;
const loadEntryServer = () => {
  if (!entryServerPromise) {
    entryServerPromise = existsSync(entryServerPath)
      ? import(pathToFileURL(entryServerPath).href).catch((error) => {
          console.error("страницы моделей: сборка приложения не загрузилась, отдаём простую версию", error);
          return null;
        })
      : Promise.resolve(null);
  }
  return entryServerPromise;
};

/** Обзор модели по марке и имени модели из базы (сравнение по слугу). */
const reviewFor = (brand, slug) => MODEL_PAGES.find((page) => page.brand === brand && modelSlug(page.model) === slug) || null;

/** Число страницы из адреса: null — адрес испорчен. */
const requestedPage = (params) => {
  const raw = params.get("page");
  if (raw === null || raw === "") return 1;
  if (!/^[1-9]\d{0,4}$/.test(String(raw))) return null;
  return Number(raw);
};

/** Параметры списка из адреса — те, что понимает страница. */
export function modelListQuery(params) {
  const sort = MODEL_SORTS.has(params.get("sort")) ? params.get("sort") : "price_asc";
  return { sort };
}

// Готовую первую страницу выдачи встраиваем только для адреса без своих фильтров
// (кроме страницы и порядка): фильтры каталог разбирает сам, и совпасть байт в байт
// список с ними не обязан — тогда обе стороны рисуют заглушку, а список приходит запросом.
const PLAIN_KEYS = new Set(["page", "sort"]);
export const plainModelSearch = (params) => [...params.keys()].every((key) => PLAIN_KEYS.has(key));

/**
 * Данные каталожной страницы модели — то же, что отдаёт `/api/model-catalog` и что
 * встраивается в готовую страницу. `null`, когда такой модели нет.
 */
export async function modelCatalogData({ brandSlug, modelSlug: slug, params = new URLSearchParams(), light = false }) {
  const brand = brandForSlug(brandSlug);
  if (!brand || !/^[a-z0-9-]+$/.test(String(slug || ""))) return null;
  const models = await brandModels(brand);
  const model = modelFromSlug(models.map((row) => row.model), slug);
  const review = reviewFor(brand, slug);
  if (!model && !review) return null;
  const name = review?.name || `${brand} ${model}`;
  const modelName = model || review.model;
  const page = requestedPage(params);
  if (page === null) return { invalid: true };
  const { sort } = modelListQuery(params);
  // Тот же запрос, что шлёт каталог в /api/cars для этого раздела.
  const listParams = new URLSearchParams({ brand, model: modelName, sort, limit: String(CATALOG_PAGE_SIZE), offset: String((page - 1) * CATALOG_PAGE_SIZE) });
  const [list, facts, edges] = await Promise.all([
    light ? { items: [], total: null, hasMore: false, changedAt: null } : listCars(listParams),
    modelCatalogFacts(brand, modelName),
    priceEdges(new URLSearchParams({ brand, model: modelName })),
  ]);
  // Края вилки — живым расчётом, как на карточках; сохранённая оценка отстаёт.
  if (edges?.cheapest) facts.priceFrom = estimateLandedCost(edges.cheapest).totalUsd;
  if (edges?.dearest) facts.priceTo = estimateLandedCost(edges.dearest).totalUsd;
  const total = light ? facts.total : list.total;
  const pages = Math.max(1, Math.min(CATALOG_MAX_PAGES, catalogPageCount(total)));
  const path = `/catalog/${brandSlug}/${slug}`;
  const siblings = MODEL_PAGES.filter((item) => item.brand === brand && item.path !== path).slice(0, siblingsOnPage).map(({ path: p, name: n }) => ({ path: p, name: n }));
  const klass = { type: facts.powertrains[0]?.type || null, bodyType: facts.bodyTypes[0]?.name || null };
  const sections = [
    ...landingsForCar({ brand, type: klass.type, bodyType: klass.bodyType }),
    ...priceBandsForCar({ type: klass.type, landedUsd: facts.priceFrom }),
  ].map(({ path: p, name: n }) => ({ path: p, name: n }));
  const journal = BLOG_ENABLED && review ? blogPostsForModel(review.path).map((post) => ({ path: post.path, name: post.name })) : [];
  const similar = await similarModels(brand, klass);
  return {
    model: { brand, model: modelName, name, path, brandSlug, modelSlug: slug, inCatalog: Boolean(model) },
    review: review
      ? { slug: review.slug, path: review.path, legacyPath: review.legacyPath, name: review.name, h1: review.h1, lead: review.lead, teaser: review.teaser, tagline: review.tagline }
      : null,
    query: { sort },
    page,
    pages,
    // Лента карточки списка показывает пять кадров — остальные адреса (у машины их
    // бывает сорок) только раздували бы страницу: сотня машин встраивается в неё целиком.
    cars: list.items.map((item) => ({ ...item, images: (item.images || []).slice(0, 5) })),
    total,
    hasMore: Boolean(list.hasMore),
    changedAt: list.changedAt || facts.changedAt || null,
    facts,
    links: { brandPath: brandLandingPath(brand), sections, siblings, similar, journal },
  };
}

async function renderModelAppMarkup(path, search, boot, text) {
  const entry = await loadEntryServer();
  if (!entry?.renderModelApp) return null;
  try {
    return entry.renderModelApp(path, search, boot, { text });
  } catch (error) {
    console.error("страницы моделей: отрисовка приложения упала, отдаём простую версию", error);
    return null;
  }
}

/** Простая версия страницы — когда готовой разметки приложения нет. */
function fallbackBody(renderer, data, { faq, autoText, review }) {
  const { carLinks, hrefRoute, navigation, footer, pathwayLinks } = renderer;
  const { model, cars, links, page, pages } = data;
  const stock = modelStockLine(data.facts, { page, pages, first: (page - 1) * CATALOG_PAGE_SIZE, shown: cars.length });
  const list = cars.length ? `<section><h2>${model.name} в наличии — цены до Минска</h2>${carLinks(cars)}</section>` : "";
  const paging = pages > 1 ? `<p>${Array.from({ length: pages }, (_, index) => index + 1).map((n) => (n === page ? `<strong>${n}</strong>` : `<a href="${hrefRoute(n > 1 ? `${model.path}?page=${n}` : model.path)}">${n}</a>`)).join(" ")}</p>` : "";
  const text = page > 1 ? "" : `<section><h2>${model.name}: что есть в каталоге</h2>${autoText.map((p) => `<p>${p}</p>`).join("")}</section>${review ? renderer.modelPageArticle(review) : ""}`;
  const questions = page > 1 || !faq.length ? "" : `<section><h2>${modelFaqTitle(model.name)}</h2>${faq.map((item) => `<h3>${item.q}</h3><p>${item.a}</p>`).join("")}</section>`;
  const ways = pathwayLinks({ heading: `Где смотреть ${model.name} и похожие машины`, links: [...(links.brandPath ? [[links.brandPath, `Все ${model.brand} из Китая`, null]] : []), ...links.sections.map((s) => [s.path, s.name, null]), ...links.siblings.map((s) => [s.path, s.name, null]), ...(links.similar || []).map((s) => [s.path, s.name, null]), ...links.journal.map((s) => [s.path, s.name, null])] });
  return `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили из Китая</a>${links.brandPath ? ` → <a href="${hrefRoute(links.brandPath)}">${model.brand}</a>` : ""}</p><h1>${modelCatalogSeo({ name: model.name, facts: data.facts, review, page }).h1}${page > 1 ? ` — страница ${page}` : ""}</h1><p>${stock}</p>${renderer.freshnessLine(data.changedAt)}${list}${paging}${text}${questions}${ways}</main>${footer()}`;
}

/**
 * Готовая каталожная страница модели: `{ status, html }` или `{ status: 301, location }`.
 */
export async function renderModelCatalogPage(brandSlug, slug, searchParams) {
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || "");
  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const data = await modelCatalogData({ brandSlug, modelSlug: slug, params });
  if (!data || data.invalid) return { status: 404, html: renderer.landingMissingPage() };
  const path = data.model.path;
  // «?page=1» — та же первая страница: два адреса с одной выдачей поисковику не нужны.
  if (params.get("page") !== null && data.page === 1) return { status: 301, location: path };
  if (data.page > data.pages && data.total) return { status: 404, html: renderer.landingMissingPage() };
  const review = data.review ? modelPageWithText(MODEL_PAGES.find((item) => item.slug === data.review.slug)) : null;
  const seo = modelCatalogSeo({ name: data.model.name, facts: data.facts, review, page: data.page });
  const faq = data.page > 1 ? [] : modelFaq({ name: data.model.name, facts: data.facts, review });
  const autoText = modelAutoText({ name: data.model.name, facts: data.facts });
  const pageRoute = (n) => (n > 1 ? `${path}?page=${n}` : path);
  const canonical = renderer.routeUrl(pageRoute(data.page));
  // В строке запроса для оживления — только номер страницы и порядок; метки переходов
  // и фильтры не нужны. Со своими фильтрами в адресе готовый список не встраиваем
  // (см. plainModelSearch): каталог запросит его сам, а обе стороны рисуют заглушку.
  const kept = new URLSearchParams();
  for (const key of ["page", "sort"]) if (params.get(key)) kept.set(key, params.get(key));
  const search = kept.toString();
  const plain = plainModelSearch(params);
  const meta = await getCatalogMeta(null, data.model.brand, null);
  const boot = {
    modelCatalog: { ...data, cars: [] },
    // То, что каталог просит первым запросом: список и справочник фильтров.
    catalogValue: plain ? { items: data.cars, total: data.total, hasMore: data.hasMore, changedAt: data.changedAt } : null,
    catalogPath: path,
    catalogSearch: search,
    metaValue: meta,
    metaQuery: new URLSearchParams({ brand: data.model.brand }).toString(),
  };
  // Текст обзора в том же виде, в каком его подгружает браузер (см. model-text-load.js).
  const text = review ? { intro: review.intro, stats: review.stats, sections: review.sections, versions: review.versions, faq: review.faq, disclaimer: review.disclaimer } : null;
  const appRoot = await renderModelAppMarkup(path, search, boot, text);
  const first = (data.page - 1) * CATALOG_PAGE_SIZE;
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: seo.h1,
    url: canonical,
    numberOfItems: data.total,
    itemListElement: data.cars.slice(0, 24).map((car, index) => renderer.carListItem(car, first + index + 1)),
  };
  const crumbs = [["Главная", "/"], ["Автомобили из Китая", "/catalog/"]];
  if (data.links.brandPath) crumbs.push([data.model.brand, data.links.brandPath]);
  crumbs.push([data.model.name, pageRoute(data.page)]);
  const html = renderer.renderHtml({
    title: seo.title,
    description: seo.description,
    canonical,
    body: appRoot ? "" : fallbackBody(renderer, data, { faq, autoText, review }),
    type: "website",
    // Модель без единой машины и без обзора страницы не имеет (404 выше); с обзором —
    // индексируется: текст есть, предложение «под заказ» тоже. Без обзора и меньше
    // чем с тремя машинами — тонкая страница из автотекста: noindex.
    indexable: allowIndexing && modelPageIndexable({ facts: data.facts, review: data.review }),
    prev: data.page > 1 ? renderer.routeUrl(pageRoute(data.page - 1)) : null,
    next: data.page < data.pages ? renderer.routeUrl(pageRoute(data.page + 1)) : null,
    appRoot,
    appRootPath: path,
    bootData: appRoot ? boot : null,
    // Разметку вопросов при готовой разметке приложения ставит оно само (ArticleFaq);
    // в простой версии — добавляем здесь.
    schemas: [renderer.breadcrumbsSchema(crumbs), ...(data.cars.length ? [itemList] : []), ...(faq.length && !appRoot ? [renderer.faqSchema(faq)] : [])],
  });
  return { status: 200, html };
}

/**
 * Прежний адрес обзора `/models/<slug>`: постоянный переброс на каталожную страницу
 * модели; неизвестный слуг — 404.
 */
export async function renderModelPage(slug) {
  const location = modelPageRedirect(slug);
  if (location) return { status: 301, location };
  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  return { status: 404, html: renderer.landingMissingPage() };
}

import {preparedCatalogFacts,preparedBrandStock,preparedBrandModels} from "./prepared-catalog.mjs";
// Страницы каталога, собранные в момент запроса: общая `/catalog` и разделы под марку,
// тип двигателя или кузов — `/catalog/byd`, `/catalog/electric`, `/catalog/suv`.
//
// Зачем сервером, а не файлами: список машин в разделе меняется каждый день, а держать
// готовые файлы и пересобирать сайт ради обновления списка незачем. Карточки берём
// из базы; сводку для SEO — из готовых данных, без ожидания нового подсчёта.
import { listCars, minimumPricedCar, readyCatalogMeta, readyCatalogSummary } from "./repository.mjs";
import { bootCars, catalogBootSearch, catalogMetaBoot, catalogSortFor, dailyShuffleSeed, plainCatalogSearch, renderCatalogAppMarkup } from "./app-render.mjs";
import { catalogRedirect } from "../src/catalog-url.js";
import { estimateLandedCost } from "../src/pricing.js";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
import { CATALOG_LANDINGS, CATALOG_PAGE_SIZE, CATALOG_MAX_PAGES, catalogLandingMoved, catalogPageCount, findCatalogLanding, landingApiParams, landingSeoDescription, landingSeoTitle, priceBandsForLanding, relatedLandings } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";
import { withoutTrackingParams } from "../src/tracking-params.js";
// Вычеркнутые марки: из наличия их убрали, но раздел оставили с предложением
// привезти под заказ — см. ветку «раздел без единой машины» ниже.
import { EXCLUDED_BRANDS } from "../config/import-policy.mjs";

const droppedBrands = new Set(EXCLUDED_BRANDS);

const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Сколько машин на одной странице раздела — столько же, сколько догружает кнопка
// «Подгрузить ещё» в каталоге. Раньше здесь было 48 и следующей страницы не было вовсе:
// из 31 332 машин внутренние ссылки вели примерно к 4 300, остальные поисковик знал
// только из карты сайта и заходил на них редко.
const carsOnPage = CATALOG_PAGE_SIZE;

/**
 * Номер страницы из адреса. `null` — адрес испорчен («?page=абв», «?page=0»),
 * такие страницы отвечают 404, а не молча показывают первую: иначе у каждой страницы
 * раздела появился бы бесконечный хвост адресов с одной и той же выдачей.
 */
function requestedPage(params) {
  const raw = params.get("page");
  if (raw === null || raw === "") return 1;
  if (!/^[1-9]\d{0,4}$/.test(String(raw))) return null;
  return Number(raw);
}

/** Адрес страницы списка: первая — без параметра, дальше `?page=2`. */
const pageLocation = (path, page, params) => {
  const rest = new URLSearchParams();
  for (const [key, value] of params) if (key !== "page" && key !== "path" && key !== "slug") rest.append(key, value);
  const query = [page > 1 ? `page=${page}` : "", rest.toString()].filter(Boolean).join("&");
  return `${path}${query ? `?${query}` : ""}`;
};

// Раздел марки, которой в каталоге ещё нет, не показываем и не отдаём: страницы марок
// заведены заранее, под загрузку каталога, а пустой раздел для поисковика — тонкая
// страница без содержания. Разделы без марки (тип двигателя, кузов, цена) собраны из
// того, что в каталоге есть всегда, и проверки не требуют.
export const visibleLandings = (stock) => (landing) => !landing.brand || (stock.get(landing.brand) || 0) > 0;

/**
 * Пускать ли поисковик на страницу раздела. Раздел без единой машины (вычеркнутая
 * марка, см. ниже) для человека остаётся — с предложением привезти под заказ, — но
 * для поиска это пустая страница: 25.09.2026 таких было 22, все с «index, follow».
 */
export const landingIndexable = ({ total, allowIndexing: allowed = allowIndexing }) => Boolean(allowed) && (Number(total) || 0) > 0;

/**
 * Общая страница каталога `/catalog` — тоже в момент запроса, вместе с фильтрами из адреса.
 *
 * Адрес с фильтрами, которые в точности повторяют раздел (`/catalog?brand=BYD`), — это
 * копия готовой страницы `/catalog/byd`. Раньше по нему отдавался общий каталог, и
 * поисковику сообщалось, что первоисточник — каталог целиком: вес ссылок уходил не туда,
 * а сам раздел марки в этом сравнении не участвовал. Теперь такой адрес перебрасывается
 * на раздел навсегда (301), метки переходов при этом сохраняются.
 *
 * Возвращает либо `{ status: 301, location }`, либо `{ status, html }`.
 */
/**
 * Первая выдача страницы списка — тот же запрос, который каталог в браузере шлёт в
 * /api/cars (фильтры раздела, порядок, ключ перемешивания, одна порция машин и
 * отступ). Ответ идёт и в готовую разметку, и в данные для оживления: совпасть с
 * первым кадром браузера список обязан байт в байт.
 */
async function firstListing(filters, query, number, summary = null) {
  const sort = catalogSortFor(query);
  const seed = sort === "default" ? (/^s\d{1,2}$/.test(query.get("seed") || "") ? query.get("seed") : dailyShuffleSeed()) : null;
  const params = new URLSearchParams(filters);
  params.set("sort", sort);
  if (seed) params.set("seed", seed);
  params.set("limit", String(carsOnPage));
  params.set("offset", String((number - 1) * carsOnPage));
  params.set("summary", "defer");
  const list = await listCars(params, { summary, includeYears:true });
  return { list, sort, seed };
}

/**
 * Встроенные данные готовой страницы: первая выдача (только для адреса без своих
 * фильтров, см. plainCatalogSearch), ключ перемешивания, справочник фильтров под тот
 * же отбор, что спросит каталог (/api/catalog/meta), и сводка по марке.
 */
async function catalogContext(filters) {
  const type = filters.get("type");
  const brandFilter = filters.get("brand");
  const bodyType = filters.getAll("bodyType");
  const country = filters.get("country") || null;
  // Та же строка, что собирает catalogMetaQuery в приложении: тип, марка, кузов, страна.
  const metaQuery = new URLSearchParams();
  if (type) metaQuery.set("type", type);
  if (brandFilter) metaQuery.set("brand", brandFilter);
  for (const value of bodyType) metaQuery.append("bodyType", value);
  if (country) metaQuery.set("country", country);
  // Use only prepared values here; the browser refreshes filter metadata separately.
  const stock = preparedBrandStock();
  const meta = readyCatalogMeta(type || null, brandFilter || null, bodyType, country);
  return { metaQuery, meta, stock };
}

function catalogBoot({ path, query, list, seed, context, guide = null, brand = null }) {
  return {
    catalogValue: plainCatalogSearch(query) ? { items: bootCars(list.items), total: list.total, summaryPending: true, hasMore: Boolean(list.hasMore), changedAt: list.changedAt || null } : null,
    catalogPath: path,
    catalogSearch: catalogBootSearch(query),
    catalogSeed: seed,
    ...catalogMetaBoot(context.metaQuery, context.meta),
    catalogSummaryPending: true,
    ...(guide && brand ? { brandGuideValue: guide, brandGuideBrand: brand } : {}),
  };
}

/**
 * Готовая разметка приложения для страницы списка; null — отдаём простую версию.
 * Рисуем по адресу запроса (`query`), а не только по странице и порядку: каталог
 * в браузере читает из адреса фильтры, а сверку встроенного списка ведёт по всей строке
 * запроса. Метки переходов (utm, yclid, nocount) отбрасывают обе стороны — выдачу они
 * не меняют; до 28.09.2026 с ними вместо машин рисовались пустые заготовки.
 */
async function catalogApp(path, boot, query) {
  const appRoot = await renderCatalogAppMarkup(path, withoutTrackingParams(query).toString(), boot);
  return appRoot ? { appRoot, appRootPath: path, bootData: boot } : null;
}

export async function renderCatalogIndex(searchParams) {
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || "");
  const location = catalogRedirect(null, params);
  if (location) return { status: 301, location };

  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const number = requestedPage(params);
  if (number === null || number > CATALOG_MAX_PAGES) return { status: 404, html: renderer.landingMissingPage() };
  // «?page=1» — тот же самый каталог, что и без параметра: два адреса с одной выдачей
  // поисковику не нужны.
  if (params.get("page") !== null && number === 1) return { status: 301, location: pageLocation("/catalog", 1, params) };

  // Без явной сортировки первая порция сразу выбирается по возрастанию цены.
  const filters = new URLSearchParams();
  const [{ list, seed }, cheapest] = await Promise.all([
    firstListing(filters, params, number),
    minimumPricedCar(new URLSearchParams()),
  ]);
  const { items } = list;
  const known = readyCatalogSummary(filters) || preparedCatalogFacts("/catalog");
  const total = items.length ? (known?.total > 0 ? known.total : null) : 0;
  const changedAt = known?.changedAt || null;
  const pages = catalogPageCount(total);
  if (number > 1 && !items.length) return { status: 404, html: renderer.landingMissingPage() };
  const context = await catalogContext(filters);

  // Полные записи машин (с ценой) — из того же ответа: первые 24 идут в разметку
  // предложений, весь список — в готовую страницу.
  const priced = items.slice(0, 24);
  const app = await catalogApp("/catalog", catalogBoot({ path: "/catalog", query: params, list, seed, context }), params);
  const page = renderer.catalogIndexPage({ app, cars: items, total, sections: CATALOG_LANDINGS.filter(visibleLandings(context.stock)), page: number, pages, perPage: carsOnPage, cheapest, priced, changedAt });
  return { status: 200, html: page.html };
}

/**
 * Готовая страница раздела каталога: `{ status, html }`.
 * Неизвестный раздел отвечает 404 — иначе любой адрес вида `/catalog/что-угодно`
 * притворялся бы существующей страницей.
 */
export async function renderCatalogPage(slug, searchParams) {
  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const path = `/catalog/${String(slug || "").trim()}`;
  const landing = findCatalogLanding(path);
  // Раздел переехал вместе с переименованием марки: уводим постоянным перебросом,
  // чтобы старая ссылка из индекса поисковика не отдавала 404.
  if (!landing) {
    const moved = catalogLandingMoved(path);
    if (moved) return { status: 301, location: moved };
    return { status: 404, html: renderer.landingMissingPage() };
  }

  const query = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || "");
  const location = catalogRedirect(landing, query);
  if (location) return { status: 301, location };
  const number = requestedPage(query);
  if (number === null || number > CATALOG_MAX_PAGES) return { status: 404, html: renderer.landingMissingPage() };
  if (query.get("page") !== null && number === 1) return { status: 301, location: pageLocation(landing.path, 1, query) };

  const params = landingApiParams(landing);
  const [{ list, seed }, cheapest] = await Promise.all([
    firstListing(params, query, number),
    minimumPricedCar(params),
  ]);
  const guide = null;
  const models = landing.brand && number === 1 ? preparedBrandModels(landing.brand) : [];
  const { items } = list;
  const known = readyCatalogSummary(params) || preparedCatalogFacts(landing.path);
  const total = items.length ? (known?.total > 0 ? known.total : null) : 0;
  const changedAt = known?.changedAt || null;
  const pages = catalogPageCount(total);
  if (number > 1 && !items.length) return { status: 404, html: renderer.landingMissingPage() };
  // Раздел без единой машины обычно значит «марку ещё не загрузили» — такой страницы
  // для посетителя нет. Но у вычеркнутых марок (31.08.2026) машин не будет никогда,
  // а привезти их под заказ мы можем: страница остаётся и честно это предлагает.
  // Иначе 21 раздел, уже отданный поисковику, разом превратился бы в 404.
  // Страница страны без машин (Корея до первого импорта) тоже остаётся: предлагает
  // привезти под заказ, а от поиска закрыта — landingIndexable при нуле даёт noindex.
  if (!items.length && !droppedBrands.has(landing.brand) && landing.kind !== "origin") return { status: 404, html: renderer.landingMissingPage() };
  const context = await catalogContext(params);
  const priced = items.slice(0, 24);

  // Обзоры моделей этой марки — сильные внутренние ссылки: у каждой такой страницы
  // около девятисот слов текста, и ведут они внутрь того же раздела.
  const modelPages = landing.brand ? MODEL_PAGES.filter((page) => page.brand === landing.brand) : [];
  // Разделы по смыслу, а не все подряд: полный список всех 57 лежит в каталоге, а здесь
  // сначала то, что связано с этим разделом (та же марка, тот же кузов, тот же тип),
  // и немного соседей. Одинаковый на всех страницах блок поисковик обесценивает.
  const related = relatedLandings(landing).filter(visibleLandings(context.stock));
  // Ценовые полосы — к каждому разделу: они собраны из всего каталога и на них
  // почти не было входящих ссылок (см. priceBandsForLanding).
  const seen = new Set(related.map((item) => item.path));
  const others = [...related, ...priceBandsForLanding(landing).filter((band) => !seen.has(band.path))];

  // Заголовок и описание с живыми цифрами: число машин, цена «от» (тем же расчётом,
  // что в карточке) и годы. На пагинации групп сохраняем цифры и добавляем номер.
  const stats = {
    total,
    priceFrom: cheapest ? estimateLandedCost(cheapest).totalUsd : null,
    yearMin: number === 1 ? list.yearMin ?? null : null,
    yearMax: number === 1 ? list.yearMax ?? null : null,
  };
  const seo = { title: landingSeoTitle(landing, stats), description: landingSeoDescription(landing, stats) };
  const app = await catalogApp(landing.path, catalogBoot({ path: landing.path, query, list, seed, guide, brand: landing.brand, context }), query);
  const page = renderer.landingPage({ app, landing, cars: items, total, modelPages, models, others, page: number, pages, perPage: carsOnPage, cheapest, priced, changedAt, guide, indexable: total == null ? allowIndexing : landingIndexable({ total }), seo });
  return { status: 200, html: page.html };
}

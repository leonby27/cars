// Страницы каталога, собранные в момент запроса: общая `/catalog` и разделы под марку,
// тип двигателя или кузов — `/catalog/byd`, `/catalog/electric`, `/catalog/suv`.
//
// Зачем сервером, а не файлами: список машин в разделе меняется каждый день, а держать
// тридцать один готовый файл и пересобирать сайт ради обновления списка незачем. Данные
// берутся из базы, поэтому количество машин и ссылки всегда настоящие.
import { brandStock, carsByIds, listCarPage, priceEdges } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
import { CATALOG_LANDINGS, CATALOG_PAGE_SIZE, catalogLandingMoved, catalogLandingRedirect, catalogPageCount, catalogPlaceholderRedirect, findCatalogLanding, landingApiParams, relatedLandings } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";

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
export async function renderCatalogIndex(searchParams) {
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || "");
  const location = catalogLandingRedirect(params);
  if (location) return { status: 301, location };
  // Раздела в фильтрах нет, а подписи «не выбрано» в адресе есть — убираем их.
  // Переброс тут один: адрес раздела выше собирается уже без них.
  const cleaned = catalogPlaceholderRedirect("/catalog", params);
  if (cleaned) return { status: 301, location: cleaned };

  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const number = requestedPage(params);
  if (number === null) return { status: 404, html: renderer.landingMissingPage() };
  // «?page=1» — тот же самый каталог, что и без параметра: два адреса с одной выдачей
  // поисковику не нужны.
  if (params.get("page") !== null && number === 1) return { status: 301, location: pageLocation("/catalog", 1, params) };

  // Порядок по цене, а не выдача по умолчанию: та перемешана и от запроса к запросу
  // меняется, а страницы списка должны делить каталог на непересекающиеся куски.
  const query = new URLSearchParams({ sort: "price_asc" });
  const [{ items, total }, edges] = await Promise.all([
    listCarPage(query, { limit: carsOnPage, offset: (number - 1) * carsOnPage }),
    priceEdges(query),
  ]);
  const pages = catalogPageCount(total);
  if (number > pages) return { status: 404, html: renderer.landingMissingPage() };

  // Цены в разметке ставим у первых двух десятков машин страницы. Сам список собран
  // узкой выборкой без полей, из которых считается цена, поэтому эти двадцать четыре
  // машины дочитываем по номерам — поиск по ключу, от глубины страницы не зависит.
  const priced = await carsByIds(items.slice(0, 24).map((car) => car.id));
  const stock = await brandStock();
  const page = renderer.catalogIndexPage({ cars: items, total, sections: CATALOG_LANDINGS.filter(visibleLandings(stock)), page: number, pages, perPage: carsOnPage, edges, priced });
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
  const cleaned = catalogPlaceholderRedirect(landing.path, query);
  if (cleaned) return { status: 301, location: cleaned };
  const number = requestedPage(query);
  if (number === null) return { status: 404, html: renderer.landingMissingPage() };
  if (query.get("page") !== null && number === 1) return { status: 301, location: pageLocation(landing.path, 1, query) };

  const params = landingApiParams(landing);
  params.set("sort", "price_asc");
  const [{ items, total }, edges] = await Promise.all([
    listCarPage(params, { limit: carsOnPage, offset: (number - 1) * carsOnPage }),
    priceEdges(params),
  ]);
  const pages = catalogPageCount(total);
  if (number > pages) return { status: 404, html: renderer.landingMissingPage() };
  // Раздел без единой машины — пустая страница: пока марку не загрузили, её здесь нет.
  if (!total) return { status: 404, html: renderer.landingMissingPage() };
  const priced = await carsByIds(items.slice(0, 24).map((car) => car.id));

  // Обзоры моделей этой марки — сильные внутренние ссылки: у каждой такой страницы
  // около девятисот слов текста, и ведут они внутрь того же раздела.
  const modelPages = landing.brand ? MODEL_PAGES.filter((page) => page.brand === landing.brand) : [];
  // Разделы по смыслу, а не все подряд: полный список всех 57 лежит в каталоге, а здесь
  // сначала то, что связано с этим разделом (та же марка, тот же кузов, тот же тип),
  // и немного соседей. Одинаковый на всех страницах блок поисковик обесценивает.
  const stock = await brandStock();
  const others = relatedLandings(landing).filter(visibleLandings(stock));

  const page = renderer.landingPage({ landing, cars: items, total, modelPages, others, page: number, pages, perPage: carsOnPage, edges, priced });
  return { status: 200, html: page.html };
}

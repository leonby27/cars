// Страницы каталога, собранные в момент запроса: общая `/catalog` и разделы под марку,
// тип двигателя или кузов — `/catalog/byd`, `/catalog/electric`, `/catalog/suv`.
//
// Зачем сервером, а не файлами: список машин в разделе меняется каждый день, а держать
// тридцать один готовый файл и пересобирать сайт ради обновления списка незачем. Данные
// берутся из базы, поэтому количество машин и ссылки всегда настоящие.
import { listCars } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
import { CATALOG_LANDINGS, catalogLandingRedirect, findCatalogLanding, landingApiParams, relatedLandings } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";

const siteUrl = String(process.env.SITE_URL || "https://evcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Сколько машин перечисляем ссылками. Это путь, по которому поисковик уходит из раздела
// в карточки; больше пятидесяти ссылок на странице он всё равно обходит неохотно.
const carsOnPage = 48;

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

  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const query = new URLSearchParams({ sort: "default", limit: String(carsOnPage) });
  const { items, total } = await listCars(query);
  const page = renderer.catalogIndexPage({ cars: items, total, sections: CATALOG_LANDINGS });
  return { status: 200, html: page.html };
}

/**
 * Готовая страница раздела каталога: `{ status, html }`.
 * Неизвестный раздел отвечает 404 — иначе любой адрес вида `/catalog/что-угодно`
 * притворялся бы существующей страницей.
 */
export async function renderCatalogPage(slug) {
  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const landing = findCatalogLanding(`/catalog/${String(slug || "").trim()}`);
  if (!landing) return { status: 404, html: renderer.landingMissingPage() };

  const params = landingApiParams(landing);
  params.set("sort", "price_asc");
  params.set("limit", String(carsOnPage));
  const { items, total } = await listCars(params);

  // Обзоры моделей этой марки — сильные внутренние ссылки: у каждой такой страницы
  // около девятисот слов текста, и ведут они внутрь того же раздела.
  const modelPages = landing.brand ? MODEL_PAGES.filter((page) => page.brand === landing.brand) : [];
  // Разделы по смыслу, а не все подряд: полный список всех 57 лежит в каталоге, а здесь
  // сначала то, что связано с этим разделом (та же марка, тот же кузов, тот же тип),
  // и немного соседей. Одинаковый на всех страницах блок поисковик обесценивает.
  const others = relatedLandings(landing);

  const page = renderer.landingPage({ landing, cars: items, total, modelPages, others });
  return { status: 200, html: page.html };
}

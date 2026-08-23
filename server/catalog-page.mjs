// Страница каталога под марку, тип двигателя или кузов — `/catalog/byd`,
// `/catalog/electric`, `/catalog/suv` — собранная в момент запроса.
//
// Зачем сервером, а не файлами: список машин в разделе меняется каждый день, а держать
// тридцать один готовый файл и пересобирать сайт ради обновления списка незачем. Данные
// берутся из базы, поэтому количество машин и ссылки всегда настоящие.
import { listCars } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
import { CATALOG_LANDINGS, findCatalogLanding, landingApiParams } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";

const siteUrl = String(process.env.SITE_URL || "https://evcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Сколько машин перечисляем ссылками. Это путь, по которому поисковик уходит из раздела
// в карточки; больше пятидесяти ссылок на странице он всё равно обходит неохотно.
const carsOnPage = 48;

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
  // Все остальные разделы, а не только однотипные: типов двигателя всего два, и раздел
  // электромобилей — самый ценный на сайте — получал ровно одну входящую ссылку.
  const others = CATALOG_LANDINGS.filter((item) => item.path !== landing.path);

  const page = renderer.landingPage({ landing, cars: items, total, modelPages, others });
  return { status: 200, html: page.html };
}

// Обзор модели, собранный в момент запроса: текст плюс живые предложения с ценами.
//
// Раньше эти 130 страниц лежали файлами из сборки, и цен в них не было — список машин
// под текстом рисует скрипт. Запрос «Tesla Model Y из Китая цена» покупательский, в
// выдаче по нему каталоги с ценами, а мы приходили статьёй, имея 2 751 живую Model Y.
// Держать цены в файлах нельзя: они устареют до следующей выкладки, а ссылки на
// проданные машины начнут отвечать «страницы нет».
import { listCars, priceEdges } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
import { MODEL_PAGES, findModelPage } from "../src/model-pages.js";
// Текст обзора лежит отдельным файлом на модель: браузеру мы отдаём только нужный,
// а здесь нужен весь текст сразу — страницу для поисковика собираем целиком.
import { modelPageWithText } from "../src/model-texts.js";
import { brandLandingPath, findCatalogLanding } from "../src/catalog-landings.js";

const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Сколько машин перечисляем ссылками. Двенадцать — столько же, сколько на странице
// машины: этого хватает, чтобы показать разброс цен и дать роботу путь в карточки.
const offersOnPage = 12;
// Сколько соседних моделей той же марки ставим ссылками внизу страницы.
const siblingsOnPage = 12;

/**
 * Готовый обзор модели: `{ status, html }`.
 * Неизвестный адрес отвечает 404 — иначе `/models/что-угодно` притворялся бы страницей.
 */
export async function renderModelPage(slug) {
  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const found = findModelPage(`/models/${String(slug || "").trim()}`);
  if (!found) return { status: 404, html: renderer.landingMissingPage() };
  const page = modelPageWithText(found);

  // Самые доступные машины модели: по ним считается «от такой-то цены».
  const params = new URLSearchParams({ brand: page.brand, model: page.model, sort: "price_asc", limit: String(offersOnPage) });
  // Вилка цен — по всем машинам модели: загруженная дюжина это самые доступные,
  // и верхняя граница по ней вышла бы заниженной.
  const [{ items, total }, edges] = await Promise.all([listCars(params), priceEdges(params)]);

  const siblings = MODEL_PAGES.filter((item) => item.brand === page.brand && item.path !== page.path).slice(0, siblingsOnPage);
  const brandPath = brandLandingPath(page.brand);
  const brandLanding = brandPath ? findCatalogLanding(brandPath) : null;

  const rendered = renderer.modelPage({ modelPage: page, cars: items, total, siblings, brandLanding, edges });
  return { status: 200, html: rendered.html };
}

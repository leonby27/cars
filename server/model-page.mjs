// Обзор модели, собранный в момент запроса: текст плюс живые предложения с ценами.
//
// Раньше эти 130 страниц лежали файлами из сборки, и цен в них не было — список машин
// под текстом рисует скрипт. Запрос «Tesla Model Y из Китая цена» покупательский, в
// выдаче по нему каталоги с ценами, а мы приходили статьёй, имея 2 751 живую Model Y.
// Держать цены в файлах нельзя: они устареют до следующей выкладки, а ссылки на
// проданные машины начнут отвечать «страницы нет».
import { brandStock, listCars, modelClassStock, priceEdges } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
import { MODEL_PAGES, findModelPage } from "../src/model-pages.js";
// Текст обзора лежит отдельным файлом на модель: браузеру мы отдаём только нужный,
// а здесь нужен весь текст сразу — страницу для поисковика собираем целиком.
import { modelPageWithText } from "../src/model-texts.js";
import { brandLandingPath, findCatalogLanding, landingsForCar } from "../src/catalog-landings.js";
import { visibleLandings } from "./catalog-page.mjs";

const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Сколько машин перечисляем ссылками. Двенадцать — столько же, сколько на странице
// машины: этого хватает, чтобы показать разброс цен и дать роботу путь в карточки.
const offersOnPage = 12;
// Сколько соседних моделей той же марки ставим ссылками внизу страницы.
const siblingsOnPage = 12;
// Сколько обзоров моделей других марок того же класса ставим рядом.
const similarOnPage = 8;
// Сколько разделов каталога перечисляем: марка, марка с кузовом, тип двигателя, кузов
// и их сочетание — больше на одну модель и не приходится.
const sectionsOnPage = 6;

/** Кузов и тип двигателя модели — по тому, чего в наличии больше всего. */
const modelClass = (stock, page, cars) => {
  const own = stock.filter((row) => row.brand === page.brand && row.model === page.model);
  if (own.length) return { bodyType:own[0].bodyType || null, powertrain:own[0].powertrain || null };
  const car = cars[0];
  return { bodyType:car?.bodyType || null, powertrain:car?.type || null };
};

/**
 * Обзоры моделей того же класса у других марок: тот же кузов и тот же тип двигателя,
 * по убыванию наличия. Своя марка исключена — её модели уже перечислены рядом,
 * отдельным блоком.
 */
function similarModelPages(stock, page, klass) {
  if (!klass.bodyType || !klass.powertrain) return [];
  const reviews = new Map(MODEL_PAGES.map((item) => [`${item.brand}|${item.model}`, item]));
  const picked = [];
  const seen = new Set();
  for (const row of stock) {
    if (row.brand === page.brand) continue;
    if (row.bodyType !== klass.bodyType || row.powertrain !== klass.powertrain) continue;
    const review = reviews.get(`${row.brand}|${row.model}`);
    if (!review || seen.has(review.path)) continue;
    seen.add(review.path);
    picked.push(review);
    if (picked.length >= similarOnPage) break;
  }
  return picked;
}

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
  const [{ items, total }, edges, stock, brands] = await Promise.all([
    listCars(params),
    priceEdges(params),
    modelClassStock(),
    brandStock(),
  ]);

  const siblings = MODEL_PAGES.filter((item) => item.brand === page.brand && item.path !== page.path).slice(0, siblingsOnPage);
  const brandPath = brandLandingPath(page.brand);
  const brandLanding = brandPath ? findCatalogLanding(brandPath) : null;

  // Разделы каталога, в которые эта модель попадает: марка, марка с кузовом, тип
  // двигателя, кузов и сочетания. Раньше со страницы обзора вела ровно одна ссылка в
  // каталог — на раздел марки, — и вес самой содержательной страницы сайта дальше
  // никуда не шёл.
  const klass = modelClass(stock, page, items);
  const visible = visibleLandings(brands);
  const sections = landingsForCar({ brand: page.brand, type: klass.powertrain, bodyType: klass.bodyType })
    .filter(visible)
    .sort((left, right) => Number(Boolean(right.brand)) - Number(Boolean(left.brand)))
    .slice(0, sectionsOnPage);
  const similar = similarModelPages(stock, page, klass);

  const rendered = renderer.modelPage({ modelPage: page, cars: items, total, siblings, brandLanding, edges, sections, similar });
  return { status: 200, html: rendered.html };
}

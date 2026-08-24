// Страница машины для поисковика, собранная в момент запроса.
//
// Зачем не файлами при сборке: карточек больше тридцати тысяч. Собирать их заранее — это
// гигабайт в `dist/` и полчаса на каждую выкладку, а цены в готовых файлах устаревают до
// следующей пересборки. Здесь страница берёт данные из базы в момент запроса, поэтому
// заголовок, цена и пробег всегда настоящие, а выкладка сайта не растёт.
//
// Ответ помечен как общий кэш на 10 минут: тридцать тысяч страниц обходит робот, и без
// кэша каждый его заход был бы отдельным запросом к базе.
import { getCar, listCars } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
// Обзоры моделей весят больше мегабайта, поэтому этот модуль сам подключается только
// по требованию — из обработчика запросов страницы машины. Обычные запросы к каталогу
// его не загружают, а сборщик функции видит обе зависимости и точно их упакует.
import { modelPageForCar } from "../src/model-pages.js";
import { landingsForCar } from "../src/catalog-landings.js";
import { normalizeDrive } from "../src/drive-types.js";

const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Сколько ссылок на другие машины той же модели ставим внизу страницы. Это единственный
// путь, по которому робот переходит из карточки в карточку: списки в приложении рисует
// скрипт, и в разметке их нет.
const relatedLimit = 12;

async function relatedCars(car) {
  if (!car.brand || !car.model) return [];
  const params = new URLSearchParams({ brand: car.brand, model: car.model, sort: "price_asc", limit: String(relatedLimit + 1) });
  const { items } = await listCars(params);
  return items.filter((item) => item.id !== car.id).slice(0, relatedLimit);
}

/**
 * Готовая страница машины: `{ status, html }`.
 * Снятое или несуществующее объявление отдаётся с кодом 404 — иначе поисковик держит
 * в индексе адреса проданных машин, каждый из которых отвечает «страница есть».
 */
export async function renderCarPage(id) {
  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const car = await getCar(String(id || "").trim());
  // Проданная машина здесь равна несуществующей: страница с честной ценой и наличием
  // из неё уже не получится, а 200 держал бы её в индексе поисковика как живую.
  if (!car || car.available === false) return { status: 404, html: renderer.carGonePage() };
  const related = await relatedCars(car);
  const page = renderer.carPage({
    car: { ...car, drive: normalizeDrive(car.drive) },
    related,
    modelPage: modelPageForCar(car),
    sections: landingsForCar(car),
  });
  return { status: 200, html: page.html };
}

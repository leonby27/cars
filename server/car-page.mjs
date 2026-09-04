// Страница машины для поисковика, собранная в момент запроса.
//
// Зачем не файлами при сборке: карточек больше тридцати тысяч. Собирать их заранее — это
// гигабайт в `dist/` и полчаса на каждую выкладку, а цены в готовых файлах устаревают до
// следующей пересборки. Здесь страница берёт данные из базы в момент запроса, поэтому
// заголовок, цена и пробег всегда настоящие, а выкладка сайта не растёт.
//
// Ответ помечен как общий кэш на 10 минут: тридцать тысяч страниц обходит робот, и без
// кэша каждый его заход был бы отдельным запросом к базе.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getCar, listCars } from "./repository.mjs";
import { appShell } from "./dist-files.mjs";
import { createSeoRenderer, carRoute, listingNumber } from "./seo-render.mjs";
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

// Готовая разметка приложения (сборка vite --ssr). Загружаем лениво и один раз:
// модуль тянет всё приложение. Если сборки нет (локальная разработка без
// `npm run build`) или отрисовка упала — карточка отдаётся в прежнем виде, с
// заглушкой и текстом для поисковика: страница хуже на секунды, но живая.
const entryServerPath = fileURLToPath(new URL("../dist/ssr/entry-server.js", import.meta.url));
let entryServerPromise = null;
const loadEntryServer = () => {
  if (!entryServerPromise) {
    entryServerPromise = existsSync(entryServerPath)
      ? import(pathToFileURL(entryServerPath).href).catch((error) => {
          console.error("страницы машин: сборка приложения не загрузилась, отдаём прежний вид", error);
          return null;
        })
      : Promise.resolve(null);
  }
  return entryServerPromise;
};

async function renderCarAppMarkup(route, car, related) {
  const entry = await loadEntryServer();
  if (!entry?.renderCarApp) return null;
  try {
    return entry.renderCarApp(route, { car, related });
  } catch (error) {
    console.error("страницы машин: отрисовка приложения упала, отдаём прежний вид", error);
    return null;
  }
}

async function relatedCars(car) {
  if (!car.brand || !car.model) return [];
  const params = new URLSearchParams({ brand: car.brand, model: car.model, sort: "price_asc", limit: String(relatedLimit + 1) });
  const { items } = await listCars(params);
  return (
    items
      .filter((item) => item.id !== car.id)
      .slice(0, relatedLimit)
      // Лента фотографий в карточке списка показывает пять кадров — остальные адреса
      // (у машины их бывает сорок) только раздували бы страницу: соседи с их данными
      // встраиваются в неё целиком. Поля не трогаем: по ним считается цена.
      .map((item) => ({ ...item, images: (item.images || []).slice(0, 5) }))
  );
}

/**
 * Готовая страница машины: `{ status, html }`.
 * Снятое или несуществующее объявление отдаётся с кодом 404 — иначе поисковик держит
 * в индексе адреса проданных машин, каждый из которых отвечает «страница есть».
 */
export async function renderCarPage(id) {
  // Полный идентификатор объявления («che168-59355862») по-прежнему открывает машину:
  // он остался в старых ссылках, закладках и заказах. Но отвечаем на него переездом на
  // короткий адрес — иначе у одной машины два работающих адреса, а имя источника
  // гуляет по перепискам и отчётам.
  const raw = String(id || "").trim();
  const short = listingNumber(raw);
  if (short && short !== raw) return { status: 301, location: `/cars/${encodeURIComponent(short)}` };
  const shell = await appShell();
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const car = await getCar(String(id || "").trim());
  // Проданная машина здесь равна несуществующей: страница с честной ценой и наличием
  // из неё уже не получится, а 200 держал бы её в индексе поисковика как живую.
  if (!car || car.available === false) return { status: 404, html: renderer.carGonePage() };
  const related = await relatedCars(car);
  // Разметка приложения собирается из сырых записей — тех же, что отдаёт /api/cars:
  // приложение нормализует их само, и браузер при оживлении повторит это с теми же
  // данными (renderHtml встраивает их в страницу). Адрес в метке — тот, по которому
  // страницу запросили (машину открывают и по короткому номеру, и по полному
  // идентификатору): браузер оживляет разметку, только когда метка совпадает с
  // адресной строкой.
  const route = `/cars/${encodeURIComponent(String(id).trim())}`;
  const appRoot = await renderCarAppMarkup(route, car, related);
  const page = renderer.carPage({
    car: { ...car, drive: normalizeDrive(car.drive) },
    related,
    modelPage: modelPageForCar(car),
    sections: landingsForCar(car),
    appRoot,
    appRootPath: route,
    bootData: appRoot ? { carId: car.id, carValue: car, relatedValue: related } : null,
  });
  return { status: 200, html: page.html };
}

// Страница машины для поисковика, собранная в момент запроса.
//
// Зачем не файлами при сборке: карточек больше тридцати тысяч. Собирать их заранее — это
// гигабайт в `dist/` и полчаса на каждую выкладку, а цены в готовых файлах устаревают до
// следующей пересборки. Здесь страница берёт данные из базы в момент запроса, поэтому
// заголовок, цена и пробег всегда настоящие, а выкладка сайта не растёт.
//
// Ответ помечен как общий кэш на 10 минут: тридцать тысяч страниц обходит робот, и без
// кэша каждый его заход был бы отдельным запросом к базе.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getCar, listCars } from "./repository.mjs";
import { createSeoRenderer } from "./seo-render.mjs";
// Обзоры моделей весят больше мегабайта, поэтому этот модуль сам подключается только
// по требованию — из обработчика запросов страницы машины. Обычные запросы к каталогу
// его не загружают, а сборщик функции видит обе зависимости и точно их упакует.
import { modelPageForCar } from "../src/model-pages.js";
import { normalizeDrive } from "../src/drive-types.js";

const siteUrl = String(process.env.SITE_URL || "https://evcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Сколько ссылок на другие машины той же модели ставим внизу страницы. Это единственный
// путь, по которому робот переходит из карточки в карточку: списки в приложении рисует
// скрипт, и в разметке их нет.
const relatedLimit = 12;

// Два файла из сборки, оба с ссылками на стили и скрипты этой выкладки — хеши в их
// именах меняются каждый раз, поэтому подставлять их руками нельзя:
//   app-shell.html — пустая заготовка, в неё вставляется содержимое страницы машины;
//   car.html       — готовая общая страница, ответ на случай, когда база недоступна.
// На своей машине файлы читаются с диска, на хостинге их в функции нет (`dist` туда не
// загружается) — там они берутся по сети с той же выкладки и остаются в памяти.
const distFile = (name) => fileURLToPath(new URL(`../dist/client/${name}`, import.meta.url));
const files = new Map();

// Откуда берём файл по сети. Хост запроса здесь сознательно не используется: он приходит
// из заголовка, то есть его можно подделать — и тогда мы забрали бы «заготовку страницы»
// с чужого сервера и отдали её как свою. Берём только адреса, которые задаёт сам хостинг
// или наши настройки. Боевой домен идёт первым: у него нет защиты доступа, которая на
// адресах отдельных выкладок может отвечать «требуется вход».
const shellHosts = () => [process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, new URL(siteUrl).host].filter(Boolean);

function loadFile(name) {
  if (!files.has(name)) {
    files.set(name, readDistFile(name).catch((error) => {
      // Неудачу не запоминаем: следующий запрос попробует снова, иначе одна сетевая
      // осечка выключила бы серверные страницы до перезапуска функции.
      files.delete(name);
      throw error;
    }));
  }
  return files.get(name);
}

async function readDistFile(name) {
  const local = distFile(name);
  if (existsSync(local)) return readFileSync(local, "utf8");
  const failures = [];
  for (const host of shellHosts()) {
    try {
      // Хостинг настроен на адреса без «.html» и сам перебрасывает с расширения на
      // короткий адрес, поэтому переброс здесь проходим (`fetch` делает это сам).
      const response = await fetch(`https://${host}/${name}`, { redirect: "follow", headers: { "user-agent": "evcars.by-seo-render/1.0" } });
      if (response.ok) return response.text();
      failures.push(`${host}: ${response.status}`);
    } catch (error) {
      failures.push(`${host}: ${error.code || error.message}`);
    }
  }
  throw new Error(`missing_${name} (${failures.join("; ") || "нет известных адресов"})`);
}

/** Готовая общая страница машины — ответ на случай, когда собрать свою не удалось. */
export const carShell = () => loadFile("car.html");

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
  const shell = await loadFile("app-shell.html");
  const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
  const car = await getCar(String(id || "").trim());
  if (!car) return { status: 404, html: renderer.carGonePage() };
  const related = await relatedCars(car);
  const page = renderer.carPage({
    car: { ...car, drive: normalizeDrive(car.drive) },
    related,
    modelPage: modelPageForCar(car),
  });
  return { status: 200, html: page.html };
}

#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { normalizeDrive } from "../src/drive-types.js";
import { MODEL_PAGES, MODELS_INDEX } from "../src/model-pages.js";
import { CATALOG_LANDINGS, catalogPageCount, landingApiParams, landingsForCar } from "../src/catalog-landings.js";
import { TOOL_PAGES, calculatorExamples, customsExample, deliveryStages, toolPageStats } from "../src/tool-pages.js";
// Тексты страниц-инструментов лежат отдельно от «обложек»: браузер берёт их
// отдельным файлом, а сборке нужны целиком — склеиваем запись с её текстами.
import { TOOL_PAGE_TEXTS } from "../src/tool-page-texts.js";
import { EV_QUOTA, evQuotaState } from "../src/ev-quota.js";
// Цена подборки «от такой-то суммы» считается тем же расчётом, что показывает
// карточка машины: иначе в журнале стояла бы одна сумма, а в каталоге другая.
import { estimateLandedCost } from "../src/pricing.js";
// Тексты информационных страниц берём из тех же данных, по которым их рисует
// приложение: в разметке этих девяти страниц было по 32–43 слова — заголовок и одна
// фраза, — а всё остальное появлялось только после запуска сайта в браузере.
import { FAQ_GROUPS, HOME_FAQ, HOME_ORDER_STEPS, PAYMENT_STAGES, RESPONSIBILITY_ITEMS } from "../src/purchase-info.js";
import { DELIVERY_CASES, DELIVERY_STATS } from "../src/delivery-cases.js";
import { LEGAL_COPY } from "../src/legal-copy.js";
import { COMPANY } from "../src/company-data.js";
import { ABOUT_LIMITS, ABOUT_PRINCIPLES, BEFORE_PAYMENT, PURCHASE_STEPS, SERVICE_PROOF, SERVICE_SECTIONS } from "../src/service-copy.js";
// Журнал: подборки. Раздел собирается только при включённом выключателе — пока он
// выключен, у сайта нет ни страниц журнала, ни его адресов в карте сайта.
import { BLOG_ENABLED } from "../src/feature-flags.js";
import { SAMPLE_REPORT, groups, indexChartSvg, percent } from "../src/blog-report.js";
import { BLOG_INDEX, BLOG_TOP_POOL, blogApiParams, blogCarFigure, blogCarReason, blogCatalogHref, blogDuelRows, blogDuelSpecRows, blogHighlight, blogHighlightSort, blogListParams, blogPostSides, blogPostStats, blogPostTags, blogPosts, blogAllPosts, blogRelatedPosts, blogTopCars, blogFreshnessLabel, blogPostDateLabel, blogUpdatedAt } from "../src/blog-posts.js";
import { blogPostWithText } from "../src/blog-texts.js";
// Разметку страниц держит общий модуль: этими же функциями сервер собирает страницу
// машины в момент запроса. Пока разметка жила только здесь, серверная страница
// расходилась бы со статической при каждой правке.
import { carRoute, carTitle, createSeoRenderer, escapeHtml, escapeXml, isoDate, linkifyText, listingNumber, number, photoHref, plural, stripSeoHead, trimRoute } from "../server/seo-render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Пути можно переопределить: тесты прогоняют генератор на трёх машинах в своей
// временной папке, чтобы не зависеть ни от дампа каталога, ни от общей сборки.
const clientDir = process.env.SEO_OUTPUT_DIR ? path.resolve(process.env.SEO_OUTPUT_DIR) : path.join(root, "dist", "client");
// Заготовку читаем из `app-shell.html`, если он уже есть, и только иначе из
// `index.html`. Причина: генератор перезаписывает `index.html` готовой главной
// страницей, поэтому повторный запуск на той же сборке брал бы за заготовку страницу
// с текстом главной — и этот текст попал бы во все остальные страницы.
const appShellPath = path.join(clientDir, "app-shell.html");
const shellPath = existsSync(appShellPath) ? appShellPath : path.join(clientDir, "index.html");
const catalogPath = process.env.SEO_CATALOG ? path.resolve(process.env.SEO_CATALOG) : path.join(root, "public", "data", "cars.json");
const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Карта сайта лежит под неочевидным именем и не упомянута в robots.txt. Причина не в
// поисковиках — им адрес задают вручную в Search Console и Вебмастере, — а в том, что
// `/sitemap.xml` это готовый список всех адресов каталога: конкуренту не нужно обходить
// сайт, чтобы узнать, что у нас есть. Имя должно оставаться одним и тем же между
// сборками, иначе зарегистрированный адрес перестанет открываться; сменить его можно
// через `SEO_SITEMAP_TOKEN` — тогда карту нужно заново добавить в оба сервиса.
const sitemapToken = String(process.env.SEO_SITEMAP_TOKEN || "7c4f19b2").replace(/[^a-z0-9-]/gi, "") || "7c4f19b2";
const sitemapIndexName = `sitemap-${sitemapToken}.xml`;
const pagesSitemapName = `sitemap-${sitemapToken}-pages.xml`;
// Первый файл машин сохраняет привычное имя, следующие получают номер: в одну карту
// по стандарту влезает 50 000 адресов, и при росте каталога её придётся делить.
const carsSitemapName = (index) => (index === 0 ? `sitemap-${sitemapToken}-cars.xml` : `sitemap-${sitemapToken}-cars-${index + 1}.xml`);
const carsPerSitemap = 45_000;
const shell = readFileSync(shellPath, "utf8");
const renderer = createSeoRenderer({ shell, siteUrl, allowIndexing });
const { carLinks, footer, hrefRoute, modelLinks, navigation, pathwayLinks, renderHtml, routeUrl } = renderer;
// Сколько машин показываем на главной. Витрина берёт по одной машине на модель,
// поэтому двадцать ссылок ведут в двадцать разных моделей, а не в двадцать почти
// одинаковых объявлений из последнего импорта.
const showcaseSize = 20;
// Сколько машин перечисляем в подборке журнала: столько же, сколько видит человек.
const blogCarsOnPage = BLOG_TOP_POOL;
// Страницы автомобилей и статический каталог собираются только по явному
// `SEO_VEHICLE_PAGES=1`. По умолчанию их нет: на хостинге карточки собирает сервер
// в момент запроса поверх базы, дампа каталога там вообще не бывает, — то есть
// 30 тысяч файлов давали лишь гигабайт в `dist/` и получасовую сборку.
const vehiclePages = /^(1|true|yes)$/i.test(String(process.env.SEO_VEHICLE_PAGES || "false"));
// Адреса машин в карте сайта нужны, как только открыта индексация: иначе поисковику
// неоткуда узнать про тридцать тысяч карточек — ссылок на них в разметке почти нет.
const carsSitemap = /^(1|true|yes)$/i.test(String(process.env.SEO_CARS_SITEMAP || "")) || allowIndexing;
// Список машин для карты берётся из дампа каталога, а на хостинге дампа нет — там его
// даёт база, но только по явному `SEO_CARS_FROM_DB=1`. Без этого условия сборка ходила бы
// в базу и с рабочей машины: `server/db.mjs` сам подхватывает `.env.local` с боевым
// адресом, то есть обычный локальный прогон и тесты читали бы прод.
const carsFromDatabase = /^(1|true|yes)$/i.test(String(process.env.SEO_CARS_FROM_DB || "false"));
const hasCatalog = existsSync(catalogPath);
if (vehiclePages && !hasCatalog) console.warn(`Каталог ${path.relative(root, catalogPath)} не найден: страницы автомобилей и статический каталог собраны не будут.`);
const catalog = vehiclePages && hasCatalog ? JSON.parse(readFileSync(catalogPath, "utf8")) : {};
const cars = (catalog.cars || catalog.items || []).filter((car) => car && car.id).map((car) => ({ ...car, drive:normalizeDrive(car.drive) }));

// Общей страницы каталога здесь нет: её, как и разделы, отдаёт сервер. Файлами она
// собиралась вхолостую — на хостинге дампа каталога нет, и в странице не оставалось ни
// одной ссылки на машину. Готовый файл вдобавок перекрыл бы правило переадресации, и
// адрес с фильтрами (`/catalog?brand=BYD`) не дошёл бы до переброса на свой раздел.
const publicPages = [
  { route: "/", title: "Автомобили из Китая в Беларусь — abcars.by", description: "Автомобили с пробегом из Китая с проверкой, расчётом стоимости и доставкой в Минск и Беларусь.", h1: "Автомобили с пробегом из Китая с доставкой в Беларусь", lead: "Каталог актуальных объявлений, предварительный расчёт цены до Минска и проверка автомобиля перед оплатой." },
  { route: "/how-it-works/", title: "О сервисе покупки автомобилей из Китая | abcars.by", description: "Проверка объявления и автомобиля, договор, оплата, выкуп, доставка и выдача автомобиля из Китая в Минске.", h1: "О сервисе abcars.by", lead: "Сначала подтверждаем наличие, состояние и полную смету. После согласования заключаем договор, выкупаем автомобиль и доставляем его в Минск." },
  // Страницы `/about` больше нет: у неё был тот же заголовок «О сервисе abcars.by», что
  // у `/how-it-works`, и обе отвечали на один запрос. Её содержательные блоки — наш
  // подход и «чего мы не обещаем» — перенесены вниз `/how-it-works`, а сам адрес
  // перебрасывается туда навсегда (правило в vercel.json).
  { route: "/delivered/", title: "Доставленные автомобили из Китая — примеры и цены | abcars.by", description: "Примеры автомобилей, доставленных из Китая в Беларусь: маршрут, сроки, пробег и итоговая стоимость до Минска.", h1: "Доставленные автомобили из Китая", lead: "Истории доставки с маршрутом, сроками, итоговой стоимостью и решениями, принятыми после проверки автомобиля." },
  { route: "/payment-and-contract/", title: "Оплата и договор при покупке авто из Китая | abcars.by", description: "Этапы оплаты автомобиля из Китая, условия договора, состав стоимости, ответственность сторон и документы.", h1: "Оплата и договор", lead: "До оплаты фиксируем выбранный автомобиль, состав услуг, порядок расчётов и ответственность сторон." },
  { route: "/guarantees/", title: "Гарантии при покупке автомобиля из Китая | abcars.by", description: "Что проверяется и фиксируется при покупке автомобиля из Китая, за что отвечает abcars.by и какие риски обсуждаются до договора.", h1: "Гарантии и ответственность", lead: "Фиксируем проверку, документы, платежи и сопровождение доставки, не подменяя факты обещаниями." },
  { route: "/faq/", title: "Вопросы о покупке и доставке авто из Китая | abcars.by", description: "Ответы о проверке, стоимости, оплате, сроках доставки, таможенном оформлении и покупке автомобиля из Китая в Беларуси.", h1: "Вопросы о покупке автомобиля из Китая", lead: "Короткие ответы о проверке, цене, договоре, оплате, доставке и ответственности." },
  { route: "/contacts/", title: "Контакты abcars.by — автомобили из Китая в Минске", description: "Контакты сервиса abcars.by в Минске. Консультация по выбору, проверке, покупке и доставке автомобиля из Китая.", h1: "Контакты abcars.by", lead: "Обсудим бюджет, подбор, проверку, договор и доставку автомобиля из Китая в Беларусь." },
  { route: "/privacy/", title: "Политика конфиденциальности | abcars.by", description: "Политика обработки и защиты персональных данных пользователей сайта abcars.by.", h1: "Политика конфиденциальности", lead: "Правила получения, использования, хранения и удаления персональных данных." },
  { route: "/terms/", title: "Условия использования сайта | abcars.by", description: "Условия использования каталога abcars.by, предварительных расчётов и информации об автомобилях из Китая.", h1: "Условия использования сайта", lead: "Информация каталога и расчёты являются предварительными; финальные условия фиксируются после проверки и в договоре." },
  // Общая страница «О моделях авто». Сами обзоры файлами не собираются: их отдаёт
  // сервер, потому что в них нужны живые цены и наличие. Готовый файл по такому адресу
  // перекрыл бы правило переадресации, и сервер до отрисовки не дошёл бы.
  { route: `${MODELS_INDEX.path}/`, title: MODELS_INDEX.seoTitle, description: MODELS_INDEX.seoDescription, h1: MODELS_INDEX.h1, lead: MODELS_INDEX.lead, modelsIndex: true },
  // Страницы-инструменты: квота, растаможка, стоимость доставки, калькулятор. Файлами,
  // а не сервером: их содержимое не зависит от каталога, а остаток квоты обновляется
  // ежедневной задачей, которая и так пересобирает сайт.
  ...TOOL_PAGES.map((cover) => {
    const tool = { ...cover, ...TOOL_PAGE_TEXTS[cover.path] };
    return { route: `${tool.path}/`, title: tool.seoTitle, description: tool.seoDescription, h1: tool.h1, lead: tool.lead, tool };
  }),
  // Журнал и его материалы. Файлами, а не сервером: текст подборки не зависит от
  // запроса, а живой список машин под ним подставляется здесь же, из базы, и
  // обновляется вместе с ночной пересборкой сайта.
  ...(BLOG_ENABLED
    ? [
        { route: `${BLOG_INDEX.path}/`, title: BLOG_INDEX.seoTitle, description: BLOG_INDEX.seoDescription, h1: BLOG_INDEX.h1, lead: BLOG_INDEX.lead, blogIndex: true },
        // Черновики (образец отчёта) страницу получают, иначе по прямой ссылке был бы
        // честный 404. Но `indexable: false` закрывает её от поисковиков, а из списка
        // журнала и карты сайта черновик исключён самим `blogPosts()`.
        ...blogAllPosts().map((cover) => {
          const post = blogPostWithText(cover);
          return { route: `${post.path}/`, title: post.seoTitle, description: post.seoDescription, h1: post.h1, lead: post.lead, post, indexable: post.draft ? false : undefined };
        }),
      ]
    : []),
];

const privateRoutes = ["/favorites/", "/searches/", "/login/", "/register/", "/account/", "/analytics/"];

// В боевом HTML CRM не оставляем даже выключенный код Метрики. Проверка адреса в
// общем шаблоне нужна для локальной разработки и перехода без перезагрузки, а
// отдельный готовый файл `/analytics` может и должен быть полностью чистым.
const withoutMetrika = (html) => html
  .replace(/\s*<script\b[^>]*id=["']yandex-metrika["'][^>]*>[\s\S]*?<\/script>/i, "")
  .replace(/\s*<noscript\b[^>]*id=["']yandex-metrika-noscript["'][^>]*>[\s\S]*?<\/noscript>/i, "");

// ── Куда идти дальше с информационной страницы ────────────────────────────────
// Страницы про растаможку, квоту, стоимость доставки, расчёт, гарантии и вопросы —
// самые содержательные на сайте, от 1 100 до 1 800 слов. При этом они были тупиками:
// ни одной ссылки в каталог, только меню и подвал. Человеку после «на электромобиль
// пошлины нет» некуда нажать, а поисковик не переносит вес этих страниц на
// коммерческие разделы. Подборка на каждой странице своя и по теме страницы:
// одинаковый на всех страницах блок поисковик обесценивает. На страницах-расчётах
// ссылок на соседние расчёты здесь нет: их уже даёт блок «Другие расчёты» в самом
// тексте страницы, и второй раз теми же словами — это повтор, а не путь.
const PATHWAYS = {
  "/how-it-works/": {
    heading: "С чего начать выбор",
    intro: "Порядок покупки одинаковый для любой машины, а вот пошлина, сроки и итоговая сумма зависят от того, что вы выбрали.",
    links: ["electric", "hybrid", "petrol", "suv", "sedan", "/calculator", "/catalog"],
  },
  "/faq/": {
    heading: "Ответы, которые видно в каталоге",
    intro: "Большинство вопросов упирается в конкретную машину: её возраст, тип двигателя и цену. В этих разделах ответ виден цифрами.",
    links: ["electric", "hybrid", "petrol", "under-20000", "petrol-under-30000", "byd", "volkswagen", "/catalog"],
  },
  "/payment-and-contract/": {
    heading: "Сколько это выходит в деньгах",
    intro: "Порядок расчётов от машины не зависит, а сумма зависит. Подборки собраны по итоговой цене до Минска — со всеми платежами.",
    links: ["under-15000", "under-20000", "under-30000", "petrol-under-25000", "petrol-under-30000", "petrol-under-40000", "/calculator", "/delivery-cost"],
  },
  "/guarantees/": {
    heading: "Что именно мы проверяем",
    intro: "Проверка одна для всех машин, но смотреть приходится на разное: в электромобиле — батарея и её остаточная ёмкость, в гибриде — обе системы сразу, в бензиновой машине — двигатель, коробка и история обслуживания.",
    links: ["electric", "hybrid", "petrol", "electric-suv", "petrol-suv", "/models", "/catalog"],
  },
  "/delivered/": {
    heading: "Где выбрать такую же",
    intro: "Доставленные автомобили — это те же объявления из каталога, только уже приехавшие. Вот откуда их выбирают.",
    links: ["suv", "sedan", "electric", "hybrid", "petrol", "/catalog"],
  },
  "/contacts/": {
    heading: "Пока мы отвечаем — посмотрите каталог",
    intro: "Разговор выходит предметнее, когда есть две-три машины на примете.",
    links: ["electric", "hybrid", "petrol", "byd", "tesla", "volkswagen", "mercedes-benz", "/catalog"],
  },
  "/customs/": {
    heading: "Растаможка по типам машин",
    intro: "Сумма зависит от того, что у машины под капотом и сколько ей лет: электромобиль, гибрид и бензиновая машина считаются по разным правилам. Каталог уже разделён по этому признаку.",
    links: ["electric", "hybrid", "petrol", "petrol-suv", "petrol-sedan", "under-30000", "/catalog"],
  },
  "/ev-quota/": {
    heading: "Что можно ввезти по квоте",
    intro: "Льгота действует только на электромобили. Вот они — с ценами уже до Минска. Рядом — бензиновые машины: на них квота не влияла никогда, и от её остатка их цена не зависит.",
    links: ["electric", "electric-suv", "electric-sedan", "under-20000", "petrol", "petrol-under-30000", "/catalog"],
  },
  "/delivery-cost/": {
    heading: "Машины, для которых считаем доставку",
    intro: "Сама доставка почти не зависит от машины, а итоговая сумма — зависит. Подборки собраны по конечной цене.",
    links: ["under-15000", "under-20000", "under-25000", "under-40000", "petrol-under-25000", "petrol-under-40000", "/catalog"],
  },
  "/calculator/": {
    heading: "Посчитать на конкретной машине",
    intro: "Расчёт получается точнее, когда есть объявление: год, тип двигателя, объём мотора и цену продавца берём из него.",
    links: ["electric", "hybrid", "petrol", "under-30000", "petrol-under-30000", "byd", "/customs", "/catalog"],
  },
};

const landingBySlug = new Map(CATALOG_LANDINGS.map((landing) => [landing.slug, landing]));
// Текст ссылки. «BYD» само по себе поисковику почти ничего не говорит, а заголовок
// раздела целиком — «Автомобили BYD из Китая с доставкой в Беларусь» — в списке из
// восьми строк читается тяжело.
const landingAnchor = (landing) =>
  landing.kind === "brand" ? `Автомобили ${landing.name} из Китая` : landing.kind === "price" ? landing.name : `${landing.name} из Китая`;

/** Блок ссылок в каталог для одной информационной страницы или расчёта. */
function pathwayFor(route) {
  const plan = PATHWAYS[route];
  if (!plan) return "";
  const links = plan.links
    .map((item) => {
      if (item === "/catalog") return ["/catalog/", "Весь каталог автомобилей из Китая", null];
      if (item === "/models") return [`${MODELS_INDEX.path}/`, "Обзоры моделей", "Что за машина, чем отличаются версии и на что смотреть при выборе"];
      const tool = TOOL_PAGES.find((page) => page.path === item);
      if (tool) return [`${tool.path}/`, tool.name, tool.lead];
      const landing = landingBySlug.get(item);
      return landing ? [`${landing.path}/`, landingAnchor(landing), null] : null;
    })
    .filter(Boolean);
  return renderer.pathwayLinks({ heading: plan.heading, intro: plan.intro, links });
}

// Текст информационной страницы из тех же данных, что показывает приложение. Ничего
// нового здесь не пишется: это ровно то, что видит человек.
// Текст страницы-инструмента. Цифры берутся из тех же данных, что и расчёт в карточке,
// поэтому страница не расходится с каталогом. Вложенные блоки разделов — списки, врезки
// и карточки сравнения — здесь тоже текст: иначе поисковик увидел бы меньше, чем человек.
function toolArticle(tool) {
  const paragraphs = (items) => items.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
  const extras = (section) =>
    [
      section.list ? `<dl>${section.list.map((item) => `<dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.text)}</dd>`).join("")}</dl>` : "",
      section.compare ? section.compare.map((option) => `<p><strong>${escapeHtml(option.name)}.</strong> ${escapeHtml(option.text)}</p>`).join("") : "",
      section.callout ? `<p><strong>${escapeHtml(section.callout.title)}.</strong> ${escapeHtml(section.callout.text)}</p>` : "",
    ].join("");
  const sections = tool.sections
    .map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${paragraphs(section.paragraphs)}${extras(section)}</section>`)
    .join("");
  // Полоса главных цифр: у человека это плитки под вступлением, здесь — строки списка.
  const stats = toolPageStats(tool.kind);
  const numbers = stats.length
    ? `<ul>${stats.map((stat) => `<li><strong>${escapeHtml(stat.value)}</strong> — ${escapeHtml(stat.label)}</li>`).join("")}</ul>`
    : "";
  // Таблица собирается из тех же функций, что и в приложении: одна цифра — одно место.
  const table = (data) =>
    `<section><h2>${escapeHtml(data.title)}</h2><table><thead><tr>${data.columns
      .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
      .join("")}</tr></thead><tbody>${data.rows
      .map((row) => `<tr>${row.map((cell, index) => (index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join("")}</tr>`)
      .join("")}</tbody></table><p>${escapeHtml(data.note)}</p></section>`;
  let live = "";
  if (tool.kind === "quota") {
    const state = evQuotaState();
    const rows = [...EV_QUOTA.reports].reverse().slice(0, 12);
    // Живая часть страницы: остаток, темп и история сводок. Это то, за чем сюда придут.
    live = `<section><h2>Сколько квоты на электромобили осталось сейчас</h2><p><strong>Гражданам доступно ещё ${number(state.remaining)} ${plural(state.remaining, "электромобиль", "электромобиля", "электромобилей")}</strong> из ${number(state.total)} по квоте ${EV_QUOTA.year} года — по сводке на ${escapeHtml(state.asOfLabel)}.</p>${
      state.perWeek ? `<p>Темп расхода — около ${number(state.perWeek)} машин в неделю.${state.runsOutLabel && !state.overdue ? ` При таком темпе квота заканчивается около ${escapeHtml(state.runsOutLabel)}.` : ""}</p>` : ""
    }<p>Квота для торгового оборота (юридические лица) объёмом ${number(EV_QUOTA.businessTotal)} машин выбрана полностью.</p></section><section><h2>Остаток по месяцам</h2><dl>${state.periods
      .map((period) => `<dt>${escapeHtml(period.label)}</dt><dd>${period.left == null ? "нет данных" : number(period.left)}</dd>`)
      .join("")}</dl></section><section><h2>История сводок таможни</h2><table><thead><tr><th scope="col">Дата сводки</th><th scope="col">Осталось у граждан</th><th scope="col">Осталось у юрлиц</th></tr></thead><tbody>${rows
      .map(([date, personal, business]) => `<tr><th scope="row">${escapeHtml(date)}</th><td>${personal === null ? "не названо" : number(personal)}</td><td>${business === null ? "не названо" : number(business)}</td></tr>`)
      .join("")}</tbody></table><p>Источник — недельные сводки Государственного таможенного комитета. Квота ${EV_QUOTA.year} года действует с ${escapeHtml(EV_QUOTA.startedOn)}.</p></section>`;
  }
  if (tool.kind === "customs") live = table(customsExample());
  if (tool.kind === "cost") live = table(deliveryStages());
  // У калькулятора живая часть — форма, а её рисует скрипт. Поисковику вместо неё
  // отдаём готовые расчёты той же механикой: иначе страница расчёта приходит в поиск
  // без единой посчитанной суммы.
  if (tool.kind === "calculator") live = table(calculatorExamples());
  // Частые вопросы: в странице это обычный текст, разметку FAQPage добавляем отдельно.
  const faq = tool.faq?.length
    ? `<section><h2>Частые вопросы</h2>${tool.faq.map((item) => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`).join("")}</section>`
    : "";
  // Переходы к остальным расчётам: у человека это карточки-ссылки в конце страницы.
  const others = TOOL_PAGES.filter((page) => page.path !== tool.path);
  const links = `<section><h2>Другие расчёты</h2><ul>${others
    .map((page) => `<li><a href="${hrefRoute(`${page.path}/`)}">${escapeHtml(page.name)}</a> — ${escapeHtml(page.lead)}</li>`)
    .join("")}</ul></section>`;
  return `${paragraphs(tool.intro)}${numbers}${live}${sections}${faq}${links}<p>${escapeHtml(tool.disclaimer)}</p>`;
}

function infoArticle(route) {
  const list = (items) => `<dl>${items.map(([term, text]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(text)}</dd>`).join("")}</dl>`;
  if (route === "/") {
    // Главная — самая массовая страница по запросам и была самой пустой: 44 слова.
    return `<section><h2>Как проходит покупка</h2>${HOME_ORDER_STEPS.map(
      (step) => `<h3>${escapeHtml(step.number)}. ${escapeHtml(step.title)}</h3><p>${escapeHtml(step.description)}</p>`,
    ).join("")}</section><section><h2>Частые вопросы</h2>${HOME_FAQ.map(
      (item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`,
    ).join("")}<p><a href="${hrefRoute("/faq/")}">Все вопросы и ответы</a></p></section>`;
  }
  if (route === "/faq/") {
    return FAQ_GROUPS.map(
      (group) => `<section><h2>${escapeHtml(group.title)}</h2>${group.items.map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`).join("")}</section>`,
    ).join("");
  }
  if (route === "/payment-and-contract/") {
    return `<section><h2>Этапы оплаты</h2>${PAYMENT_STAGES.map(
      (stage) => `<h3>${escapeHtml(stage.title)}</h3><p>${escapeHtml(stage.description)}</p><p><strong>Платёж:</strong> ${escapeHtml(stage.payment)}. <strong>Когда:</strong> ${escapeHtml(stage.timing)}.</p>`,
    ).join("")}</section>`;
  }
  if (route === "/guarantees/") {
    return `<section><h2>Кто за что отвечает</h2>${list(RESPONSIBILITY_ITEMS.map((item) => [`${item.title} — ${item.owner}`, item.result]))}</section>`;
  }
  if (route === "/delivered/") {
    // Имена и отзывы клиентов в разметку не выносим: в данных они помечены как
    // демонстрационные, а тащить непроверенные отзывы в поисковую выдачу нельзя.
    return `<section><h2>Коротко о доставках</h2>${list(DELIVERY_STATS.map((stat) => [stat.value, stat.label]))}</section><section><h2>Примеры доставленных автомобилей</h2>${DELIVERY_CASES.map(
      (item) => `<h3>${escapeHtml(item.vehicle)}</h3><p>${escapeHtml(item.summary)}</p><p><strong>Маршрут:</strong> ${escapeHtml(item.route)}. <strong>Срок:</strong> ${escapeHtml(item.duration)} дней. <strong>Пробег:</strong> ${escapeHtml(item.mileage)}. <strong>Итого:</strong> ${escapeHtml(item.total)}. <strong>Доставлен:</strong> ${escapeHtml(item.delivered)}.</p>`,
    ).join("")}</section>`;
  }
  if (route === "/contacts/") {
    const rows = [
      ["Компания", COMPANY.legalName],
      ["Адрес", COMPANY.address],
      ["Время работы", COMPANY.hours],
      ["Электронная почта", COMPANY.email],
      ["Telegram", COMPANY.telegram],
    ].filter(([, value]) => value);
    return `<section><h2>Как с нами связаться</h2>${list(rows)}<p>Расскажем про подбор, проверку автомобиля в Китае, договор, доставку и оформление в Минске. Ответим и без обязательства оформлять заказ.</p></section>`;
  }
  if (route === "/how-it-works/") {
    return `<section><h2>Что мы обещаем</h2>${list(SERVICE_PROOF.map((item) => [item.title, item.text]))}</section><section><h2>${escapeHtml(SERVICE_SECTIONS[0].title)}</h2><p>${escapeHtml(SERVICE_SECTIONS[0].text)}</p>${PURCHASE_STEPS.map(
      (step, index) => `<h3>${index + 1}. ${escapeHtml(step.title)}</h3><p>${escapeHtml(step.text)}</p>`,
    ).join("")}</section><section><h2>${escapeHtml(SERVICE_SECTIONS[1].title)}</h2><p>${escapeHtml(SERVICE_SECTIONS[1].text)}</p><p>До оплаты автомобиля вы получите:</p><ul>${BEFORE_PAYMENT.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section><h2>Прозрачность на каждом шаге</h2>${list(ABOUT_PRINCIPLES.map((item) => [item.title, item.text]))}</section><section><h2>Чего мы не обещаем</h2>${list(ABOUT_LIMITS.map((item) => [item.title, item.text]))}</section>`;
  }
  const legal = route === "/privacy/" ? LEGAL_COPY.privacy : route === "/terms/" ? LEGAL_COPY.terms : null;
  if (legal) {
    return `<p>${escapeHtml(legal.intro)}</p>${legal.sections.map(([title, text]) => `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`).join("")}<p>Редакция от 15 августа 2026 года.</p>`;
  }
  return "";
}

// ── Журнал ────────────────────────────────────────────────────────────────────
// Разметка подборки повторяет то, что видит человек: вступление, полоса цифр из
// каталога, разделы статьи с их вложенными блоками, вопросы и живой список машин.
// Ничего «только для поисковика» здесь не пишется.
/**
 * Фотография внутри статьи — та же, что видит человек: настоящая машина подборки
 * с подписью и ссылкой в объявление. Поисковик получает снимок с осмысленным
 * описанием, а не «картинку из статьи».
 */
function blogFigure(car, index) {
  const gallery = car.images?.length ? car.images : [car.image].filter(Boolean);
  const source = gallery[Math.min(index, gallery.length - 1)] || null;
  if (!source) return "";
  const title = carTitle(car);
  const landed = estimateLandedCost(car).totalUsd;
  const facts = `${car.mileage ? `${number(car.mileage)} км · ` : ""}≈ ${number(landed)} $ под ключ в Минске`;
  // Ширины те же, что в приложении: 800 точек показа и вдвое крупнее для экранов
  // с двойной плотностью (см. IMAGE_WIDTH_ARTICLE в src/App.jsx).
  const srcset = `${photoHref(source, 800)} 1x, ${photoHref(source, 1400)} 2x`;
  return `<figure><a href="${escapeHtml(hrefRoute(carRoute(car)))}"><img src="${escapeHtml(photoHref(source, 800))}" srcset="${escapeHtml(srcset)}" alt="${escapeHtml(`${title} — автомобиль из Китая в наличии`)}" loading="lazy" /></a><figcaption><a href="${escapeHtml(hrefRoute(carRoute(car)))}">${escapeHtml(title)}</a> — ${escapeHtml(facts)}</figcaption></figure>`;
}

function blogArticleBody(text, cars = [], shown = new Set()) {
  const paragraphs = (items) => (items || []).map((value) => `<p>${linkifyText(value, hrefRoute)}</p>`).join("");
  const extras = (section) =>
    [
      // Подразделы: маленький заголовок и абзацы под ним — разбивка длинного раздела.
      section.parts ? section.parts.map((part) => `<h3>${escapeHtml(part.title)}</h3>${paragraphs(part.paragraphs)}`).join("") : "",
      section.list ? `<dl>${section.list.map((item) => `<dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.text)}</dd>`).join("")}</dl>` : "",
      section.compare ? section.compare.map((option) => `<p><strong>${escapeHtml(option.name)}.</strong> ${escapeHtml(option.text)}</p>`).join("") : "",
      section.callout ? `<p><strong>${escapeHtml(section.callout.title)}.</strong> ${escapeHtml(section.callout.text)}</p>` : "",
    ].join("");
  const sections = text.sections || [];
  const withoutCover = cars.filter((item) => !shown.has(item.id));
  return sections
    .map((section, index) => {
      // Между разделами — фотография машины из этой же подборки; после последнего
      // раздела снимка нет, дальше идут вопросы и список машин.
      // Машину с обложки в тексте не повторяем.
      const car = index < sections.length - 1 ? withoutCover[index] : null;
      return `<section><h2>${escapeHtml(section.title)}</h2>${paragraphs(section.paragraphs)}${extras(section)}</section>${car ? blogFigure(car, index) : ""}`;
    })
    .join("");
}

/**
 * Сравнение двух моделей для поисковика. Всё то же, что видит человек, только версткой
 * попроще: два снимка, таблица различий из каталога, разборы текстом и списки машин
 * каждой модели. Таблица — обычная <table>, поэтому её содержимое читается и без стилей.
 */
function blogDuelArticle(post) {
  const found = live.collections.get(post.slug) || null;
  const sides = found?.duel || [];
  const published = blogPostDateLabel(post);
  const rubric = `<a href="${hrefRoute(`${BLOG_INDEX.path}/`)}">${escapeHtml(blogPostTags(post)[0]?.name || BLOG_INDEX.name)}</a>`;
  const date = `<p>${rubric}${published ? ` · ${escapeHtml(published)}` : ""}</p>`;
  const intro = (post.intro || []).map((value) => `<p>${linkifyText(value, hrefRoute)}</p>`).join("");
  // Шапка: по кадру на модель. Без снимков блока нет — заголовок над пустотой
  // поисковик читает как сломанную страницу.
  const hero = sides.some((entry) => entry.hero)
    ? sides.map((entry) => (entry.hero ? blogFigure(entry.hero, 0) : "")).join("")
    : "";
  const rows = blogDuelRows(sides);
  // Вторая половина таблицы — паспорт модели: она написана в самом материале и от
  // каталога не зависит, поэтому под таблицей стоит оговорка, откуда какие цифры.
  const specs = blogDuelSpecRows(sides);
  const cell = (value) => (value ? (value.money != null ? `≈ ${number(value.money)} $` : value.text) : "—");
  // Наличие ведёт в каталог по этой модели — то же, что видит человек.
  const line = (row) =>
    `<tr><th>${escapeHtml(row.label)}</th>${row.values
      .map((value, index) => {
        const text = escapeHtml(cell(value));
        const side = sides[index]?.side;
        const target = row.key === "total" && value && side ? hrefRoute(blogCatalogHref({ filters: side.filters })) : null;
        return `<td>${target ? `<a href="${escapeHtml(target)}" target="_blank" rel="noreferrer">${text}</a>` : text}</td>`;
      })
      .join("")}</tr>`;
  const lines = [...rows, ...specs];
  const table = lines.length
    ? `<section><table><thead><tr><th><h2>В цифрах</h2></th>${sides
        .map((entry) => `<th><a href="${escapeHtml(hrefRoute(entry.side.review))}" target="_blank" rel="noreferrer">${escapeHtml(entry.side.name)}</a></th>`)
        .join("")}</tr></thead><tbody>${lines.map(line).join("")}</tbody></table>` +
      `<p>Наличие, цена и характеристики версий считаются из каталога: цена — самая доступная машина под ключ в Минске, остальное — лучшее, что есть сейчас. Габариты, багажник и гарантия — паспортные данные производителей.</p></section>`
    : "";
  // Списки машин каждой модели: то же, что в приложении, — снимок, название, цена
  // под ключ, год и пробег.
  const heroes = new Set(sides.map((entry) => entry.hero?.id).filter(Boolean));
  const offers = sides
    .map((entry) => {
      const cars = entry.cars.slice(0, 5);
      if (!cars.length) return "";
      const items = cars
        .map((car) => {
          const href = escapeHtml(hrefRoute(carRoute(car)));
          const title = escapeHtml(carTitle(car));
          const source = car.images?.length ? car.images[0] : car.image;
          const photo = source ? `<img src="${escapeHtml(photoHref(source, 400))}" alt="${title}" loading="lazy" />` : "";
          const facts = [`≈ ${number(estimateLandedCost(car).totalUsd)} $ под ключ в Минске`, car.year ? `${car.year} год` : null, car.mileage ? `пробег ${number(car.mileage)} км` : null].filter(Boolean);
          return `<li><a href="${href}">${photo}${title}</a> — ${escapeHtml(facts.join(", "))}</li>`;
        })
        .join("");
      const catalog = escapeHtml(hrefRoute(blogCatalogHref({ filters: entry.side.filters })));
      return `<section><h2>${escapeHtml(entry.side.name)} в наличии</h2><ul>${items}</ul><p><a href="${catalog}">Смотреть все ${escapeHtml(entry.side.name)} в каталоге</a></p></section>`;
    })
    .join("");
  const faq = post.faq?.length
    ? `<section><h2>Частые вопросы</h2>${post.faq.map((item) => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`).join("")}</section>`
    : "";
  const related = blogRelatedPosts(post);
  const rest = related.length
    ? `<section><h2>Похожие статьи</h2><ul>${related.map((item) => `<li><a href="${hrefRoute(`${item.path}/`)}">${escapeHtml(item.name)}</a> — ${escapeHtml(item.teaser || item.lead)}</li>`).join("")}</ul></section>`
    : "";
  // Снимки между разделами — машины обеих моделей по очереди, кроме тех, что уже
  // стоят в шапке.
  const photoCars = [];
  for (let index = 0; index < 4; index += 1) {
    for (const entry of sides) {
      const car = entry.cars.filter((item) => !heroes.has(item.id))[index];
      if (car) photoCars.push(car);
    }
  }
  return `${date}${hero}${intro}${table}${blogArticleBody(post, photoCars)}${offers}${faq}${blogCatalogWays(post)}${blogModelWays(post)}${rest}${post.disclaimer ? `<p>${escapeHtml(post.disclaimer)}</p>` : ""}`;
}

// ── Куда журнал ведёт дальше ──────────────────────────────────────────────────
// Материал журнала был почти тупиком: из него вели ссылки на страницы расчётов, на
// сами машины и на каталог с набором параметров. Последний адрес поисковик склеивает
// с общим каталогом, то есть вес статьи не доходил ни до одного раздела. Разделы и
// обзоры моделей считаем по самому списку машин — руками их писать нельзя: состав
// подборки меняется каждую ночь, а записанный раздел через неделю будет не про то.

/** Машины материала: у подборки её список, у сравнения — обе стороны. */
const blogCarsFound = (post) => live.collections.get(post.slug)?.cars || [];

/**
 * Разделы каталога, в которые попадают машины материала, — по убыванию того, сколько
 * машин списка в них входит. Ценовые полосы сюда не попадают: их отбирает сам
 * справочник разделов.
 */
function blogCatalogWays(post) {
  const cars = blogCarsFound(post);
  if (!cars.length) return "";
  const counted = new Map();
  for (const car of cars) {
    for (const landing of landingsForCar({ brand: car.brand, type: car.type, bodyType: car.bodyType })) {
      const seen = counted.get(landing.path) || { landing, count: 0 };
      seen.count += 1;
      counted.set(landing.path, seen);
    }
  }
  // Раздел, в который попала одна машина из десяти, к теме материала отношения не
  // имеет: берём те, что покрывают хотя бы пятую часть списка.
  const threshold = Math.max(2, Math.ceil(cars.length / 5));
  const links = [...counted.values()]
    .filter((entry) => entry.count >= threshold && live.stock.get(entry.landing.path) !== 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((entry) => [entry.landing.path, entry.landing.name, null]);
  if (!links.length) return "";
  return pathwayLinks({
    heading: "Разделы каталога по теме",
    intro: "Живые списки с ценами до Минска — в каждом разделе свой отбор и свои фильтры.",
    links,
  });
}

/**
 * Обзоры моделей, о которых материал. У сравнения это две названные модели, у
 * подборки — те модели из списка машин, на которые обзор уже написан.
 */
function blogModelWays(post) {
  const wanted = new Map();
  for (const side of blogPostSides(post)) {
    const review = MODEL_PAGES.find((page) => page.brand === side.brand && page.model === side.model);
    if (review) wanted.set(review.path, review);
  }
  for (const car of blogCarsFound(post)) {
    if (wanted.size >= 8) break;
    const review = MODEL_PAGES.find((page) => page.brand === car.brand && page.model === car.model);
    if (review) wanted.set(review.path, review);
  }
  return modelLinks([...wanted.values()].slice(0, 8), { heading: "Обзоры моделей из этого материала" });
}

/**
 * Отчёт по рынку для поисковика. Тот же порядок блоков, что видит человек, и тот же
 * график: разметку графика рисует общий код (`indexChartSvg`), поэтому версии не
 * разойдутся. Пока это образец с условными цифрами, страница закрыта от индексации,
 * но собирается полностью — по ней и видно, как отчёт будет выглядеть.
 */
function blogReportArticle(post) {
  const report = SAMPLE_REPORT;
  const published = blogPostDateLabel(post);
  const rubric = `<a href="${hrefRoute(`${BLOG_INDEX.path}/`)}">${escapeHtml(blogPostTags(post)[0]?.name || BLOG_INDEX.name)}</a>`;
  const date = `<p>${rubric}${published ? ` · ${escapeHtml(published)}` : ""}</p>`;
  const note = report.sample
    ? `<p><strong>Образец. Цифры в этом отчёте условные — он показывает, как материал выглядит. Настоящий отчёт выйдет, когда накопятся недельные срезы цен.</strong></p>`
    : "";
  const intro = (post.intro || []).map((value) => `<p>${linkifyText(value, hrefRoute)}</p>`).join("");
  const modelHref = (row) => hrefRoute(blogCatalogHref({ filters: { brand: row.brand, model: row.model } }));
  const movers = (rows) =>
    `<ul>${rows
      .map((row) => `<li><a href="${escapeHtml(modelHref(row))}">${escapeHtml(`${row.brand} ${row.model}${row.year ? ` ${row.year}` : ""}`)}</a> — ${escapeHtml(`${groups(row.nowUsd)} $ под ключ, ${percent(row.changePct)} за неделю, ${groups(row.listings)} в наличии`)}</li>`)
      .join("")}</ul>`;
  const headline = `<p><strong>${escapeHtml(percent(report.index.changePct))}</strong> — цена под ключ по постоянной корзине из ${escapeHtml(groups(report.index.baskets))} наборов «модель и год» за неделю ${escapeHtml(report.weekLabel)}.</p>`;
  const chart = indexChartSvg(report.index.points);
  const facts = `<ul>
    <li><strong>${escapeHtml(groups(report.quota.left))}</strong> — осталось от квоты на беспошлинный ввоз электромобилей</li>
    <li><strong>${escapeHtml(String(report.quota.weeksLeft))} нед.</strong> — при нынешнем темпе ${escapeHtml(groups(report.quota.perWeek))} машин в неделю</li>
    <li><strong>${escapeHtml(groups(report.stock.total))}</strong> — машин в каталоге, из них ${escapeHtml(groups(report.stock.week))} появились за неделю</li>
    <li><strong>${escapeHtml(String(report.rate.usdByn).replace(".", ","))}</strong> — курс доллара НБРБ на ${escapeHtml(report.rate.dateLabel)}, ${escapeHtml(percent(report.rate.changePct))} за неделю</li>
  </ul>`;
  const newcomers = `<ul>${report.newcomers
    .map((row) => `<li><a href="${escapeHtml(modelHref(row))}">${escapeHtml(`${row.brand} ${row.model}`)}</a> — от ${escapeHtml(groups(row.fromUsd))} $, ${escapeHtml(groups(row.listings))} в наличии</li>`)
    .join("")}</ul>`;
  const faq = post.faq?.length
    ? `<section><h2>Частые вопросы</h2>${post.faq.map((item) => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`).join("")}</section>`
    : "";
  return `${date}${note}${intro}
    <section><h2>Индекс цены под ключ</h2>${headline}${chart}<p>За сто принят уровень первой недели наблюдений. В корзине ${escapeHtml(groups(report.index.listings))} объявлений.</p></section>
    <section><h2>Подешевело за неделю</h2>${movers(report.cheaper)}</section>
    <section><h2>Подорожало за неделю</h2>${movers(report.dearer)}</section>
    <section><h2>Квота, наличие и курс</h2>${facts}</section>
    <section><h2>Впервые в каталоге</h2>${newcomers}</section>
    ${blogArticleBody(post, [], new Set())}${faq}${blogCatalogWays(post)}${post.disclaimer ? `<p>${escapeHtml(post.disclaimer)}</p>` : ""}`;
}

function blogPostArticle(post) {
  if (post.kind === "report") return blogReportArticle(post);
  if (post.kind === "duel") return blogDuelArticle(post);
  const found = live.collections.get(post.slug) || null;
  const stats = blogPostStats({ total: found?.total || null, priceFromUsd: found?.priceFromUsd || null, highlight: found?.highlight || null });
  const numbers = stats.length ? `<ul>${stats.map((stat) => `<li><strong>${escapeHtml(stat.value)}</strong> — ${escapeHtml(stat.label)}</li>`).join("")}</ul>` : "";
  // Строка над текстом — та же, что видит человек: раздел и день выпуска материала
  // через точку. Свежесть наличия и цен — отдельная подпись над списком машин.
  const published = blogPostDateLabel(post);
  // Раздел ссылкой в журнал: из статьи ведёт путь к списку материалов.
  const rubric = `<a href="${hrefRoute(`${BLOG_INDEX.path}/`)}">${escapeHtml(blogPostTags(post)[0]?.name || BLOG_INDEX.name)}</a>`;
  const date = `<p>${rubric}${published ? ` · ${escapeHtml(published)}` : ""}</p>`;
  const intro = (post.intro || []).map((value) => `<p>${linkifyText(value, hrefRoute)}</p>`).join("");
  // Открывающая фотография — сразу после описания, до текста.
  const cover = found?.cover ? blogFigure(found.cover, 0) : "";
  // Живой список машин — то же, что видит человек: номер, снимок, цена под ключ и
  // четыре характеристики. Когда база при сборке недоступна, блока просто нет:
  // заголовок над пустым списком поисковик читает как сломанную страницу.
  const top = blogTopCars(found?.cars || [], post);
  // Подпись со свежестью — та же, что видит человек и что стоит в разделах каталога:
  // последнее настоящее изменение среди машин набора. Дату «сегодня» на этом месте
  // ставить нельзя: это было бы обещание свежести, которое не проверить.
  const freshness = blogFreshnessLabel(found?.changedAt);
  const offers = top.length
    ? `<section><h2>${escapeHtml(post.name)}</h2>${freshness ? `<p class="seo-updated">Наличие и цены обновлены ${escapeHtml(freshness)}.</p>` : ""}<ol>${top
        .map((car) => {
          const href = escapeHtml(hrefRoute(carRoute(car)));
          const title = escapeHtml(carTitle(car));
          const source = car.images?.length ? car.images[0] : car.image;
          const photo = source ? `<img src="${escapeHtml(photoHref(source, 400))}" alt="${title}" loading="lazy" />` : "";
          // То же, что видит человек: главная цифра подборки, цена и причина.
          const figure = blogCarFigure(car, post);
          const reason = blogCarReason(car, top, post, (item) => (item ? estimateLandedCost(item).totalUsd : null));
          const parts = [
            figure ? `${figure.value} ${figure.label}` : null,
            `≈ ${number(estimateLandedCost(car).totalUsd)} $ под ключ в Минске`,
            reason,
          ].filter(Boolean);
          return `<li><a href="${href}">${photo}${title}</a> — ${escapeHtml(parts.join(". "))}</li>`;
        })
        .join("")}</ol><p><a href="${escapeHtml(hrefRoute(blogCatalogHref(post)))}">Смотреть все в каталоге</a></p></section>`
    : "";
  const faq = post.faq?.length
    ? `<section><h2>Частые вопросы</h2>${post.faq.map((item) => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`).join("")}</section>`
    : "";
  const related = blogRelatedPosts(post);
  const rest = related.length
    ? `<section><h2>Похожие статьи</h2><ul>${related.map((item) => `<li><a href="${hrefRoute(`${item.path}/`)}">${escapeHtml(item.name)}</a> — ${escapeHtml(item.teaser || item.lead)}</li>`).join("")}</ul></section>`
    : "";
  return `${date}${cover}${intro}${numbers}${offers}${blogArticleBody(post, found?.cars || [], new Set([found?.cover?.id, ...top.map((car) => car.id)]))}${faq}${blogCatalogWays(post)}${blogModelWays(post)}${rest}${post.disclaimer ? `<p>${escapeHtml(post.disclaimer)}</p>` : ""}`;
}

function blogIndexArticle() {
  // Список материалов: то же, что человек видит на карточках — метки, название,
  // о чём материал и дата последнего обновления.
  const items = blogPosts()
    .map((post) => {
      const tags = blogPostTags(post).map((tag) => tag.name).join(", ");
      const date = blogPostDateLabel(post);
      const meta = [tags, date].filter(Boolean).join(". ");
      return `<li><a href="${hrefRoute(`${post.path}/`)}">${escapeHtml(post.name)}</a> — ${escapeHtml(post.lead)}${meta ? ` (${escapeHtml(meta)})` : ""}</li>`;
    })
    .join("");
  return `<section><h2>${escapeHtml(BLOG_INDEX.listTitle)}</h2><ul>${items}</ul></section>`;
}

function modelsIndexArticle() {
  const intro = MODELS_INDEX.sections
    .map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${section.paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</section>`)
    .join("");
  const list = MODEL_PAGES.map(
    (modelPage) =>
      `<li><a href="${hrefRoute(`${modelPage.path}/`)}">${escapeHtml(modelPage.name)}</a> — ${escapeHtml(modelPage.teaser)}</li>`,
  ).join("");
  return `${intro}<section><h2>${escapeHtml(MODELS_INDEX.listTitle)}</h2><ul>${list}</ul></section>`;
}

/**
 * Обзоры моделей на главной. Раньше с главной не вело ни одной ссылки на обзор, хотя
 * это самые содержательные страницы сайта — от 665 до 993 слов, с ценами и наличием.
 * Порядок — по числу машин в каталоге: если база при сборке недоступна, счётчиков нет
 * и берём как есть, ссылки важнее сортировки.
 */
function popularModelLinks(limit = 24) {
  const counted = MODEL_PAGES.map((modelPage) => ({ modelPage, count: live.models.get(`${modelPage.brand}|${modelPage.model}`) || 0 }));
  const ordered = counted.some((item) => item.count) ? counted.filter((item) => item.count).sort((a, b) => b.count - a.count) : counted;
  const links = ordered.slice(0, limit).map(({ modelPage, count }) => [
    `${modelPage.path}/`,
    modelPage.name,
    count ? `${number(count)} ${plural(count, "автомобиль", "автомобиля", "автомобилей")} в наличии` : null,
  ]);
  return renderer.pathwayLinks({
    heading: "Обзоры популярных моделей",
    intro: "Что это за машина, чем отличаются версии, что менялось по годам и сколько такая стоит с доставкой до Минска.",
    links,
  });
}

/**
 * Журнал на главной. В приложении этот блок есть, но его рисует скрипт: в готовой
 * разметке главной на журнал не вело ни одной ссылки, и материалы держались только
 * на карте сайта. Здесь — те же материалы теми же названиями.
 */
function blogHomeLinks() {
  const posts = blogPosts();
  if (!BLOG_ENABLED || !posts.length) return "";
  return pathwayLinks({
    heading: BLOG_INDEX.name,
    intro: BLOG_INDEX.lead,
    links: [
      ...posts.map((post) => [`${post.path}/`, post.name, post.teaser || null]),
      [`${BLOG_INDEX.path}/`, "Все материалы журнала", null],
    ],
  });
}

function publicPageBody(page) {
  // Блок с предложениями появляется только когда есть что в него положить: заголовок
  // над пустым списком читается поисковиком как сломанная страница. На хостинге дампа
  // каталога нет, поэтому витрину главной берём из базы — иначе самая массовая
  // страница сайта не ссылалась бы ни на одну машину, что и было до 23.08.2026.
  const links = page.route === "/" && live.showcase.length ? carLinks(live.showcase, showcaseSize) : "";
  const article = page.tool ? toolArticle(page.tool) : page.post ? blogPostArticle(page.post) : page.blogIndex ? blogIndexArticle() : page.modelsIndex ? modelsIndexArticle() : infoArticle(page.route);
  // Ссылки на разделы каталога. Раньше с главной вели ровно двенадцать ссылок (меню и
  // подвал), и в разделы нельзя было попасть ниоткуда, кроме карты сайта: плитку марок
  // рисует скрипт, в разметке её нет. Сначала на главной были только марки, типы
  // двигателя и кузова — 33 раздела из 57; ценовые полосы и сочетания («электрические
  // кроссоверы», «седаны BYD») получали ссылки только друг от друга, хотя запросы
  // «электромобиль до 20 000» и «китайский кроссовер» — самые покупательские. Теперь
  // на главной и на странице обзоров стоит полный список.
  const sections = page.route === "/" || page.modelsIndex
    ? renderer.sectionLinks(liveSections, { heading: page.modelsIndex ? "Разделы каталога" : "Автомобили из Китая по маркам, типам и цене" })
    : "";
  const models = page.route === "/" ? popularModelLinks() : "";
  const journal = page.route === "/" ? blogHomeLinks() : "";
  return `${navigation(MODELS_INDEX.path)}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a></p><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.lead)}</p>${article}${links ? `<section><h2>Актуальные предложения</h2>${links}</section>` : ""}${models}${journal}${pathwayFor(page.route)}${sections}</main>${footer()}`;
}

// Живые данные читаем до отрисовки страниц: витрина и счётчики моделей нужны главной.
const live = await readLiveCatalog();

// Разделы, в которых есть хотя бы одна машина. Марки заведены заранее, под загрузку
// каталога: пока импорт до марки не дошёл, её раздел пуст — в карту сайта и в ссылки
// он не попадает, а сервер отдаёт по нему 404. Когда база при сборке недоступна,
// наличие неизвестно и берём все разделы: так было до появления этой проверки.
const liveSections = live.stock.size
  ? CATALOG_LANDINGS.filter((landing) => (live.stock.get(landing.path) || 0) > 0)
  : CATALOG_LANDINGS;


/**
 * Картинка материала журнала для соцсетей и поиска: та же машина, что открывает
 * статью. Раньше всем страницам уходила одна общая заставка сайта — ссылка,
 * отправленная в Telegram, выглядела одинаково для любой подборки.
 */
function blogPostImage(post) {
  const found = live.collections.get(post.slug) || null;
  const car = found?.cover || found?.duel?.find((entry) => entry.hero)?.hero || null;
  const source = car?.images?.length ? car.images[0] : car?.image;
  return /^https:\/\//.test(String(source || "")) ? source : undefined;
}

/**
 * Дата обновления страницы-расчёта. Без неё поисковик не показывает дату рядом со
 * ссылкой и перечитывает страницу тем реже, чем дольше она в индексе, — а страница
 * квоты только свежестью и ценна.
 *
 * Дату не берём «сегодня»: пересборка сайта каждую ночь ещё не значит, что страница
 * изменилась, а ежедневно обновляемая дата на неменяющемся тексте — обман поисковика.
 * У квоты это день последней сводки таможни (та самая цифра, за которой приходят),
 * у остальных — день последней правки текстов и тарифов, из которых страница собрана.
 */
const toolSourceModified = ["src/tool-pages.js", "src/tool-page-texts.js", "src/pricing.js", "src/china-logistics.js"]
  .map((file) => statSync(path.join(root, file)).mtime.getTime())
  .sort()
  .pop();
const toolLastmod = (tool) =>
  (tool.kind === "quota" ? isoDate(EV_QUOTA.reports.at(-1)?.[0]) : null) || isoDate(toolSourceModified);

for (const page of publicPages) {
  // Хлебные крошки: у материала журнала и у страницы расчёта их три ступени —
  // главная, журнал, страница. Расчёты живут в журнале, и путь к ним должен быть
  // одинаковым и для человека (см. ToolPage в src/App.jsx), и для поисковика.
  const viaBlog = page.post || (page.tool && BLOG_ENABLED);
  const crumbs = page.route === "/"
    ? [["Главная", "/"]]
    : viaBlog
      ? [["Главная", "/"], [BLOG_INDEX.name, `${BLOG_INDEX.path}/`], [page.post?.name || page.tool.name, page.route]]
      : [["Главная", "/"], [page.h1, page.route]];
  const schemas = [renderer.breadcrumbsSchema(crumbs)];
  // Разметка статьи: по ней поисковик понимает, что это материал с датой, а не
  // очередная страница каталога. Дата обновления — день сборки: список машин и
  // цифры в тексте действительно пересобираются каждую ночь.
  if (page.post) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: page.post.h1,
      description: page.post.seoDescription,
      inLanguage: "ru-BY",
      mainEntityOfPage: routeUrl(page.route),
      datePublished: page.post.published,
      dateModified: isoDate(blogUpdatedAt(page.post, live.collections.get(page.post.slug)?.changedAt)) || page.post.published,
      author: { "@type": "Organization", name: "abcars.by", url: routeUrl("/") },
      publisher: { "@type": "Organization", name: "abcars.by", url: routeUrl("/") },
    });
    if (page.post.faq?.length) schemas.push(renderer.faqSchema(page.post.faq));
  }
  // Страница-расчёт — не статья, но дата обновления ей нужна не меньше: см.
  // `toolLastmod` выше. Отдаём её обычной разметкой страницы.
  if (page.tool) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.h1,
      description: page.description,
      inLanguage: "ru-BY",
      url: routeUrl(page.route),
      dateModified: toolLastmod(page.tool),
      publisher: { "@type": "Organization", name: "abcars.by", url: routeUrl("/") },
    });
  }
  if (page.route === "/") schemas.unshift(renderer.organizationSchema(), renderer.webSiteSchema());
  // Вопросы со страницы «Вопросы и ответы» — по этой разметке они попадают
  // в выдачу раскрывающимся списком. На страницах моделей это уже работает.
  if (page.route === "/faq/") schemas.push(renderer.faqSchema(FAQ_GROUPS.flatMap((group) => group.items.map((item) => ({ q: item.question, a: item.answer })))));
  // Вопросы страниц расчётов — той же разметкой, что на страницах моделей.
  if (page.tool?.faq?.length) schemas.push(renderer.faqSchema(page.tool.faq));
  // Первый экран главной браузер рисует целиком — заголовок с поиском, а не только
  // шапку: главная и есть та страница, куда приходят по ссылке из поиска.
  const options = { ...page, canonical: routeUrl(page.route), image: page.post ? blogPostImage(page.post) : undefined, body: publicPageBody(page), schemas, boot: page.route === "/" ? "home" : "header" };
  // `indexable` без значения убираем: у него в renderHtml свой разумный умолчание,
  // а явный undefined затёр бы его.
  if (options.indexable === undefined) delete options.indexable;
  writeRoute(page.route, renderHtml(options));
}

function writeRoute(route, html) {
  const relative = route === "/" ? "index.html" : path.join(route.replace(/^\/+|\/+$/g, ""), "index.html");
  const target = path.join(clientDir, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, html);
}

// Страницы машин файлами. По умолчанию выключено: на хостинге их собирает сервер.
for (const car of cars) {
  const related = cars.filter((candidate) => candidate.id !== car.id && candidate.brand === car.brand && candidate.model === car.model).slice(0, 12);
  const modelPage = MODEL_PAGES.find((page) => page.brand === car.brand && page.model === car.model) || null;
  writeRoute(carRoute(car), renderer.carPage({ car, related, modelPage }).html);
}

for (const route of privateRoutes) {
  const name = route.split("/").filter(Boolean).join(" ") || "Личный раздел";
  const html = renderHtml({ title: `${name} | abcars.by`, description: "Личный раздел пользователя abcars.by.", canonical: route === "/analytics/" ? null : routeUrl(route), body: `<main class="page-width"><h1>Личный раздел</h1><p>Для работы этой страницы требуется JavaScript.</p></main>`, image: null, indexable: false });
  writeRoute(route, route === "/analytics/" ? withoutMetrika(html) : html);
}

const privateHtml = renderHtml({ title: "Личный раздел | abcars.by", description: "Личный раздел пользователя abcars.by.", canonical: routeUrl("/account/"), body: `<main class="page-width"><h1>Личный раздел</h1><p>Для работы этой страницы требуется JavaScript.</p></main>`, image: null, indexable: false });
writeFileSync(path.join(clientDir, "private.html"), privateHtml);

// Страница «такой страницы нет». С 30.08.2026 её показывает nginx вместо главной,
// когда адрес неизвестен, — и с честным кодом 404 (см. deploy/nginx-abcars-site.conf).
// Раньше здесь были заголовок и одна ссылка на главную; человеку, пришедшему по
// устаревшей ссылке, полезнее сразу попасть в каталог.
writeFileSync(path.join(clientDir, "404.html"), renderer.notFoundPage({ sections: liveSections }));

// Пустая заготовка приложения. Её читает сервер, когда собирает страницу машины:
// в ней лежат ссылки на стили и скрипты с хешами этой сборки, а место под содержимое
// оставлено пустым. Собранный `index.html` для этого не подходит — в нём уже лежит
// текст главной страницы. Файл нигде не упомянут ссылками и закрыт от индексации.
const appShellHtml = stripSeoHead(shell).replace("</head>", `    <meta name="robots" content="noindex, nofollow, noarchive" />\n  </head>`);
writeFileSync(appShellPath, appShellHtml);

// Заготовка страницы машины на случай, когда собрать её сервером не удалось (база
// недоступна): приложение всё равно загрузится и покажет свою ошибку. Адрес-первоисточник
// здесь не ставим — на этапе сборки неизвестно, какую машину откроют, а подставить
// главную значит сказать поисковику, что настоящей страницы нет. Запрет индексации
// здесь общий, по `SEO_ALLOW_INDEXING`: оставить `noindex` в готовом HTML насовсем
// нельзя — поисковик выбрасывает страницу, не дожидаясь, пока скрипт запрет снимет.
const carShellHtml = renderHtml({
  title: "Автомобиль с пробегом из Китая — цена до Минска | abcars.by",
  description: "Характеристики, пробег, состояние и ориентировочная стоимость автомобиля с пробегом из Китая с доставкой в Минск.",
  canonical: null,
  body: `${navigation(MODELS_INDEX.path)}<main class="page-width"><h1>Автомобиль с пробегом из Китая</h1><p>Загружаем карточку автомобиля: характеристики, фотографии и ориентировочную стоимость до Минска.</p><p><a href="${hrefRoute("/catalog/")}">Все автомобили в каталоге</a></p></main>${footer()}`,
  type: "product",
});
writeFileSync(path.join(clientDir, "car.html"), carShellHtml);

// ── Карты сайта ───────────────────────────────────────────────────────────────
const urlset = (entries) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;

/**
 * Живые данные каталога для сборки: витрина главной, число машин по каждой модели и
 * адреса машин для карты сайта. Одно соединение с базой на всю сборку — поэтому всё
 * читается разом, а не тремя функциями по очереди.
 *
 * Источник — дамп каталога, если он есть; иначе база, и только по явному
 * `SEO_CARS_FROM_DB=1`: `server/db.mjs` сам подхватывает `.env.local` с боевым адресом,
 * то есть без этого условия обычный локальный прогон и тесты читали бы прод.
 * База может быть недоступна — тогда блоки просто не появятся, а в выводе будет
 * сказано, чего не хватило: молча отдать поисковику пустую главную хуже.
 */
async function readLiveCatalog() {
  const countByModel = (list) => {
    const counts = new Map();
    for (const car of list) {
      const key = `${car.brand}|${car.model}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  };
  const nothing = { showcase: [], models: new Map(), modelChanged: new Map(), carEntries: [], listPages: new Map(), stock: new Map(), collections: new Map(), changed: new Map() };
  if (cars.length) {
    return {
      showcase: cars.slice(0, showcaseSize),
      models: countByModel(cars),
      modelChanged: new Map(),
      carEntries: carsSitemap ? cars.map((car) => ({ loc: routeUrl(carRoute(car)), lastmod: isoDate(car.updated || car.importedAt) })) : [],
      listPages: new Map(),
      stock: new Map(),
      collections: new Map(),
      changed: new Map(),
    };
  }
  if (!carsFromDatabase) {
    console.warn("Витрина главной, счётчики моделей и карта сайта с машинами не собраны: дампа каталога нет, а чтение из базы не разрешено (SEO_CARS_FROM_DB=1).");
    return nothing;
  }
  let pool = null;
  try {
    ({ pool } = await import("../server/db.mjs"));
    const { getModelFacts, listCars, modelSummary, sectionStats } = await import("../server/repository.mjs");
    // Витрина: по одной машине на модель и в случайном порядке. Обычная сортировка
    // здесь не годится — «самые новые» это то, что записал последний импорт, и одна
    // модель займёт весь блок.
    const showcase = (await listCars(new URLSearchParams({ sort: "variety", limit: String(showcaseSize) }))).items;
    const facts = await getModelFacts();
    // `content_changed_at` ставится только когда данные объявления действительно
    // изменились (см. миграцию 021). `imported_at` для этого не годится: она одинаковая
    // у всех карточек, потому что приходит из последнего полного импорта, — и поисковику
    // мы сообщали «ничего не менялось» даже при изменении цены.
    const rows = carsSitemap
      ? (await pool.query("SELECT l.id, COALESCE(l.content_changed_at, l.imported_at) AS changed_at FROM listings l WHERE l.status='active'")).rows
      : [];
    // Сколько страниц в каждом разделе. Нужно карте сайта: страницы списка робот иначе
    // находит только переходами «дальше», а в разделе электромобилей их две сотни —
    // до середины он дошёл бы нескоро.
    const listPages = new Map();
    const stock = new Map();
    // Вместе с количеством берём дату последнего изменения раздела: тот же скан по базе,
    // отдельного запроса она не стоит, а карте сайта без неё нечего сказать поисковику
    // о 163 разделах — они уходили туда вовсе без `lastmod`.
    const changed = new Map();
    const whole = await sectionStats(new URLSearchParams());
    listPages.set("/catalog", catalogPageCount(whole.total));
    changed.set("/catalog", isoDate(whole.changedAt));
    for (const landing of CATALOG_LANDINGS) {
      const { total, changedAt } = await sectionStats(landingApiParams(landing));
      stock.set(landing.path, total);
      listPages.set(landing.path, catalogPageCount(total));
      changed.set(landing.path, isoDate(changedAt));
    }
    // Живые списки подборок журнала: сам список машин, сколько их всего и цифры
    // для полосы под вступлением. Считаем здесь же, на том же соединении с базой.
    const collections = new Map();
    for (const post of BLOG_ENABLED ? blogPosts() : []) {
      // Отчёт живого среза каталога не требует: все его цифры уже посчитаны.
      if (post.kind === "report") continue;
      // У сравнения не один срез каталога, а по срезу на модель: наличие, самая
      // доступная машина и лучшие цифры версий считаются для каждой стороны отдельно.
      if (post.kind === "duel") {
        const sides = [];
        for (const side of blogPostSides(post)) {
          // Все цифры таблицы приходят одной сводкой из базы: годы, пробег, запас хода,
          // батарея, мощность, момент и разгон. Отдельно берём только цену — её считает
          // тот же расчёт, что и карточка машины, — и кадр для шапки.
          const summary = await modelSummary(blogApiParams(side));
          // Пять самых доступных машин модели: и список под разбором, и цена «от»
          // берутся из одного запроса.
          const list = await listCars(blogApiParams(side, { sort: "price_asc", limit: "5" }));
          // База сортирует по записанной сумме, а показываем пересчитанную: пять машин
          // переставляем по ней, и «цена от» берётся из них же.
          const cars = [...list.items].sort((left, right) => estimateLandedCost(left).totalUsd - estimateLandedCost(right).totalUsd);
          const cheapest = cars[0] || null;
          const byRange = (await listCars(blogApiParams(side, { sort: "range_desc", limit: "5" }))).items;
          sides.push({
            ...summary,
            side,
            cars,
            changedAt: summary.changedAt || list.changedAt || null,
            priceFromUsd: cheapest ? estimateLandedCost(cheapest).totalUsd : null,
            hero: byRange.find((car) => car.images?.length || car.image) || cars[0] || null,
          });
        }
        collections.set(post.slug, { duel: sides, cars: sides.flatMap((entry) => entry.cars), total: null, changedAt: sides.find((entry) => entry.changedAt)?.changedAt || null });
        continue;
      }
      const list = await listCars(blogListParams(post, String(blogCarsOnPage)));
      // Края подборки — отдельными запросами: список идёт «в разнобой», и по нему
      // «от такой-то суммы» посчиталось бы по двенадцати случайным объявлениям.
      const cheapest = (await listCars(blogApiParams(post, { sort: "price_asc", limit: "1" }))).items[0] || null;
      const highlightSort = blogHighlightSort(post);
      // Пять строк, а не одна: у части объявлений главная цифра не заполнена.
      const notable = highlightSort
        ? (await listCars(blogApiParams(post, { sort: highlightSort, limit: "5" }))).items.find((car) => blogHighlight(post, car)) || null
        : null;
      // Открывающий кадр статьи — тот же, что на карточке материала (самая дорогая
      // машина подборки: у дорогих объявлений съёмка лучше).
      const cover = (await listCars(blogApiParams(post, { sort: "price_desc", limit: "1" }))).items[0] || null;
      collections.set(post.slug, {
        cover,
        cars: list.items,
        total: list.total,
        // Когда набор правда менялся — цена, пробег, фотографии или новая машина.
        // «Последняя проверка» здесь не годится: она у всех наборов одна и та же.
        changedAt: list.changedAt || null,
        priceFromUsd: cheapest ? estimateLandedCost(cheapest).totalUsd : null,
        highlight: blogHighlight(post, notable),
      });
    }
    return {
      showcase,
      collections,
      models: new Map(facts.models.map((row) => [`${row.brand}|${row.model}`, row.count])),
      // Дата последнего изменения по каждой модели — для `lastmod` у обзоров.
      modelChanged: new Map(facts.models.map((row) => [`${row.brand}|${row.model}`, isoDate(row.changedAt)])),
      carEntries: rows.map((row) => ({ loc: routeUrl(`/cars/${encodeURIComponent(listingNumber(row.id))}/`), lastmod: isoDate(row.changed_at) })),
      listPages,
      stock,
      changed,
    };
  } catch (error) {
    console.warn(`Живые данные каталога не прочитаны: база недоступна (${error.code || error.message}). Витрина главной, счётчики моделей и карта сайта с машинами собраны не будут.`);
    return nothing;
  } finally {
    // Соединение закрываем всегда: иначе сборка висела бы, ожидая простаивающий пул.
    await pool?.end().catch(() => {});
  }
}

// Разделы каталога (`/catalog/byd`, `/catalog/electric`, `/catalog/suv`) в карту сайта
// попадают, а файлами не собираются: их отдаёт сервер. Готовый файл по такому адресу
// перекрыл бы правило переадресации, и сервер до отрисовки не дошёл бы.
// Страницы списка со второй и дальше: `/catalog/electric?page=2`. Каждая — свой
// первоисточник и живой список машин, поэтому в карте сайта им место наравне с первой.
const listPageEntries = (route) => {
  const pages = live.listPages.get(trimRoute(route)) || 1;
  // Дата у всех страниц одного раздела общая: список машин на них — куски одного набора,
  // и меняются они вместе.
  const lastmod = live.changed.get(trimRoute(route)) || null;
  return Array.from({ length: Math.max(0, pages - 1) }, (_, index) => ({ loc: `${routeUrl(route)}?page=${index + 2}`, lastmod }));
};

// Дата последнего обновления материала журнала: тот же день, что стоит в разметке
// статьи и виден человеку. Для поисковика это единственный способ узнать, что списки
// машин и цифры в подборках пересобираются каждую ночь, — без даты он приходит
// перепроверять страницу тем реже, чем дольше она в индексе. У остальных страниц
// даты нет: их содержимое от каталога не зависит.
const blogLastmod = (post) => isoDate(blogUpdatedAt(post, live.collections.get(post.slug)?.changedAt)) || post.published || null;
// У самого журнала дата — самая свежая из его материалов: список на нём и есть они.
const blogIndexLastmod = BLOG_ENABLED
  ? blogPosts().map(blogLastmod).filter(Boolean).sort().pop() || null
  : null;

const pageEntries = [
  // Черновики (образец отчёта) в карту сайта не идут: их страница собрана только
  // ради прямой ссылки и закрыта от индексации.
  ...publicPages.filter((page) => !page.post?.draft).map((page) => ({
    loc: routeUrl(page.route),
    lastmod: page.post ? blogLastmod(page.post) : page.blogIndex ? blogIndexLastmod : page.tool ? toolLastmod(page.tool) : null,
  })),
  // Каталог и его разделы файлами не собираются, но в карте сайта им место. Дата —
  // последнее настоящее изменение среди машин раздела: до 30.08.2026 все 3 600 адресов
  // разделов и обзоров уходили в карту сайта вовсе без даты, и поисковик не знал, что
  // раздел обновляется каждую ночь.
  { loc: routeUrl("/catalog/"), lastmod: live.changed.get("/catalog") || null },
  ...listPageEntries("/catalog/"),
  ...MODEL_PAGES.map((modelPage) => ({ loc: routeUrl(modelPage.path), lastmod: live.modelChanged.get(`${modelPage.brand}|${modelPage.model}`) || null })),
  ...liveSections.flatMap((landing) => [{ loc: routeUrl(landing.path), lastmod: live.changed.get(landing.path) || null }, ...listPageEntries(landing.path)]),
];
writeFileSync(path.join(clientDir, pagesSitemapName), urlset(pageEntries));

const carEntries = live.carEntries;
const carChunks = [];
for (let offset = 0; offset < carEntries.length; offset += carsPerSitemap) carChunks.push(carEntries.slice(offset, offset + carsPerSitemap));
carChunks.forEach((chunk, index) => writeFileSync(path.join(clientDir, carsSitemapName(index)), urlset(chunk)));
// Лишние файлы прошлых сборок убираем: пустая или устаревшая карта машин уводила бы
// поисковика на адреса, которых уже нет.
for (const stale of readdirSync(clientDir).filter((name) => /^sitemap-.*-cars(-\d+)?\.xml$/.test(name))) {
  if (!carChunks.some((_, index) => carsSitemapName(index) === stale)) rmSync(path.join(clientDir, stale), { force:true });
}

const sitemaps = [pagesSitemapName, ...carChunks.map((_, index) => carsSitemapName(index))];
writeFileSync(path.join(clientDir, sitemapIndexName), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.map((name) => `  <sitemap><loc>${escapeXml(siteUrl)}/${name}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`);
// Прежние предсказуемые имена в сборке не оставляем: файл с адресами всех машин по
// адресу `/sitemap.xml` — готовый список для выкачки конкурентом.
for (const stale of ["sitemap.xml", "sitemap-pages.xml", "sitemap-cars.xml"]) {
  if (!sitemaps.includes(stale) && stale !== sitemapIndexName) rmSync(path.join(clientDir, stale), { force:true });
}

const robots = allowIndexing
  // Карту сайта в robots.txt не упоминаем: эта строка публично показала бы, где лежит
  // список всех адресов каталога. Поисковикам её адрес задают вручную — один раз, в
  // Google Search Console и Яндекс.Вебмастере; на обход и индексацию это не влияет.
  // Запреты пишем без косой черты на конце и с якорем `$`, где нужно точное совпадение.
  // Это не мелочь: в robots.txt адрес сравнивается по началу строки, поэтому «/car»
  // запрещал заодно и «/cars/59372753» — то есть все 31 тысячу карточек, ради которых
  // всё и делалось. А «/account/» наоборот не покрывал сам «/account»: хостинг настроен
  // на адреса без черты. Проверка правил живёт в tests/robots-rules.test.mjs.
  ? [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api",
      "Disallow: /data",
      "Disallow: /account",
      "Disallow: /favorites",
      "Disallow: /searches",
      "Disallow: /login",
      "Disallow: /register",
      "Disallow: /orders",
      "Disallow: /analytics",
      "Disallow: /app-shell",
      "Disallow: /car$",
      "Disallow: /car.html$",
      // Clean-param — правило Яндекса: он склеивает адреса, отличающиеся только этими
      // параметрами, с чистым адресом раздела, и обход на них не тратит.
      // Марки, типа двигателя и кузова в списке нет намеренно: адрес с такими фильтрами
      // сервер перебрасывает на готовый раздел (`/catalog?brand=BYD` → `/catalog/byd`),
      // а склеенный с общим каталогом адрес до этого переброса не дошёл бы. Остальные
      // параметры своей страницы не имеют, поэтому их по-прежнему склеиваем.
      "Clean-param: sort&model&color&drive&yearFrom&yearTo&priceFrom&priceTo&mileage&owners&battery&range&accel&tire&torque&condition&q /catalog",
      "",
      // Сборщики данных для обучения ИИ и оптовые обходчики каталогов. Пользы от них
      // нет: в поиске они сайт не показывают, а сервер грузят как настоящая толпа —
      // 25.08.2026 один такой сделал 25 тысяч запросов за сутки, две трети всей работы
      // сервера. Поисковиков (Google, Яндекс, Bing, Apple, DuckDuckGo) в списке нет
      // намеренно: их обход и выдача остаются как были. Google-Extended и
      // Applebot-Extended — это только обучение ИИ у Google и Apple, к поиску они
      // отношения не имеют, поэтому запрет на выдачу не влияет. Роботы, которые
      // приводят людей по ссылкам (OAI-SearchBot у ChatGPT, PerplexityBot), тоже
      // открыты: это источник посетителей, а не просто вычитка сайта.
      // Список — просьба, а не запрет: честные роботы его соблюдают, остальных
      // останавливает настройка сервера (сниппет nginx abcars-bots.conf).
      "User-agent: ClaudeBot",
      "User-agent: anthropic-ai",
      "User-agent: Claude-Web",
      "User-agent: GPTBot",
      "User-agent: CCBot",
      "User-agent: Google-Extended",
      "User-agent: Applebot-Extended",
      "User-agent: Bytespider",
      "User-agent: Amazonbot",
      "User-agent: meta-externalagent",
      "User-agent: Diffbot",
      "User-agent: Omgilibot",
      "User-agent: ImagesiftBot",
      "User-agent: cohere-ai",
      "User-agent: AhrefsBot",
      "User-agent: SemrushBot",
      "User-agent: DataForSeoBot",
      "User-agent: MJ12bot",
      "User-agent: DotBot",
      "User-agent: BLEXBot",
      "User-agent: Barkrowler",
      "User-agent: ZoominfoBot",
      "User-agent: PetalBot",
      "Disallow: /",
      "",
    ].join("\n")
  : `# Preview/test build: indexing is intentionally disabled.\nUser-agent: *\nDisallow: /\n`;
writeFileSync(path.join(clientDir, "robots.txt"), robots);

// Keep the initial static catalog small. Full records are loaded only when a
// visitor opens a vehicle page on a host without the database API.
const summaryKeys = [
  "id", "externalId", "brand", "model", "year", "mileage", "chinaPrice", "usdPrice",
  "city", "owners", "transfers", "type", "drive", "bodyType", "bodyStructure", "vehicleClass",
  "seats", "doors", "engine", "battery", "batteryType", "range", "electricRange",
  "combinedRange", "batteryHealth", "claims", "incident", "conditionGrade", "appearanceScore",
  "image", "status", "statusTone", "sourceListedAt", "listedAt", "publicationDate", "publishedAt",
  "firstSeenAt", "importedAt", "previousPriceUsd", "priceChangedAt",
];
const compactCars = cars.map((car) => ({
  ...Object.fromEntries(summaryKeys.filter((key) => car[key] !== undefined).map((key) => [key, car[key]])),
  title: carTitle(car),
  images: car.image ? [car.image] : [],
  _summary: true,
}));
// Пустой каталог не пишем: приложение считает такой ответ поводом показать ошибку,
// а отсутствующий файл честно роняет его на API, который и держит карточки.
if (cars.length) {
  // Папку данных до этого создавал только vite, копируя `public/data`.
  mkdirSync(path.join(clientDir, "data"), { recursive:true });
  const compactPayload = JSON.stringify({ generatedAt:catalog.generatedAt || null, cars:compactCars });
  writeFileSync(path.join(clientDir, "data", "catalog.json"), compactPayload);
  writeFileSync(path.join(clientDir, "data", "catalog.json.gz"), gzipSync(compactPayload, { level:9 }));
  for (const car of cars) {
    // Файл называется коротким номером — тем же, что стоит в адресе карточки:
    // в статическом режиме приложение берёт данные именно по нему.
    const target = path.join(clientDir, "data", "cars", `${encodeURIComponent(listingNumber(car.id))}.json`);
    mkdirSync(path.dirname(target), { recursive:true });
    writeFileSync(target, JSON.stringify(car));
  }
}
rmSync(path.join(clientDir, "data", "cars.json"), { force:true });

const carsInSitemap = carEntries.length;
console.log(`Generated ${publicPages.length} public pages, ${MODEL_PAGES.length} model reviews and ${liveSections.length} catalog sections (server-rendered), ${cars.length} vehicle pages${vehiclePages ? "" : " (страницы машин собирает сервер в момент запроса)"}, sitemaps and robots.txt (indexing ${allowIndexing ? "enabled" : "disabled"}).`);
console.log(`Адресов машин в карте сайта: ${carsInSitemap}${carsSitemap ? "" : " (включается SEO_CARS_SITEMAP=1 или открытой индексацией)"}.`);
// Адрес карты нигде не публикуется, поэтому печатаем его здесь: именно эту ссылку
// вставляют в Google Search Console и Яндекс.Вебмастер.
console.log(`Карта сайта (в robots.txt не указана, добавить вручную в Search Console и Вебмастер): ${siteUrl}/${sitemapIndexName}`);

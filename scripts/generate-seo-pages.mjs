#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { normalizeDrive } from "../src/drive-types.js";
import { MODEL_PAGES, MODELS_INDEX } from "../src/model-pages.js";
import { CATALOG_LANDINGS, HOME_SEO, brandLandingPath, catalogPageCount, landingApiParams, landingsForCar, modelLandingPath } from "../src/catalog-landings.js";
import { TOOL_PAGES, calcParamNames, calculatorFields, customsExample, deliveryStages, dutyRateTables, toolPageStats, toolUpdatedLabel } from "../src/tool-pages.js";
import { rangeParamNames } from "../src/range-estimate.js";
// Тексты страниц-инструментов лежат отдельно от «обложек»: браузер берёт их
// отдельным файлом, а сборке нужны целиком — склеиваем запись с её текстами.
import { TOOL_PAGE_TEXTS } from "../src/tool-page-texts.js";
// Справочник марок для страницы «Марки из Китая»: те же данные, что у приложения.
import { CHINA_BRANDS, CHINA_MADE_FOREIGN } from "../src/china-brands.js";
// Расчёт реального запаса хода: те же поправки, что в форме у человека.
import { rangeFields, rangeTable, ratedToWinterTable } from "../src/range-estimate.js";
// Сравнение с белорусским рынком: правила отбора и подписи — в одном месте с приложением.
import { brandCoverage, compareDetailedRows, compareSummary, compareTable, coverageNote } from "../src/market-compare.js";
import { EV_QUOTA, evQuotaState } from "../src/ev-quota.js";
// Цена подборки «от такой-то суммы» считается тем же расчётом, что показывает
// карточка машины: иначе в журнале стояла бы одна сумма, а в каталоге другая.
import { PRICING, estimateLandedCost } from "../src/pricing.js";
// Тексты информационных страниц берём из тех же данных, по которым их рисует
// приложение: в разметке этих девяти страниц было по 32–43 слова — заголовок и одна
// фраза, — а всё остальное появлялось только после запуска сайта в браузере.
import { FAQ_GROUPS, HOME_FAQ, HOME_FAQ_LEAD, HOME_ORDER_STEPS } from "../src/purchase-info.js";
import { TRACKING_FAQ } from "../src/tracking-info.js";
import { LEGAL_COPY, LEGAL_DRAFT, LEGAL_DRAFT_NOTE } from "../src/legal-copy.js";
import { COMPANY } from "../src/company-data.js";
import { ABOUT_PRINCIPLES, BEFORE_PAYMENT, PURCHASE_FLOW_STEPS, SERVICE_PROOF, SERVICE_REPORT_EXAMPLE, SERVICE_SECTIONS } from "../src/service-copy.js";
// Журнал: подборки. Раздел собирается только при включённом выключателе — пока он
// выключен, у сайта нет ни страниц журнала, ни его адресов в карте сайта.
import { BLOG_ENABLED } from "../src/feature-flags.js";
import { SAMPLE_REPORT, groups, indexChartSvg, percent } from "../src/blog-report.js";
import { blogFigureHtml } from "../src/blog-figures.js";
import { BLOG_INDEX, BLOG_TOP_POOL, blogApiParams, blogCarFigure, blogCarReason, blogCatalogHref, blogDuelRows, blogDuelSpecRows, blogHighlight, blogHighlightSort, blogListParams, blogPostSides, blogPostStats, blogPostTags, blogPosts, blogAllPosts, blogRelatedPosts, blogTopCars, blogFreshnessLabel, blogPostDateLabel, blogUpdatedAt, blogPostHidden } from "../src/blog-posts.js";
import { BLOG_TEXTS, blogPostWithText } from "../src/blog-texts.js";
// Разметку страниц держит общий модуль: этими же функциями сервер собирает страницу
// машины в момент запроса. Пока разметка жила только здесь, серверная страница
// расходилась бы со статической при каждой правке.
import { homePopularModels } from "../src/home-popular-models.js";
import { IMAGE_WIDTH_SCHEMA, carRoute, carTitle, createSeoRenderer, escapeHtml, escapeXml, isoDate, linkifyText, listingNumber, number, photoHref, plural, stripSeoHead, trimRoute } from "../server/seo-render.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Пути можно переопределить: тесты прогоняют генератор на трёх машинах в своей
// временной папке, чтобы не зависеть ни от дампа каталога, ни от общей сборки.
const clientDir = process.env.SEO_OUTPUT_DIR ? path.resolve(process.env.SEO_OUTPUT_DIR) : path.join(root, process.env.ABCARS_BUILD_DIR || "dist", "client");
// Stable URLs give the browser a second way to get an article when an older tab
// still refers to a text chunk from before a publication.
if (BLOG_ENABLED) {
  const textDir = path.join(clientDir, "blog-texts");
  mkdirSync(textDir, { recursive: true });
  for (const name of readdirSync(textDir)) {
    if (name.endsWith(".json")) rmSync(path.join(textDir, name));
  }
  for (const post of blogPosts()) {
    const text = BLOG_TEXTS[post.slug];
    if (text) writeFileSync(path.join(textDir, `${post.slug}.json`), `${JSON.stringify(text)}\n`);
  }
}
// Заготовку читаем из `app-shell.html`, если он уже есть, и только иначе из
// `index.html`. Причина: генератор перезаписывает `index.html` готовой главной
// страницей, поэтому повторный запуск на той же сборке брал бы за заготовку страницу
// с текстом главной — и этот текст попал бы во все остальные страницы.
const appShellPath = path.join(clientDir, "app-shell.html");
const shellPath = existsSync(appShellPath) ? appShellPath : path.join(clientDir, "index.html");
const catalogPath = process.env.SEO_CATALOG ? path.resolve(process.env.SEO_CATALOG) : path.join(root, "public", "data", "cars.json");
const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
// Файлы карты сайта носят имя с токеном: до 25.09.2026 карта пряталась от конкурентов
// (готовый список всех адресов каталога), и под этим именем она зарегистрирована в
// Search Console и Вебмастере — имя менять нельзя, иначе зарегистрированный адрес
// перестанет открываться (`SEO_SITEMAP_TOKEN` — тогда карту нужно добавить заново).
//
// 25.09.2026 (разбор против IM4CAR) карта открыта: тот же указатель лежит и по
// обычному адресу `/sitemap.xml`, а robots.txt на него ссылается. Прятать оказалось
// нечего — каталог и так обходится по ссылкам разделов, а у конкурента в карте
// 631 тысяча адресов, и Google взял из них 147 тысяч; наша карта без строки в
// robots.txt была для роботов, которые не знают адреса, пустым местом.
const sitemapToken = String(process.env.SEO_SITEMAP_TOKEN || "7c4f19b2").replace(/[^a-z0-9-]/gi, "") || "7c4f19b2";
const sitemapIndexName = `sitemap-${sitemapToken}.xml`;
const pagesSitemapName = `sitemap-${sitemapToken}-pages.xml`;
// Открытое имя указателя — то, что стоит в robots.txt.
const publicSitemapName = "sitemap.xml";
// Первый файл машин сохраняет привычное имя, следующие получают номер: в одну карту
// по стандарту влезает 50 000 адресов, и при росте каталога её придётся делить.
const carsSitemapName = (index) => (index === 0 ? `sitemap-${sitemapToken}-cars.xml` : `sitemap-${sitemapToken}-cars-${index + 1}.xml`);
const carsPerSitemap = 45_000;
// Адрес первого снимка машины для карты сайта — тот же кадр и тот же наш адрес
// (/photo/…), что стоит в разметке карточки: чужое хранилище отвечает роботу
// втрое медленнее и в любой день может его не пустить.
const carSitemapPhoto = (url) => {
  const source = String(url || "");
  if (!/^https:\/\//.test(source)) return null;
  const proxied = photoHref(source, IMAGE_WIDTH_SCHEMA);
  return proxied?.startsWith("/") ? `${siteUrl}${proxied}` : proxied || null;
};
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

// ── Сколько адресов уходит в карту сайта ──────────────────────────────────────
// 01.09.2026, по данным Search Console: Google проиндексировал 336 страниц, а 107 383
// висели в состоянии «обнаружена, не проиндексирована». Тогда карту сузили до
// нескольких свежих карточек на модель, чтобы разделы и обзоры не тонули среди
// объявлений.
//
// 25.09.2026 (разбор против IM4CAR) машины возвращены в карту целиком: в карте было
// 2 693 карточки из 38 764, а у конкурента — все 631 тысяча, и именно из карты Google
// взял у него 147 тысяч страниц. К каждой карточке идут дата настоящего изменения
// и первый снимок (расширение image-sitemap): так робот отличает обновлённую машину
// от нетронутой, а снимок попадает в поиск по картинкам с нашего адреса.
//
// `SEO_SITEMAP_CARS_PER_MODEL=5` возвращает прежнюю выборку, если бюджет обхода
// снова окажется узким; `SEO_SITEMAP_FULL=1` дополнительно отдаёт все страницы-листалки.
const fullSitemap = /^(1|true|yes)$/i.test(String(process.env.SEO_SITEMAP_FULL || "false"));
const carsPerModelInSitemap = fullSitemap ? 0 : Math.max(0, Number(process.env.SEO_SITEMAP_CARS_PER_MODEL) || 0);
// Сколько страниц-«листалок» раздела попадает в карту сверх первой. Глубокие страницы
// (в разделе электромобилей их две сотни) для поиска бесполезны: содержание у них
// одинаковое, а бюджет обхода они забирают наравне с разделами. Робот дойдёт до них
// по ссылкам «дальше», если захочет.
const listPagesInSitemap = fullSitemap ? Infinity : Math.max(0, Number(process.env.SEO_SITEMAP_LIST_PAGES ?? 3) || 0);
// Список машин для карты берётся из дампа каталога, а на хостинге дампа нет — там его
// даёт база, но только по явному `SEO_CARS_FROM_DB=1`. Без этого условия сборка ходила бы
// в базу и с рабочей машины: `server/db.mjs` сам подхватывает `.env.local` с боевым
// адресом, то есть обычный локальный прогон и тесты читали бы прод.
const carsFromDatabase = /^(1|true|yes)$/i.test(String(process.env.SEO_CARS_FROM_DB || "false"));
const hasCatalog = existsSync(catalogPath);
if (vehiclePages && !hasCatalog) console.warn(`Каталог ${path.relative(root, catalogPath)} не найден: страницы автомобилей и статический каталог собраны не будут.`);
const catalog = vehiclePages && hasCatalog ? JSON.parse(readFileSync(catalogPath, "utf8")) : {};
const cars = (catalog.cars || catalog.items || []).filter((car) => car && car.id).map((car) => ({ ...car, drive:normalizeDrive(car.drive) }));

// Свод цен белорусского рынка. Его собирает `npm run market` с домашней сети (площадка
// блокирует адреса дата-центров), файл лежит в репозитории и приезжает на сервер
// обычной выкладкой. Нет файла — страница сравнения просто не собирается: пустая
// таблица «сравнили и ничего не нашли» хуже её отсутствия.
const marketPath = process.env.SEO_MARKET ? path.resolve(process.env.SEO_MARKET) : path.join(root, "data", "market-belarus-detailed.json");
const marketBelarus = existsSync(marketPath) ? JSON.parse(readFileSync(marketPath, "utf8")) : null;

// Общей страницы каталога здесь нет: её, как и разделы, отдаёт сервер. Файлами она
// собиралась вхолостую — на хостинге дампа каталога нет, и в странице не оставалось ни
// одной ссылки на машину. Готовый файл вдобавок перекрыл бы правило переадресации, и
// адрес с фильтрами (`/catalog?brand=BYD`) не дошёл бы до переброса на свой раздел.
const publicPages = [
  { route: "/", title: HOME_SEO.title, description: HOME_SEO.description, h1: HOME_SEO.h1.replace(/\u00a0/g, " "), lead: "Каталог актуальных объявлений, предварительный расчёт цены до Минска и проверка автомобиля перед оплатой." },
  { route: "/how-it-works/", title: "О сервисе покупки автомобилей из Китая | abcars.by", description: "Подбор и проверка автомобиля, расчёт цены под ключ, договор, доставка и выдача автомобиля из Китая в Минске.", h1: "О сервисе abcars.by", lead: "Подбираем автомобиль, сверяем наличие, состояние и полную смету. После вашего согласования заключается договор, машину выкупают и доставляют в Минск." },
  // Страницы `/about` больше нет: у неё был тот же заголовок «О сервисе abcars.by», что
  // у `/how-it-works`, и обе отвечали на один запрос. Её содержательные блоки — наш
  // подход и «чего мы не обещаем» — перенесены вниз `/how-it-works`, а сам адрес
  // перебрасывается туда навсегда (правило в vercel.json).
  { route: "/faq/", title: "Вопросы о покупке и доставке авто из Китая | abcars.by", description: "Ответы о проверке, стоимости, оплате, сроках доставки, таможенном оформлении и покупке автомобиля из Китая в Беларуси.", h1: "Вопросы о покупке автомобиля из Китая", lead: "Короткие ответы Абкарс (ABCars) о проверке, цене, договоре, оплате, доставке и о том, кто привозит машину." },
  { route: "/tracking/", title: "Отслеживание автомобиля по VIN | abcars.by", description: "Статус автомобиля из Китая по VIN-номеру.", h1: "Отслеживание автомобиля", lead: "Введите VIN, чтобы узнать, на каком этапе находится ваш автомобиль." },
  { route: "/contacts/", title: "Контакты abcars.by — автомобили из Китая в Минске", description: "Контакты сервиса abcars.by в Минске. Консультация по выбору, проверке, расчёту и покупке автомобиля из Китая.", h1: "Контакты abcars.by", lead: "Обсудим бюджет, подбор, проверку и расчёт цены автомобиля из Китая в Беларусь." },
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
          return { route: `${post.path}/`, title: post.seoTitle, description: post.seoDescription, h1: post.h1, lead: post.lead, post, indexable: blogPostHidden(post) ? false : undefined };
        }),
      ]
    : []),
];

const privateRoutes = ["/favorites/", "/searches/", "/login/", "/register/", "/account/", "/analytics/"];
// Названия закрытых разделов по-русски. Без них заголовок вкладки собирался из
// самого адреса — «analytics | abcars.by», — а у аналитики он ещё и подменялся
// приложением на «Страница не найдена»: закрытые разделы в перечень заголовков
// не входили (см. privateRouteSeo в src/App.jsx).
const PRIVATE_ROUTE_NAMES = {
  "/favorites/": "Избранные автомобили",
  "/searches/": "Мои поиски",
  "/login/": "Вход в личный кабинет",
  "/register/": "Регистрация",
  "/account/": "Личный кабинет",
  "/analytics/": "Аналитика",
};

// В боевом HTML CRM не оставляем даже выключенный код внешних счётчиков. Проверка
// адреса в общем шаблоне нужна для локальной разработки и перехода без перезагрузки,
// а отдельный готовый файл `/analytics` может и должен быть полностью чистым.
const withoutMetrika = (html) => html
  .replace(/\s*<script\b[^>]*id=["']yandex-metrika["'][^>]*>[\s\S]*?<\/script>/i, "")
  .replace(/\s*<noscript\b[^>]*id=["']yandex-metrika-noscript["'][^>]*>[\s\S]*?<\/noscript>/i, "")
  .replace(/\s*<script\b[^>]*id=["']google-analytics["'][^>]*>[\s\S]*?<\/script>/i, "");

// ── Куда идти дальше с информационной страницы ────────────────────────────────
// Страницы про растаможку, квоту, стоимость доставки, расчёт и вопросы —
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
    links: ["electric", "hybrid", "petrol", "suv", "sedan", "/customs", "/catalog"],
  },
  "/faq/": {
    heading: "Ответы, которые видно в каталоге",
    intro: "Большинство вопросов упирается в конкретную машину: её возраст, тип двигателя и цену. В этих разделах ответ виден цифрами.",
    links: ["electric", "hybrid", "petrol", "under-20000", "petrol-under-30000", "byd", "volkswagen", "/catalog"],
  },
  "/contacts/": {
    heading: "Пока мы отвечаем — посмотрите каталог",
    intro: "Разговор выходит предметнее, когда есть две-три машины на примете.",
    links: ["electric", "hybrid", "petrol", "byd", "tesla", "volkswagen", "mercedes-benz", "/catalog"],
  },
  "/customs/": {
    heading: "Посчитать на конкретной машине",
    intro: "Расчёт получается точнее, когда есть объявление: год, тип двигателя, объём мотора и цену берём из него. Электромобиль, гибрид и бензиновая машина считаются по разным правилам, и каталог уже разделён по этому признаку.",
    links: ["electric", "hybrid", "petrol", "petrol-suv", "petrol-sedan", "under-30000", "/catalog"],
  },
  "/ev-quota/": {
    heading: "Что можно ввезти по квоте",
    intro: "Квота распространяется только на электромобили. По умолчанию каталог показывает их цены до Минска по квоте; текущий расчёт с пошлиной 15% включается переключателем. Рядом — бензиновые машины: на них квота не влияла, и её состояние их цену не меняет.",
    links: ["electric", "electric-suv", "electric-sedan", "under-20000", "petrol", "petrol-under-30000", "/catalog"],
  },
  "/delivery-cost/": {
    heading: "Машины, для которых считаем доставку",
    intro: "Сама доставка почти не зависит от машины, а итоговая сумма — зависит. Подборки собраны по конечной цене.",
    links: ["under-15000", "under-20000", "under-25000", "under-40000", "petrol-under-25000", "petrol-under-40000", "/catalog"],
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
/**
 * Сколько машин марки в каталоге — для справочника марок.
 *
 * Числа берём оттуда же, откуда их берут разделы каталога: при сборке на сервере это
 * база (`live.stock` по адресу раздела), а при сборке с дампом — сам дамп. Своего
 * запроса страница не делает, иначе справочник и раздел марки показывали бы разные
 * числа. Отдельной функцией, а не строкой внутри `toolArticle`: там своя переменная
 * `live` — кусок разметки, — и обращение к живому каталогу оттуда молча ломалось бы.
 */
/**
 * Форма расчёта обычной разметкой: поля, варианты и подписи. Форму на странице рисует
 * скрипт, а поисковик скриптов не запускает — без этого по запросу «калькулятор» мы
 * предлагали ему страницу, на которой, с его точки зрения, калькулятора нет. Описание
 * полей берётся из того же места, что и сама форма.
 */
function formHtml(fields, prefix) {
  return fields
    .map((item, index) => {
      const id = `${prefix}-field-${index + 1}`;
      const control = item.options
        ? `<select id="${id}">${item.options.map((option) => `<option>${escapeHtml(option)}</option>`).join("")}</select>`
        : `<input id="${id}" type="${item.input === "checkbox" ? "checkbox" : "number"}" />`;
      return `<p><label for="${id}">${escapeHtml(item.label)}</label> ${control}${item.hint ? ` <small>${escapeHtml(item.hint)}</small>` : ""}</p>`;
    })
    .join("");
}

/**
 * Строки сравнения с белорусским рынком. Считаются один раз: их берут и страница для
 * поисковика, и файл, который читает приложение, — два расчёта разошлись бы.
 */
// Сколько строк сравнения попадает в готовую разметку. Все 400+ раздували бы страницу
// до сотни килобайт ради робота, который и так видит, из чего она собрана. Человек
// в браузере получает таблицу целиком — с поиском и фильтром по маркам.
const STATIC_COMPARE_ROWS = 150;
let marketCompareCache = null;
function marketCompare() {
  if (marketCompareCache) return marketCompareCache;
  // Тот же набор строк, что видит человек: приложение берёт сравнение целиком, и
  // урезанная таблица для поисковика давала бы другие итоговые числа на одной и
  // той же странице.
  const rows = compareDetailedRows({ ours: live.priceStats || [], market: marketBelarus, limit: 100_000 })
    .filter((row) => row.mileageMax == null && row.ours?.count >= 5 && row.belarus?.count >= 5)
    .map((row) => ({
      ...row,
      ourMedian:Math.round(row.ours.median),
      ourCount:row.ours.count,
      theirMedian:Math.round(row.belarus.median),
      theirLow:Math.round(row.belarus.min),
      theirCount:row.belarus.count,
      diff:Math.round(row.belarus.median - row.ours.median),
      diffPercent:Math.round(((row.belarus.median - row.ours.median) / row.belarus.median) * 100),
    }))
    .sort((left, right) => right.ourCount - left.ourCount)
    .slice(0, 1000);
  // Сравнение молча пустым быть не должно: если свод собран, а строк нет, значит
  // сборка не достала цены каталога (нет `SEO_CARS_FROM_DB=1` или база недоступна),
  // и страница уйдёт на сайт без главного блока.
  if (marketBelarus && !rows.length) {
    console.warn(`Сравнение с белорусским рынком не собрано: свод есть (${marketBelarus.listings || 0} объявлений), а цен каталога ${live.priceStats?.length ? "не хватило для совпадений" : "нет — сборка читала не базу"}.`);
  }
  // Марки каталога с числом машин — чтобы назвать и те, по которым сравнивать не с чем.
  const ourBrands = [...new Set(CATALOG_LANDINGS.filter((landing) => landing.brand).map((landing) => landing.brand))]
    .map((brand) => [brand, catalogBrandCount(brand)]);
  marketCompareCache = {
    rows,
    summary: compareSummary(rows),
    collectedAt: marketBelarus?.collectedAt || null,
    brands: brandCoverage({ ourBrands, rows, market: marketBelarus }),
  };
  return marketCompareCache;
}

function catalogBrandCount(brand) {
  const landing = brandLandingPath(brand);
  const fromDatabase = landing ? live.stock.get(landing) : null;
  if (Number.isFinite(fromDatabase)) return fromDatabase;
  return cars.reduce((total, car) => total + (car.brand === brand ? 1 : 0), 0);
}

function toolArticle(tool) {
  const paragraphs = (items) => items.map((text) => `<p>${linkifyText(text, hrefRoute)}</p>`).join("");
  const extras = (section) =>
    [
      // Ссылки внутри списков и врезок разбираются так же, как в абзацах: в статьях
      // журнала половина переходов в каталог живёт именно там.
      section.list ? `<dl>${section.list.map((item) => `<dt>${escapeHtml(item.term)}</dt><dd>${linkifyText(item.text, hrefRoute)}</dd>`).join("")}</dl>` : "",
      section.compare ? section.compare.map((option) => `<p><strong>${escapeHtml(option.name)}.</strong> ${linkifyText(option.text, hrefRoute)}</p>`).join("") : "",
      // Нумерованные шаги: обычный <ol>, номер рисует сам список.
      section.steps ? `<ol>${section.steps.map((step) => `<li><strong>${escapeHtml(step.title)}.</strong> ${linkifyText(step.text, hrefRoute)}</li>`).join("")}</ol>` : "",
      section.table
        ? `<table>${section.table.caption ? `<caption>${escapeHtml(section.table.caption)}</caption>` : ""}<thead><tr>${section.table.head
            .map((cell) => `<th>${escapeHtml(cell)}</th>`)
            .join("")}</tr></thead><tbody>${section.table.rows
            .map((row) => `<tr>${row.map((cell, index) => (index ? `<td>${escapeHtml(cell)}</td>` : `<th scope="row">${escapeHtml(cell)}</th>`)).join("")}</tr>`)
            .join("")}</tbody></table>`
        : "",
      // Свой график — та же разметка, что видит человек: рисует общий код.
      section.figure ? blogFigureHtml(section.figure) : "",
      section.callout ? `<p><strong>${escapeHtml(section.callout.title)}.</strong> ${linkifyText(section.callout.text, hrefRoute)}</p>` : "",
    ].join("");
  const sectionBlocks = tool.sections
    .map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${paragraphs(section.paragraphs)}${extras(section)}</section>`);
  // Полоса главных цифр: у человека это плитки под вступлением, здесь — строки списка.
  const stats = toolPageStats(tool.kind);
  const numbers = stats.length
    ? `<ul>${stats.map((stat) => `<li><strong>${escapeHtml(stat.value)}</strong> — ${escapeHtml(stat.label)}</li>`).join("")}</ul>`
    : "";
  // Таблица собирается из тех же функций, что и в приложении: одна цифра — одно место.
  const table = (data, heading = "h2") =>
    `<section><${heading}>${escapeHtml(data.title)}</${heading}><table><thead><tr>${data.columns
      .map((column) => `<th scope="col">${escapeHtml(column)}</th>`)
      .join("")}</tr></thead><tbody>${data.rows
      .map((row) => `<tr>${row.map((cell, index) => (index === 0 ? `<th scope="row">${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join("")}</tr>`)
      .join("")}</tbody></table><p>${escapeHtml(data.note)}</p></section>`;
  let live = "";
  if (tool.kind === "quota") {
    const state = evQuotaState();
    const rows = [...EV_QUOTA.reports].reverse().slice(0, 12);
    const personalStatus = state.exhausted
      ? `<p><strong>Квота для граждан выбрана полностью${state.exhaustedOnLabel ? ` ${escapeHtml(state.exhaustedOnLabel)}` : ""}.</strong> При дальнейшем ввозе электромобиля применяется пошлина 15% от стоимости машины.</p>`
      : `<p><strong>Гражданам доступно ещё ${number(state.remaining)} ${plural(state.remaining, "электромобиль", "электромобиля", "электромобилей")}</strong> из ${number(state.total)} по квоте ${EV_QUOTA.year} года — по сводке на ${escapeHtml(state.asOfLabel)}.</p>`;
    // Живая часть страницы: остаток, темп и история сводок. Это то, за чем сюда придут.
    live = `<section><h2>Сколько квоты на электромобили осталось сейчас</h2>${personalStatus}${
      !state.exhausted && state.perWeek ? `<p>Темп расхода — около ${number(state.perWeek)} машин в неделю.${state.runsOutLabel && !state.overdue ? ` При таком темпе квота заканчивается около ${escapeHtml(state.runsOutLabel)}.` : ""}</p>` : ""
    }<p>Квота для торгового оборота (юридические лица) объёмом ${number(EV_QUOTA.businessTotal)} машин выбрана полностью.</p></section><section><h2>Остаток по месяцам</h2><dl>${state.periods
      .map((period) => `<dt>${escapeHtml(period.label)}</dt><dd>${period.left == null ? "нет данных" : number(period.left)}</dd>`)
      .join("")}</dl></section><section><h2>История сводок таможни</h2><table><thead><tr><th scope="col">Дата сводки</th><th scope="col">Осталось у граждан</th><th scope="col">Осталось у юрлиц</th></tr></thead><tbody>${rows
      .map(([date, personal, business]) => `<tr><th scope="row">${escapeHtml(date)}</th><td>${personal === null ? "не названо" : number(personal)}</td><td>${business === null ? "не названо" : number(business)}</td></tr>`)
      .join("")}</tbody></table><p>Источник — сводки Государственного таможенного комитета. Квота ${EV_QUOTA.year} года вступила в силу ${escapeHtml(EV_QUOTA.startedOn)}.</p></section>`;
  }
  // Форму калькулятора рисует скрипт, а поисковик скриптов не запускает: до этой
  // правки по запросу «калькулятор растаможки» мы предлагали ему страницу, на
  // которой калькулятора нет. Поэтому здесь та же форма собирается обычной
  // разметкой — поля, варианты ответов и подписи, — а следом идут посчитанные
  // суммы и таблицы ставок. Поля берутся из одного описания с приложением.
  if (tool.kind === "customs") {
    // Заголовка над формой нет: страница и так называется калькулятором, второй
    // такой же заголовок сразу под первым был лишним. Дату курса называем здесь —
    // отдельной строки «ставки и курсы на такое-то число» на этой странице больше
    // нет, а поисковику и пересказывающему нас чат-боту дата нужна.
    live = `<section><form>${formHtml(calculatorFields(), "calc")}</form><p>Расчёт покажет ввозную пошлину, НДС, утилизационный и таможенный сборы отдельными строками и сумму платежа целиком — в белорусских рублях и в долларах, по курсу Национального банка на ${escapeHtml(PRICING.rateDate)}.</p></section>`;
    // Дальше — ровно тот же порядок, что у человека в раскрывающихся пунктах:
    // «что считает калькулятор», готовые суммы, ставки, разделы. Порядок и состав
    // блоков у человека и у поисковика должны совпадать, иначе это две разные
    // страницы. Разница только в обёртке: у человека всё свёрнуто, потому что за
    // страницей приходят посчитать, а не читать.
    sectionBlocks.unshift(
      table(customsExample()),
      `<section><h2>Ставки пошлины: полные таблицы</h2>${dutyRateTables().map((item) => table(item, "h3")).join("")}</section>`,
    );
  }
  const sections = sectionBlocks.join("");
  if (tool.kind === "cost") live = table(deliveryStages());
  // Сравнение с белорусским рынком: таблица «модель, там, у нас, разница» и вывод.
  if (tool.kind === "market") {
    const { rows, summary, collectedAt, brands } = marketCompare();
    // Марки, по которым сравнения нет, называем прямо: у человека своя марка, и
    // молчание о ней он прочитает как «не возят».
    const thin = brands.filter((item) => !item.matched);
    const thinBlock = thin.length
      ? `<section><h2>Марки, по которым сравнивать не с чем</h2><dl>${thin
        .map((item) => `<dt>${escapeHtml(item.brand)}</dt><dd>${number(item.cars)} ${plural(item.cars, "машина", "машины", "машин")} в каталоге — ${escapeHtml(coverageNote(item))}</dd>`)
        .join("")}</dl><p>Это не пробел в данных: таких машин на белорусском рынке почти нет в продаже, и сравнивать их не с чем. Привезти из Китая — единственный способ такую купить.</p></section>`
      : "";
    live = rows.length
      ? `<section><h2>Что это значит коротко</h2><p>Сравнили ${number(summary.models)} ${plural(summary.models, "набор", "набора", "наборов")} «модель и год выпуска», по которым предложения есть и в Беларуси, и у нас. Дешевле привезти из Китая ${number(summary.cheaper)} из них: там разница около ${summary.medianPercent}%. По остальным ${number(summary.dearer)} выгоднее купить машину, которая уже в Беларуси.${summary.bestSaving ? ` Больше всего выигрывает ${escapeHtml(`${summary.bestSaving.brand} ${summary.bestSaving.model}`)} ${summary.bestSaving.year} года: около ${number(summary.bestSaving.diff)} $.` : ""}</p></section>`
        + table(compareTable(rows.slice(0, STATIC_COMPARE_ROWS), {
          collectedAt,
          hidden: Math.max(0, rows.length - STATIC_COMPARE_ROWS),
        }))
        + thinBlock
      : thinBlock;
  }
  // Запас хода: форма, готовая таблица «паспорт → зима» и разбор по температурам.
  // Числа считает тот же модуль, что и форму у человека (src/range-estimate.js).
  if (tool.kind === "range") {
    live = `<section><h2>Посчитать реальный запас хода</h2><form>${formHtml(rangeFields(), "range")}</form><p>Расчёт переводит паспортную цифру в реальную: приводит цикл измерения к честному, отнимает потери на мороз и скорость, учитывает химию батареи, тепловой насос и возраст машины.</p></section>`
      + table(ratedToWinterTable())
      + table(rangeTable({ rated: 500 }));
  }
  // Справочник марок. Для человека это карточки со значками, здесь — две таблицы:
  // поисковику нужны текст и ссылки, а значки идут теми же файлами, что в каталоге.
  // Числа считаем по тому же дампу, из которого собираются разделы, поэтому «в
  // каталоге 112 машин» в справочнике и в разделе марки — одно и то же число.
  if (tool.kind === "brands") {
    // Числа берём оттуда же, откуда их берут разделы каталога: на сервере это база
    // (`live.stock`), а при сборке с дампом — сам дамп. Своего запроса страница не
    // делает, иначе справочник и раздел марки показывали бы разные числа.
    const brandRow = (item) => {
      const landing = brandLandingPath(item.brand);
      const count = catalogBrandCount(item.brand);
      const title = landing && count
        ? `<a href="${escapeHtml(hrefRoute(`${landing}/`))}">${escapeHtml(item.brand)}</a>`
        : escapeHtml(item.brand);
      const logo = `<img src="${escapeHtml(hrefRoute(`/brands/${item.logo}.svg`))}" alt="Значок ${escapeHtml(item.brand)}" width="40" height="40" loading="lazy" />`;
      const say = item.say ? `${escapeHtml(item.say)}${item.chinese ? ` · ${escapeHtml(item.chinese)}` : ""}` : "—";
      const group = item.group || (item.partner ? `В Китае — вместе с ${item.partner}` : "");
      return `<tr><td>${logo}</td><th scope="row">${title}</th><td>${say}</td><td>${escapeHtml(group)}${item.since ? `, с ${item.since} года` : ""}</td><td>${escapeHtml(item.about)}</td><td>${count ? `${number(count)} ${plural(count, "машина", "машины", "машин")}` : "нет"}</td></tr>`;
    };
    const head = "<thead><tr><th scope=\"col\">Значок</th><th scope=\"col\">Марка</th><th scope=\"col\">Как читается</th><th scope=\"col\">Кому принадлежит</th><th scope=\"col\">Чем занимается</th><th scope=\"col\">В каталоге</th></tr></thead>";
    live = `<section><h2>Китайские марки</h2><table>${head}<tbody>${CHINA_BRANDS.map(brandRow).join("")}</tbody></table></section>`
      + `<section><h2>Привычные марки, которые делают в Китае</h2><table>${head}<tbody>${CHINA_MADE_FOREIGN.map(brandRow).join("")}</tbody></table></section>`;
  }
  // Частые вопросы: в странице это обычный текст, разметку FAQPage добавляем отдельно.
  const faq = tool.faq?.length
    ? `<section><h2>Частые вопросы</h2>${tool.faq.map((item) => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`).join("")}</section>`
    : "";
  // Переходы к остальным расчётам: у человека это карточки-ссылки в конце страницы.
  const others = TOOL_PAGES.filter((page) => page.path !== tool.path);
  const links = `<section><h2>Другие расчёты</h2><ul>${others
    .map((page) => `<li><a href="${hrefRoute(`${page.path}/`)}">${escapeHtml(page.name)}</a> — ${escapeHtml(page.lead)}</li>`)
    .join("")}</ul></section>`;
  // Дата данных — первой строкой, до вступления: за этими страницами приходят за
  // цифрой, и первый вопрос к цифре всегда «на когда». Та же строка стоит у человека
  // под заголовком, текст берётся из одного места (src/tool-pages.js).
  const updatedLabel = toolUpdatedLabel(tool);
  // На страницах-расчётах отдельной строки с датой нет: у растаможки курс с датой
  // назван прямо под формой, а у запаса хода ставок и курсов нет вовсе.
  const formPage = tool.kind === "customs" || tool.kind === "range";
  const updated = updatedLabel && !formPage ? `<p class="seo-updated">${escapeHtml(updatedLabel)}.</p>` : "";
  // У расчётов вступление и полоса ставок перенесены внутрь свёрнутых пунктов:
  // наверху страницы остаётся только форма.
  const lead = formPage || tool.kind === "market" ? "" : `${paragraphs(tool.intro)}${numbers}`;
  // На сравнении цен вступление стоит под таблицей — так же, как у человека на
  // странице: сначала цифры, объяснение следом.
  const afterLive = tool.kind === "market" ? paragraphs(tool.intro) : "";
  return `${updated}${lead}${live}${afterLive}${sections}${faq}${links}<p>${escapeHtml(tool.disclaimer)}</p>`;
}

function infoArticle(route) {
  const list = (items) => `<dl>${items.map(([term, text]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(text)}</dd>`).join("")}</dl>`;
  if (route === "/") {
    // Главная — самая массовая страница по запросам и была самой пустой: 44 слова.
    return `<section><h2>Как проходит покупка</h2>${HOME_ORDER_STEPS.map(
      (step) => `<h3>${escapeHtml(step.number)}. ${escapeHtml(step.title)}</h3><p>${escapeHtml(step.description)}</p>`,
    ).join("")}</section><section><h2>Частые вопросы о покупке и доставке б/у авто из Китая</h2><p>${escapeHtml(HOME_FAQ_LEAD)}</p>${HOME_FAQ.map(
      (item) => `<h3>${escapeHtml(item.question)}</h3><p>${linkifyText(item.answer, hrefRoute)}</p>`,
    ).join("")}<p><a href="${hrefRoute("/faq/")}">Все вопросы и ответы</a></p></section>`;
  }
  if (route === "/faq/") {
    return FAQ_GROUPS.map(
      (group) => `<section><h2>${escapeHtml(group.title)}</h2>${group.items.map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`).join("")}</section>`,
    ).join("");
  }
  if (route === "/tracking/") {
    return `<section><h2>Частые вопросы</h2>${TRACKING_FAQ.map((item) => `<h3>${escapeHtml(item.question)}</h3><p>${escapeHtml(item.answer)}</p>`).join("")}</section>`;
  }
  if (route === "/contacts/") {
    const rows = [
      ["Город", COMPANY.address],
      ["Время работы", COMPANY.hours],
      ["Электронная почта", COMPANY.email],
      ["Telegram", COMPANY.telegram],
    ].filter(([, value]) => value);
    return `<section><h2>Как с нами связаться</h2>${list(rows)}<p>Расскажем про подбор, проверку автомобиля в Китае, договор, доставку и оформление в Минске. Ответим и без обязательства что-то покупать.</p><p>До обращения можно посмотреть <a href="${hrefRoute("/")}">автомобили из Китая с расчётом до Минска</a>.</p></section>`;
  }
  if (route === "/how-it-works/") {
    const report = SERVICE_REPORT_EXAMPLE;
    const reportPhotos = report.photoGroups.flatMap((group) => group.photos);
    const reportPhotoGroups = list(report.photoGroups.map((group) => [
      group.title,
      group.result,
    ]));
    const inspectionStatusLabels = {
      clear: "Без замечаний",
      attention: "Есть замечание",
      limited: "Осмотр ограничен",
      "not-applicable": "Не предусмотрено конструкцией",
    };
    const reportInspection = report.inspectionSections?.length
      ? `<h3>${escapeHtml(report.labels.inspectionTitle || "Что именно проверили")}</h3>${report.inspectionSections.map((section) => `<h4>${escapeHtml(section.title)}</h4>${list(section.points.map((point) => [point.label, inspectionStatusLabels[point.status] || inspectionStatusLabels.clear]))}`).join("")}`
      : "";
    const reportLimitations = report.limitations?.items?.length
      ? `<h3>${escapeHtml(report.limitations.title)}</h3><ul>${report.limitations.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : "";
    const reportRecommendation = report.recommendation
      ? `<h3>${escapeHtml(report.recommendation.eyebrow)}</h3><h4>${escapeHtml(report.recommendation.title)}</h4><p>${escapeHtml(report.recommendation.summary)}</p><ol>${report.recommendation.steps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
      : "";
    const reportPowertrainNote = report.powertrainNote?.text ? `<p>${escapeHtml(report.powertrainNote.text)}</p>` : "";
    return `<p>Актуальные <a href="${hrefRoute("/")}">б/у авто из Китая с доставкой в Беларусь</a> собраны на главной.</p><section><h2>Что входит в сервис</h2>${list(SERVICE_PROOF.map((item) => [item.title, item.text]))}</section><section><h2>${escapeHtml(SERVICE_SECTIONS[0].title)}</h2><p>${escapeHtml(SERVICE_SECTIONS[0].text)}</p><p>До оплаты автомобиля вы получите:</p><ul>${BEFORE_PAYMENT.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section><section><h2>Проверка и связь</h2>${list(ABOUT_PRINCIPLES.map((item) => [item.title, item.text]))}</section><section><h2>Покупка авто: от выбора до ключей</h2>${list(PURCHASE_FLOW_STEPS.map((item) => [item.title, item.text]))}</section><section><h2>${escapeHtml(report.presentation.title)}</h2><h3>${escapeHtml(report.vehicle.name)}</h3><p><strong>${escapeHtml(report.verdict.title)}.</strong> ${escapeHtml(report.verdict.summary)}</p>${list(report.risks.map((item) => [item.title, [item.status, item.note].filter(Boolean).join(". ")]))}${reportInspection}<h3>${escapeHtml(report.labels.evidenceTitle)}</h3>${reportPhotoGroups}<h3>${escapeHtml(report.labels.factsTitle)}</h3>${list(report.facts.map((item) => [item.label, item.metric === "photoCount" ? String(reportPhotos.length) : item.value]))}<h3>${escapeHtml(report.labels.findingsTitle)}</h3><ul>${report.findings.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>${reportLimitations}${reportRecommendation}${reportPowertrainNote}</section>`;
  }
  const legal = route === "/privacy/" ? LEGAL_COPY.privacy : route === "/terms/" ? LEGAL_COPY.terms : null;
  if (legal) {
    return `${LEGAL_DRAFT ? `<p>${escapeHtml(LEGAL_DRAFT_NOTE)}</p>` : ""}<p>${escapeHtml(legal.intro)}</p>${legal.sections.map(([title, text]) => `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`).join("")}<p>Редакция от ${escapeHtml(legal.updated)}.</p>`;
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
/**
 * Своя картинка материала — та же, что видит человек в приложении. Отдаём её и
 * поисковику: страница без изображения над текстом читается как заготовка.
 */
function blogOwnCover(post) {
  if (!post.cover?.src) return "";
  const image = hrefRoute(`${post.cover.src}-hero.jpg`);
  return `<figure><img src="${escapeHtml(image)}" alt="${escapeHtml(post.cover.alt || "")}" width="1200" height="675" /></figure>`;
}

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

/**
 * Рекламная врезка после первого абзаца вступления — то же, что видит человек в
 * приложении (ArticleCatalog в src/App.jsx), но версткой попроще, как и весь этот файл:
 * строка и ссылка в каталог. Число объявлений берём из каталога и округляем вниз до
 * тысяч — так же, как в кнопке приложения; без каталога ссылка остаётся без числа.
 */
function blogAdBlock() {
  const total = live.activeCars || 0;
  const listings = total >= 1000 ? `${number(Math.floor(total / 1000) * 1000)} объявлений` : "Смотреть каталог";
  const updated = catalogUpdatedLabel(live.catalogRefreshedAt);
  return `<aside><p>abcars.by — это маркетплейс б/у авто из Китая. <a href="${hrefRoute("/catalog/")}">${escapeHtml(listings)}</a>${
    updated ? ` <span class="seo-updated">Каталог обновлён ${escapeHtml(updated)}.</span>` : ""
  }</p></aside>`;
}

/** Дата актуализации словами — как в приложении: «6 сентября 2026». */
function catalogUpdatedLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(date).replace(/\s*г\.$/, "");
}

/** Вступление материала с этой врезкой после первого абзаца. */
function blogIntroWithAd(post) {
  const items = post.intro || [];
  if (!items.length) return blogAdBlock();
  return items.map((value, index) => `<p>${linkifyText(value, hrefRoute)}</p>${index === 0 ? blogAdBlock() : ""}`).join("");
}

function blogArticleBody(text, cars = [], shown = new Set()) {
  const paragraphs = (items) => (items || []).map((value) => `<p>${linkifyText(value, hrefRoute)}</p>`).join("");
  const extras = (section) =>
    [
      // Подразделы: маленький заголовок и абзацы под ним — разбивка длинного раздела.
      section.parts ? section.parts.map((part) => `<h3>${escapeHtml(part.title)}</h3>${paragraphs(part.paragraphs)}`).join("") : "",
      // Ссылки внутри списков и врезок разбираются так же, как в абзацах: в статьях
      // журнала половина переходов в каталог живёт именно там.
      section.list ? `<dl>${section.list.map((item) => `<dt>${escapeHtml(item.term)}</dt><dd>${linkifyText(item.text, hrefRoute)}</dd>`).join("")}</dl>` : "",
      section.compare ? section.compare.map((option) => `<p><strong>${escapeHtml(option.name)}.</strong> ${linkifyText(option.text, hrefRoute)}</p>`).join("") : "",
      // Нумерованные шаги: обычный <ol>, номер рисует сам список.
      section.steps ? `<ol>${section.steps.map((step) => `<li><strong>${escapeHtml(step.title)}.</strong> ${linkifyText(step.text, hrefRoute)}</li>`).join("")}</ol>` : "",
      section.table
        ? `<table>${section.table.caption ? `<caption>${escapeHtml(section.table.caption)}</caption>` : ""}<thead><tr>${section.table.head
            .map((cell) => `<th>${escapeHtml(cell)}</th>`)
            .join("")}</tr></thead><tbody>${section.table.rows
            .map((row) => `<tr>${row.map((cell, index) => (index ? `<td>${escapeHtml(cell)}</td>` : `<th scope="row">${escapeHtml(cell)}</th>`)).join("")}</tr>`)
            .join("")}</tbody></table>`
        : "",
      // Свой график — та же разметка, что видит человек: рисует общий код.
      section.figure ? blogFigureHtml(section.figure) : "",
      section.callout ? `<p><strong>${escapeHtml(section.callout.title)}.</strong> ${linkifyText(section.callout.text, hrefRoute)}</p>` : "",
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
  const intro = blogIntroWithAd(post);
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
          const photo = source ? `<img src="${escapeHtml(photoHref(source, 600))}" alt="${title}" loading="lazy" />` : "";
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
  return `${date}${hero}${intro}${table}${blogArticleBody(post, photoCars)}${offers}${faq}${blogSources(post)}${blogCatalogWays(post)}${blogModelWays(post)}${rest}${post.disclaimer ? `<p>${escapeHtml(post.disclaimer)}</p>` : ""}`;
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
  const intro = blogIntroWithAd(post);
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
    ${blogArticleBody(post, [], new Set())}${faq}${blogSources(post)}${blogCatalogWays(post)}${post.disclaimer ? `<p>${escapeHtml(post.disclaimer)}</p>` : ""}`;
}

/**
 * Статья для поисковика: связный текст с фотографиями настоящих машин, без списка
 * объявлений. Разделы те же, что видит человек, включая шаги, таблицы и графики —
 * их рисует общий `blogArticleBody`.
 */
function blogArticleArticle(post) {
  const found = live.collections.get(post.slug) || null;
  const photos = found?.cars || [];
  const published = blogPostDateLabel(post);
  const rubric = `<a href="${hrefRoute(`${BLOG_INDEX.path}/`)}">${escapeHtml(blogPostTags(post)[0]?.name || BLOG_INDEX.name)}</a>`;
  const date = `<p>${rubric}${published ? ` · ${escapeHtml(published)}` : ""}</p>`;
  const intro = blogIntroWithAd(post);
  const cover = blogOwnCover(post) || (photos[0] ? blogFigure(photos[0], 0) : "");
  const faq = post.faq?.length
    ? `<section><h2>Частые вопросы</h2>${post.faq.map((item) => `<h3>${escapeHtml(item.q)}</h3><p>${linkifyText(item.a, hrefRoute)}</p>`).join("")}</section>`
    : "";
  return `${date}${cover}${intro}${blogArticleBody(post, photos, new Set([photos[0]?.id]))}${faq}${blogSources(post)}${blogCatalogWays(post)}${blogModelWays(post)}${post.disclaimer ? `<p>${escapeHtml(post.disclaimer)}</p>` : ""}`;
}

/**
 * Список первоисточников внизу материала: откуда взяты ставки, сроки и нормы.
 *
 * Ссылки наружу отдаём с `rel="nofollow"` — вес чужому сайту не передаём (решение
 * Сергея 08.09.2026), а `noreferrer` не сообщает чужому сайту, с какой страницы
 * пришли. Блок общий для всех четырёх видов материалов: без него текст про пошлины
 * ничем не отличается от пересказа слухов.
 */
function blogSources(post) {
  if (!post.sources?.length) return "";
  const items = post.sources
    .map((source) => `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(source.name)}</a>${source.note ? ` — ${escapeHtml(source.note)}` : ""}</li>`)
    .join("");
  return `<section><h2>Источники</h2><ul>${items}</ul></section>`;
}

function blogPostArticle(post) {
  if (post.kind === "article") return blogArticleArticle(post);
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
  const intro = blogIntroWithAd(post);
  // Открывающая фотография — сразу после описания, до текста.
  const cover = blogOwnCover(post) || (found?.cover ? blogFigure(found.cover, 0) : "");
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
          const photo = source ? `<img src="${escapeHtml(photoHref(source, 600))}" alt="${title}" loading="lazy" />` : "";
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
  return `${date}${cover}${intro}${numbers}${offers}${blogArticleBody(post, found?.cars || [], new Set([found?.cover?.id, ...top.map((car) => car.id)]))}${faq}${blogSources(post)}${blogCatalogWays(post)}${blogModelWays(post)}${rest}${post.disclaimer ? `<p>${escapeHtml(post.disclaimer)}</p>` : ""}`;
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

// Популярные модели для главной (src/home-popular-models.js). Главная собирается при
// сборке (scripts/prerender-home.mjs), поэтому список считаем здесь же и кладём рядом со
// сборкой: он попадёт и в готовую разметку, и в данные для оживления — первый кадр в
// браузере совпадёт с сервером.
// Из базы приходит полная сводка по моделям (с годами и снимком); из дампа каталога —
// только счётчики.
const { models: popularModels, brands: brandModelTabs } = homePopularModels(live.modelRows || [...live.models].map(([key, count]) => {
  const [brand, model] = key.split("|");
  return { brand, model, count, priceMin: live.modelPrices?.get(key) };
}));
// Витрина главной — те же машины, что в списке для поисковика: приложение рисует их
// в готовой разметке, и робот видит на главной машины с ценами, а не пустой блок.
// Карточка витрины показывает не больше пяти кадров (HoverImagePreview) — остальные
// фото и история цены в странице только утяжелили бы главную.
const homeShowcase = live.showcase.map(({ images, priceHistory: _history, ...car }) => ({ ...car, images: Array.isArray(images) ? images.slice(0, 5) : images }));
writeFileSync(path.join(path.dirname(clientDir), "popular-models.json"), `${JSON.stringify({ models: popularModels, brands: brandModelTabs, showcase: homeShowcase })}\n`);

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
  // Своя картинка материала — она же и в соцсетях: там показывается то же, что
  // человек увидит наверху статьи.
  if (post.cover?.src) return routeUrl(`${post.cover.src}-hero.jpg`);
  const found = live.collections.get(post.slug) || null;
  // У статьи нет отдельной обложки: картинка для соцсетей — тот же первый кадр,
  // с которого материал начинается.
  const car = found?.cover || found?.duel?.find((entry) => entry.hero)?.hero || (post.kind === "article" ? found?.cars?.[0] : null) || null;
  const source = car?.images?.length ? car.images[0] : car?.image;
  return /^https:\/\//.test(String(source || "")) ? new URL(photoHref(source, 1400), routeUrl("/")).href : undefined;
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
      author: { "@type": "Organization", name: COMPANY.schemaName, url: routeUrl("/") },
      publisher: { "@type": "Organization", name: COMPANY.schemaName, url: routeUrl("/") },
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
      publisher: { "@type": "Organization", name: COMPANY.schemaName, url: routeUrl("/") },
    });
  }
  if (page.route === "/") {
    schemas.unshift(renderer.organizationSchema(), renderer.webSiteSchema());
    schemas.push(renderer.faqSchema(HOME_FAQ.map((item) => ({ q: item.question, a: item.answer }))));
  }
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
  const name = PRIVATE_ROUTE_NAMES[route] || "Личный раздел";
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
// Снимок у адреса — расширение image-sitemap: одна картинка на машину, первая в
// галерее, с нашего кэша (см. carSitemapPhoto). Пространство имён объявляем только
// когда картинки есть, иначе валидаторы ругаются на неиспользуемый префикс.
const urlset = (entries) => {
  const withImages = entries.some((entry) => entry.image);
  const open = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${withImages ? ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"` : ""}>`;
  const item = ({ loc, lastmod, image }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}${image ? `<image:image><image:loc>${escapeXml(image)}</image:loc></image:image>` : ""}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n${open}\n${entries.map(item).join("\n")}\n</urlset>\n`;
};

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
  const nothing = { showcase: [], models: new Map(), modelChanged: new Map(), carEntries: [], activeCars: 0, catalogRefreshedAt: null, listPages: new Map(), stock: new Map(), collections: new Map(), changed: new Map(), priceStats: [] };
  if (cars.length) {
    return {
      showcase: cars.slice(0, showcaseSize),
      models: countByModel(cars),
      modelChanged: new Map(),
      carEntries: carsSitemap ? cars.map((car) => ({ loc: routeUrl(carRoute(car)), lastmod: isoDate(car.updated || car.importedAt), image: carSitemapPhoto(car.image || car.images?.[0]) })) : [],
      listPages: new Map(),
      stock: new Map(),
      collections: new Map(),
      changed: new Map(),
      priceStats: [],
    };
  }
  if (!carsFromDatabase) {
    console.warn("Витрина главной, счётчики моделей и карта сайта с машинами не собраны: дампа каталога нет, а чтение из базы не разрешено (SEO_CARS_FROM_DB=1).");
    return nothing;
  }
  let pool = null;
  try {
    ({ pool } = await import("../server/db.mjs"));
    const { getModelFacts, listCars, modelPriceStats, modelSummary, sectionStats } = await import("../server/repository.mjs");
    // Витрина: по одной машине на модель и в случайном порядке. Обычная сортировка
    // здесь не годится — «самые новые» это то, что записал последний импорт, и одна
    // модель займёт весь блок.
    const showcaseAnswer = await listCars(new URLSearchParams({ sort: "variety", limit: String(showcaseSize) }));
    const showcase = showcaseAnswer.items;
    const facts = await getModelFacts();
    // `content_changed_at` ставится только когда данные объявления действительно
    // изменились (см. миграцию 021). `imported_at` для этого не годится: она одинаковая
    // у всех карточек, потому что приходит из последнего полного импорта, — и поисковику
    // мы сообщали «ничего не менялось» даже при изменении цены.
    // Выборка машин для карты сайта. Без ограничения — все активные объявления;
    // с ограничением — по `carsPerModelInSitemap` карточек на каждую модель, и первыми
    // идут те, у которых есть фотографии и которые недавно менялись: такая карточка
    // и роботу полезнее, и человеку из выдачи.
    // Первый снимок каждой машины — из той же таблицы, что и галерея карточки.
    const firstPhoto = "(SELECT m.url FROM listing_media m WHERE m.listing_id = l.id ORDER BY m.position LIMIT 1)";
    const rows = !carsSitemap
      ? []
      : carsPerModelInSitemap
        ? (await pool.query(`WITH ranked AS (
            SELECT l.id,
              COALESCE(l.content_changed_at, l.imported_at) AS changed_at,
              ${firstPhoto} AS image,
              row_number() OVER (
                PARTITION BY v.brand, v.model
                ORDER BY EXISTS (SELECT 1 FROM listing_media m WHERE m.listing_id = l.id) DESC,
                  COALESCE(l.content_changed_at, l.imported_at) DESC
              ) AS place
            FROM listings l JOIN vehicles v ON v.id = l.vehicle_id
            WHERE l.status = 'active'
          )
          SELECT id, changed_at, image FROM ranked WHERE place <= $1`, [carsPerModelInSitemap])).rows
        // Все живые объявления; сначала те, что менялись недавно, — так первый файл
        // карты всегда держит самое свежее.
        : (await pool.query(`SELECT l.id, COALESCE(l.content_changed_at, l.imported_at) AS changed_at, ${firstPhoto} AS image
            FROM listings l WHERE l.status='active'
            ORDER BY COALESCE(l.content_changed_at, l.imported_at) DESC, l.id`)).rows;
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
    for (const post of BLOG_ENABLED ? blogAllPosts() : []) {
      // Отчёт живого среза каталога не требует: все его цифры уже посчитаны.
      if (post.kind === "report") continue;
      // Статье нужны только фотографии: списка объявлений в ней нет, и правила
      // отбора тоже — срез для кадров задан отдельным полем `photos`.
      if (post.kind === "article") {
        if (!post.photos?.filters) continue;
        const shots = await listCars(blogListParams({ slug: post.slug, filters: post.photos.filters }, "6"));
        collections.set(post.slug, { cars: shots.items.filter((car) => car.images?.length || car.image), total: shots.total, changedAt: shots.changedAt || null });
        continue;
      }
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
      // Сводка целиком — для карточек «Популярные модели» на главной (src/home-popular-models.js).
      modelRows: facts.models,
      // Цена «от» по модели (сохранённая оценка до Минска) — для вкладок марок на главной.
      modelPrices: new Map(facts.models.map((row) => [`${row.brand}|${row.model}`, row.priceMin])),
      // Дата последнего изменения по каждой модели — для `lastmod` у обзоров.
      modelChanged: new Map(facts.models.map((row) => [`${row.brand}|${row.model}`, isoDate(row.changedAt)])),
      carEntries: rows.map((row) => ({ loc: routeUrl(`/cars/${encodeURIComponent(listingNumber(row.id))}/`), lastmod: isoDate(row.changed_at), image: carSitemapPhoto(row.image) })),
      activeCars: whole.total,
      // Когда каталог последний раз проверяли — та же дата и из того же места, что
      // приложение пишет на главной и в рекламной врезке статьи: последняя отметка
      // проверки по всему каталогу. У `sectionStats` её нет, поэтому берём из ответа
      // на обычный запрос списка.
      catalogRefreshedAt: showcaseAnswer.refreshedAt || null,
      listPages,
      stock,
      changed,
      // Полная статистика по модели, году, типу двигателя и пробегу нужна той же
      // странице сравнения, чтобы её серверная разметка совпадала с приложением.
      priceStats: await modelPriceStats(),
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
  const deep = Math.min(Math.max(0, pages - 1), listPagesInSitemap);
  return Array.from({ length: deep }, (_, index) => ({ loc: `${routeUrl(route)}?page=${index + 2}`, lastmod }));
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

const modelPageEntries = () => {
  const seen = new Set();
  const entries = [];
  const reviewed = new Set(MODEL_PAGES.map((page) => `${page.brand}|${page.model}`));
  for (const [key, count] of live.models) {
    const [brand, model] = key.split("|");
    const path = modelLandingPath(brand, model);
    if (!path || seen.has(path)) continue;
    // Тонкие страницы моделей (без обзора и меньше трёх машин) закрыты от индексации —
    // в карте сайта им не место.
    if (!reviewed.has(key) && (Number(count) || 0) < 3) continue;
    seen.add(path);
    entries.push({ loc: routeUrl(path), lastmod: live.modelChanged.get(key) || null });
  }
  for (const modelPage of MODEL_PAGES) {
    if (seen.has(modelPage.path)) continue;
    seen.add(modelPage.path);
    entries.push({ loc: routeUrl(modelPage.path), lastmod: live.modelChanged.get(`${modelPage.brand}|${modelPage.model}`) || null });
  }
  return entries;
};

const pageEntries = [
  // Черновики (образец отчёта) в карту сайта не идут: их страница собрана только
  // ради прямой ссылки и закрыта от индексации.
  // «/faq» — не страница: посетителя приложение сразу уводит к вопросам на «О сервисе»,
  // а сервер с 26.09.2026 отвечает постоянным перебросом туда же (nginx). Отдельный
  // текст вопросов видел только робот.
  ...publicPages.filter((page) => (!page.post || !blogPostHidden(page.post)) && page.route !== "/faq/").map((page) => ({
    loc: routeUrl(page.route),
    lastmod: page.post ? blogLastmod(page.post) : page.blogIndex ? blogIndexLastmod : page.tool ? toolLastmod(page.tool) : null,
  })),
  // Каталог и его разделы файлами не собираются, но в карте сайта им место. Дата —
  // последнее настоящее изменение среди машин раздела: до 30.08.2026 все 3 600 адресов
  // разделов и обзоров уходили в карту сайта вовсе без даты, и поисковик не знал, что
  // раздел обновляется каждую ночь.
  { loc: routeUrl("/catalog/"), lastmod: live.changed.get("/catalog") || null },
  ...listPageEntries("/catalog/"),
  // Каталожные страницы моделей: все модели с машинами (адрес по марке и модели)
  // плюс обзоры моделей, которых сейчас нет в наличии, — у них есть текст.
  ...modelPageEntries(),
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
const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps.map((name) => `  <sitemap><loc>${escapeXml(siteUrl)}/${name}</loc></sitemap>`).join("\n")}\n</sitemapindex>\n`;
// Один и тот же указатель под двумя именами: с токеном — для адреса, который уже
// зарегистрирован в Search Console и Вебмастере; `/sitemap.xml` — для строки в
// robots.txt и для роботов, которые ищут карту по обычному адресу. До 25.09.2026
// по `/sitemap.xml` отвечала страница приложения с кодом 200.
writeFileSync(path.join(clientDir, sitemapIndexName), sitemapIndexXml);
writeFileSync(path.join(clientDir, publicSitemapName), sitemapIndexXml);
// Прежние имена частей карты в сборке не оставляем: устаревший файл уводил бы робота
// на адреса, которых уже нет.
for (const stale of ["sitemap-pages.xml", "sitemap-cars.xml"]) {
  if (!sitemaps.includes(stale)) rmSync(path.join(clientDir, stale), { force:true });
}

const robots = allowIndexing
  // Строка `Sitemap:` — открытый адрес указателя карты (см. publicSitemapName): без неё
  // робот, не знающий зарегистрированного адреса с токеном, карты не находил вовсе.
  // Запреты пишем без косой черты на конце и с якорем `$`, где нужно точное совпадение.
  // Это не мелочь: в robots.txt адрес сравнивается по началу строки, поэтому «/car»
  // запрещал заодно и «/cars/59372753» — то есть все 31 тысячу карточек, ради которых
  // всё и делалось. А «/account/» наоборот не покрывал сам «/account»: хостинг настроен
  // на адреса без черты. Проверка правил живёт в tests/robots-rules.test.mjs.
  ? [
      "User-agent: *",
      "Allow: /",
      "Disallow: /api",
      // Public rendering resources; account/admin endpoints stay disallowed.
      "Allow: /api/cars$",
      "Allow: /api/cars?",
      "Allow: /api/cars/",
      "Allow: /api/catalog/meta$",
      "Allow: /api/catalog/meta?",
      "Allow: /api/model-facts$",
      "Allow: /api/model-facts?",
      "Allow: /api/brand-guide$",
      "Allow: /api/brand-guide?",
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
      // `mileageTo` — фильтр каталожной страницы модели (/catalog/<марка>/<модель>);
      // `page` в списке нет намеренно: страницы списка — отдельные адреса.
      "Clean-param: sort&model&color&drive&yearFrom&yearTo&priceFrom&priceTo&mileage&mileageTo&owners&battery&range&accel&tire&torque&condition&q /catalog",
      // Поля калькулятора: по ссылке на конкретный расчёт открывается та же страница
      // с теми же текстами, и в выдаче она должна быть одна, а не по адресу на каждую
      // введённую цену.
      `Clean-param: ${calcParamNames().join("&")} /customs`,
      `Clean-param: ${rangeParamNames().join("&")} /range`,
      "",
      `Sitemap: ${siteUrl}/${publicSitemapName}`,
      "",
      // Оптовые обходчики каталогов: сервер грузят как настоящая толпа, а взамен не
      // дают ничего — ни выдачи, ни посетителей. Поисковиков (Google, Яндекс, Bing,
      // Apple, DuckDuckGo) в списке нет намеренно: их обход и выдача остаются как были.
      //
      // 18.09.2026 из этого списка убраны сборщики текстов для обучения моделей —
      // GPTBot, ClaudeBot, CCBot, Google-Extended, Applebot-Extended, cohere-ai,
      // meta-externalagent, Amazonbot. Причина: переходы людей из ChatGPT за две
      // недели выросли с одного-двух в день до двух десятков, и обучающий обход —
      // единственный способ попасть в ответ, когда бот не лезет в поиск. Пока они
      // были закрыты, модель могла сослаться на нас только через живой поиск.
      // От наплыва защищает не запрет, а отдельная полоса частоты в nginx
      // (abcars-bots.conf): им разрешено 2 запроса в секунду, а не 60.
      //
      // Роботы, которые приводят людей по ссылкам (OAI-SearchBot у ChatGPT,
      // PerplexityBot), открыты и раньше: это источник посетителей.
      // Список — просьба, а не запрет: честные роботы его соблюдают, остальных
      // останавливает настройка сервера (сниппет nginx abcars-bots.conf).
      //
      // Bytespider и PetalBot остаются закрытыми: обходят агрессивно, а выдача у них
      // китайская — посетителей из Беларуси она не приносит.
      "User-agent: Bytespider",
      "User-agent: Diffbot",
      "User-agent: Omgilibot",
      "User-agent: ImagesiftBot",
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

// `/llms-full.txt` — развёрнутая справка о сайте для языковых моделей.
//
// Зачем отдельный файл рядом с коротким `llms.txt` (он лежит в public/ и написан
// руками): короткий отвечает на вопрос «что это за сайт», а пересказывающему нас
// чат-боту нужны сами факты — сколько машин, по каким правилам считается ввоз, на
// какое число цифры. Без них модель берёт числа из своей памяти, а память у неё
// годовой давности: там квота ещё действует и пошлины у электромобиля нет.
//
// Файл собирается вместе с сайтом, поэтому цифры в нём те же, что в каталоге, и
// устареть отдельно от сайта не могут. Ничего, чего нет на самих страницах, здесь
// не появляется: это оглавление к фактам, а не второй источник правды.
const llmsFull = () => {
  const quota = evQuotaState({ audience: "personal" });
  const stock = (path) => live.stock.get(path) || 0;
  const brandSections = liveSections.filter((landing) => landing.kind === "brand");
  const posts = blogAllPosts().filter((post) => !blogPostHidden(post));
  const day = (value) => catalogUpdatedLabel(value) || null;
  // День, когда сводка таможни впервые показала у граждан ноль.
  const quotaZeroOn = EV_QUOTA.reports.find(([, personal]) => personal !== null && personal <= 0)?.[0] || null;
  const line = (label, value) => (value ? `- ${label}: ${value}` : null);
  // Отбрасываем только пропущенные строки (null), но не пустые: пустая строка здесь —
  // это отбивка между разделами, без неё файл слипается в одну простыню.
  const block = (...lines) => lines.filter((item) => item !== null && item !== undefined).join("\n");
  return `${block(
    "# abcars.by — б/у автомобили из Китая в Беларусь: факты для пересказа",
    "",
    "Сервис подбора подержанных машин с китайского рынка с расчётом цены до Минска. У каждой",
    "машины показаны цена продавца в Китае и расчётная стоимость до Минска: доставка, таможенные",
    "платежи, утилизационный сбор, подбор и сопровождение. Ввоз организуют компании-импортёры, с которыми",
    "работает сервис. Сайт на русском языке.",
    "",
    `Файл собран ${day(new Date().toISOString())}. Цифры пересобираются вместе с сайтом каждую ночь.`,
    "",
    "## Каталог",
    "",
    line("Активных объявлений", live.activeCars ? number(live.activeCars) : null),
    line("Каталог последний раз проверялся", day(live.catalogRefreshedAt)),
    line("Электромобили", stock("/catalog/electric") ? number(stock("/catalog/electric")) : null),
    line("Гибриды", stock("/catalog/hybrid") ? number(stock("/catalog/hybrid")) : null),
    line("Бензиновые", stock("/catalog/petrol") ? number(stock("/catalog/petrol")) : null),
    line("Марок в наличии", brandSections.length ? number(brandSections.length) : null),
    line("Разделов каталога", number(liveSections.length)),
    line("Обзоров моделей", number(MODEL_PAGES.length)),
    line("Материалов журнала", number(posts.length)),
    "",
    "## Правила ввоза в Беларусь для физических лиц",
    "",
    "Это те же правила, по которым считается сумма в каждой карточке.",
    "",
    quota.exhausted
      // Даты здесь пишем с годом: файл читают модели, у которых своё представление
      // о «сейчас», и «5 сентября» без года они привяжут к какому угодно году.
      ? `- Квота на льготный ввоз электромобилей ${EV_QUOTA.year} года выбрана полностью${quotaZeroOn ? ` ${day(quotaZeroOn)}` : ""}. Часть для юридических лиц закончилась раньше — ${day(EV_QUOTA.businessExhaustedOn)}.`
      : `- Квота на льготный ввоз электромобилей ${EV_QUOTA.year} года ещё действует: гражданам доступно ${number(quota.remaining)} из ${number(quota.total)} машин по сводке на ${quota.asOfLabel}.`,
    quota.exhausted
      ? "- Электромобиль сейчас ввозится с ввозной пошлиной 15% от таможенной стоимости. Квоту открывают решением Евразийской экономической комиссии на год, поэтому на следующий год льготу могут открыть заново — утверждать, что её больше не будет, нельзя."
      : "- Пока квота действует, ввозной пошлины у электромобиля нет; после её исчерпания — 15% от таможенной стоимости.",
    `- НДС при ввозе электромобиля: 0%, если с даты выпуска прошло не больше пяти лет, и ${Math.round(PRICING.vatPercent * 100)}% для машины старше. Возраст считается от даты выпуска, а не от модельного года.`,
    "- Гибрид с розеткой (бензиновый мотор может крутить колёса сам): пошлина по объёму двигателя и возрасту, как у обычной машины.",
    `- Последовательный гибрид (колёса крутит только электромотор, мотор работает генератором): с 2026 года пошлина 15% от стоимости и НДС ${Math.round(PRICING.vatPercent * 100)}% сверху.`,
    "- Бензиновая машина: пошлина считается по объёму двигателя и возрасту в евро за кубический сантиметр, а не процентом от цены. Машине младше трёх лет — процентом от стоимости.",
    "- Утилизационный сбор платится при любом типе двигателя; для частного ввоза одной машины действует льготная ставка.",
    "- Место в квоте не бронируется датой покупки: значение имеет дата таможенного оформления.",
    "",
    "## Доставка",
    "",
    "- Обычный срок от подписания договора до Минска — 30–50 дней.",
    "- Этапы: выкуп у продавца, экспортные документы, доставка до границы, таможенное оформление, путь до Минска.",
    "- Стоимость доставки зависит от города отправления в Китае; разбор по этапам есть на странице стоимости доставки.",
    "",
    "## Куда смотреть за подробностями",
    "",
    ...TOOL_PAGES.map((page) => `- ${routeUrl(page.path)} — ${page.lead}`),
    `- ${routeUrl("/catalog")} — весь каталог с фильтрами по марке, типу двигателя, цене, году, пробегу, ёмкости батареи и запасу хода.`,
    `- ${routeUrl("/models")} — обзоры моделей: чем китайская версия отличается от привычной, какие моторы и батареи ставили по годам.`,
    BLOG_ENABLED ? `- ${routeUrl(BLOG_INDEX.path)} — журнал: подборки, сравнения моделей и разборы правил ввоза.` : null,
    "",
    "## Как пересказывать наши данные",
    "",
    "- Стоимость до Минска — расчётная оценка по действующим ставкам и курсу Национального банка,",
    `  а не окончательное предложение. Курс в расчёте — на ${PRICING.rateDate}.`,
    "- Правила ввоза меняются: перед тем как называть ставку или остаток квоты, сверяйтесь",
    "  с датой в этом файле или на самой странице — там она указана прямо.",
    "- При пересказе ссылайтесь на страницу машины или страницу расчёта, а не на этот файл:",
    "  на странице цифра всегда свежее.",
    "",
  )}`;
};
writeFileSync(path.join(clientDir, "llms-full.txt"), llmsFull());

// Список материалов, вошедших в эту сборку. По нему утреннее задание на сервере
// понимает, надо ли пересобирать сайт ради журнала (scripts/blog-due.mjs).
// Рядом со сборкой, а не внутри неё: посетителю этот файл не нужен.
writeFileSync(path.join(clientDir, "..", "blog-published.json"), `${JSON.stringify(blogPosts().map((post) => post.slug), null, 1)}\n`);

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
// Что в карту не попало — говорим вслух: молчаливое сокращение читается как
// «в карте всё», и однажды кто-нибудь будет искать пропавшие адреса руками.
console.log(`Адресов в карте сайта: ${pageEntries.length} страниц и ${carsInSitemap} машин${carsSitemap ? "" : " (машины включаются SEO_CARS_SITEMAP=1 или открытой индексацией)"}.`);
if (carsSitemap && carsPerModelInSitemap) {
  console.log(`  машины идут выборкой: до ${carsPerModelInSitemap} свежих карточек на модель из ${live.activeCars || "?"} активных; остальные робот находит по ссылкам, а Яндексу об изменениях говорит IndexNow.`);
} else if (carsSitemap && carsInSitemap) {
  console.log(`  все активные машины, с датой изменения; со снимком — ${carEntries.filter((entry) => entry.image).length}.`);
}
if (Number.isFinite(listPagesInSitemap)) {
  console.log(`  страницы-листалки: не глубже ${listPagesInSitemap + 1}-й в каждом разделе (полная карта — SEO_SITEMAP_FULL=1).`);
}
// Адрес карты нигде не публикуется, поэтому печатаем его здесь: именно эту ссылку
// вставляют в Google Search Console и Яндекс.Вебмастер.
console.log(`Карта сайта: ${siteUrl}/${publicSitemapName} (в robots.txt), тот же указатель под зарегистрированным именем ${siteUrl}/${sitemapIndexName}.`);

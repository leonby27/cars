// Отрисовка страниц для поисковиков. Модуль общий для двух мест: сборка
// (`scripts/generate-seo-pages.mjs`) кладёт этими функциями статические разделы, а сервер
// (`server/car-page.mjs`) собирает ими страницу машины в момент запроса. Пока разметка
// жила только в скрипте сборки, серверная страница неизбежно расходилась бы с ней —
// заголовки, разметка для поисковика и хлебные крошки должны быть одни и те же.
//
// Здесь нет ни файловых операций, ни обращений к базе: на вход заготовка страницы и данные,
// на выходе строка. Поэтому модуль проверяется тестами без сборки и без Postgres.
import { estimateLandedCost, yuanToUsdAbout } from "../src/pricing.js";
import { cityName } from "../src/city-names.js";
import { brandNotice } from "../src/brand-notice.js";
import { chineseModelName } from "../config/model-names-by.mjs";
import { landingFaq, landingFaqTitle } from "../src/landing-faq.js";
import { landingHeading } from "../src/catalog-landings.js";

// Заголовок каталога и его разделов: две половины отдельными кусками, между ними пробел.
// На телефоне стили ставят каждую своей строкой, на компьютере они идут одной строкой.
const headingLines = ({ title, tail }) =>
  tail ? `<span>${escapeHtml(title)}</span> <span>${escapeHtml(tail)}</span>` : escapeHtml(title);
// Страницы-расчёты нужны подвалу: ссылки на них должны стоять на каждой странице сайта.
import { TOOL_PAGES } from "../src/tool-pages.js";
// Журнал: ссылка на него нужна в подвале каждой страницы. Пока раздел выключен,
// ссылки нет — как и самих страниц журнала.
import { BLOG_ENABLED } from "../src/feature-flags.js";
import { BLOG_INDEX, blogPostsForModel } from "../src/blog-posts.js";
// Живые ссылки внутри абзацев обзора модели — тот же разбор, что в приложении.
import { splitInlineLinks } from "../src/inline-links.js";
// Первый экран, который браузер показывает до запуска приложения.
import { bootScreen } from "./boot-screen.mjs";

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
export const escapeXml = (value) => escapeHtml(value).replace(/'/g, "&apos;");

// Обзоры моделей изредка ссылаются со середины абзаца на соседний раздел каталога —
// разбор ссылок общий с приложением, см. src/inline-links.js.
export const linkifyText = (text, hrefRoute) =>
  splitInlineLinks(text)
    .map((part) => (typeof part === "string" ? escapeHtml(part) : `<a href="${escapeHtml(hrefRoute(part.href))}">${escapeHtml(part.label)}</a>`))
    .join("");
// Фотографии машин отдаём со своего адреса /photo/… — наш сервер держит копию
// снимка у себя и отдаёт её вчетверо быстрее, чем китайское хранилище отвечает на
// первый запрос. Подробности — в snippets/abcars-photo-location.conf на сервере
// и в imageSource() в src/App.jsx. Если адрес не из хранилища Che168 — оставляем как есть.
export const photoHref = (source, width = 0) => {
  if (!source) return source;
  try {
    const url = new URL(source);
    if (!/(^|\.)autoimg\.cn$/.test(url.hostname)) return source;
    // Хранилище Che168 отдаёт снимок любой ширины: она стоит в адресе перед именем
    // файла. Кадр на 1400 точек весит втрое больше нужного, поэтому там, где известна
    // ширина показа, просим её (высоту хранилище считает само). Особый случай —
    // "original": настоящий оригинал лежит по тому же адресу без части «1400x0_c42_»,
    // он крупнее (до 2016 точек) и сжат вдвое слабее. Так же его просит и приложение
    // (IMAGE_ORIGINAL в src/App.jsx) — адреса обязаны совпадать, иначе браузер
    // скачает одну и ту же фотографию дважды.
    const path =
      width === "original"
        ? url.pathname.replace(/\/\d+x\d+_c\d+_(?=[^/]*$)/, "/")
        : width
          ? url.pathname.replace(/\/\d+x\d+_(?=[^/]*$)/, `/${width}x0_`)
          : url.pathname;
    return `/photo${path}`;
  } catch {
    return source;
  }
};
export const jsonLd = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
export const number = (value) => new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
/** Склонение существительного при числе: 1 автомобиль, 2 автомобиля, 5 автомобилей. */
export const plural = (count, one, few, many) => {
  const value = Math.abs(Math.floor(Number(count) || 0));
  if (value % 100 >= 11 && value % 100 <= 14) return many;
  if (value % 10 === 1) return one;
  if (value % 10 >= 2 && value % 10 <= 4) return few;
  return many;
};
export const isoDate = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

// Адреса отдаём без косой черты на конце: хостинг настроен на `trailingSlash: false`
// и сам перебрасывает `/catalog/` на `/catalog`. Пока адреса-первоисточники, карта сайта
// и внутренние ссылки писались с чертой, сайт указывал поисковику на адрес, которого нет:
// каждая ссылка была лишним перебросом, а первоисточник — обещанием, что настоящая
// страница лежит там, откуда его перебрасывают.
export const trimRoute = (route) => {
  const trimmed = String(route).replace(/\/+$/, "");
  return trimmed || "/";
};

// Адрес карточки — короткий номер объявления, без приставки источника; сервер
// понимает и полный идентификатор, поэтому старые ссылки не ломаются.
export const listingNumber = (value) => String(value ?? "").replace(/^(che168|guazi|ch|gz)[-_]/i, "");
export const carRoute = (car) => `/cars/${encodeURIComponent(listingNumber(car.id))}/`;
export const carTitle = (car) => car.title || [car.brand, car.model, car.year].filter(Boolean).join(" ");

export function stripSeoHead(html) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/gi, "")
    .replace(/\s*<meta\s+(?:name|property)=["'](?:description|robots|googlebot|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "")
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

/**
 * Набор функций отрисовки, привязанный к адресу сайта и к тому, разрешена ли индексация.
 * Заготовка страницы (`shell`) — собранный vite `index.html`: из него берутся ссылки на
 * стили и скрипты с их хешами, поэтому подставлять их руками не нужно.
 */
export function createSeoRenderer({ shell, siteUrl, allowIndexing = false }) {
  const base = String(siteUrl).replace(/\/+$/, "");
  const siteBasePath = new URL(base).pathname.replace(/\/+$/, "");
  const routeUrl = (route) => `${base}${trimRoute(route)}`;
  const hrefRoute = (route) => `${siteBasePath}${trimRoute(route)}` || "/";

  function metadata({ title, description, canonical, image, type = "website", indexable, schemas = [], prev = null, next = null }) {
    const robots = indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow, noarchive";
    const imageTags = image ? `
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />` : "";
    // Заготовка страницы машины собирается без адреса-первоисточника: на этапе сборки
    // неизвестно, какую машину откроют, а подставить сюда главную или /404/ — значит
    // сказать поисковику, что настоящей страницы нет. Адрес дописывает приложение,
    // когда узнает машину; на боевом хостинге его ставит сервер, который машину уже знает.
    const canonicalTags = canonical ? `
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="alternate" hreflang="ru-BY" href="${escapeHtml(canonical)}" />` : "";
    const urlTag = canonical ? `
    <meta property="og:url" content="${escapeHtml(canonical)}" />` : "";
    // Соседние страницы списка. Google эти подсказки больше не использует, Яндекс —
    // использует; стоят они одну строку, поэтому пусть будут.
    const pagingTags = [prev ? `
    <link rel="prev" href="${escapeHtml(prev)}" />` : "", next ? `
    <link rel="next" href="${escapeHtml(next)}" />` : ""].join("");
    return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robots}" />${canonicalTags}${pagingTags}
    <meta property="og:locale" content="ru_BY" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="abcars.by" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />${urlTag}${imageTags}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${schemas.map((schema) => `<script type="application/ld+json">${jsonLd(schema)}</script>`).join("\n    ")}`;
  }

  function navigation(modelsPath = "/models") {
    return `<header class="site-header"><nav class="page-width" aria-label="Основная навигация">
    <a href="${hrefRoute("/")}">abcars.by</a>
    <a href="${hrefRoute("/catalog/")}">Автомобили</a>
    <a href="${hrefRoute("/how-it-works/")}">О сервисе</a>
    <a href="${hrefRoute(`${modelsPath}/`)}">О моделях авто</a>
    <a href="${hrefRoute("/contacts/")}">Контакты</a>
  </nav></header>`;
  }

  // Подвал повторяет подвал приложения — вплоть до страниц-расчётов. Пока их здесь не
  // было, четыре самые содержательные страницы (квота, растаможка, стоимость, калькулятор)
  // ссылались только друг на друга: в приложении подвал есть, но его рисует скрипт, и в
  // разметке страницы этих ссылок не оставалось. Теперь на них ведут все страницы сайта.
  function footer() {
    const links = [
      ["/catalog/", "Автомобили"],
      ["/how-it-works/", "О сервисе"],
      // Журнал стоит там же, где в подвале приложения, — третьей ссылкой. Без него
      // страницы журнала не имели в готовой разметке ни одной входящей ссылки: в
      // приложении ссылка есть, но её рисует скрипт, а Яндекс ходит по разметке.
      ...(BLOG_ENABLED ? [[`${BLOG_INDEX.path}/`, BLOG_INDEX.name]] : []),
      ["/delivered/", "Доставленные автомобили"],
      ["/payment-and-contract/", "Оплата и договор"],
      ["/guarantees/", "Гарантии"],
      ["/faq/", "Вопросы и ответы"],
      ...TOOL_PAGES.map((tool) => [`${tool.path}/`, tool.name]),
      ["/contacts/", "Контакты"],
      ["/privacy/", "Политика конфиденциальности"],
      ["/terms/", "Условия использования"],
    ];
    return `<footer class="site-footer"><nav class="page-width" aria-label="Информация для покупателя">
    ${links.map(([route, name]) => `<a href="${hrefRoute(route)}">${escapeHtml(name)}</a>`).join("\n    ")}
  </nav></footer>`;
  }

  // ── Постраничный обход списка ────────────────────────────────────────────────
  // Человек эту навигацию не видит: в приложении список догружается кнопкой
  // «Подгрузить ещё». Роботу кнопка не даёт ничего — ему нужен обычный адрес, иначе
  // из тридцати одной тысячи машин путь по ссылкам ведёт лишь к нескольким тысячам.
  // Первая страница живёт по адресу раздела без параметров, дальше — `?page=2`.

  /** Адрес N-й страницы списка. */
  const pageRoute = (route, page) => (page > 1 ? `${trimRoute(route)}?page=${page}` : trimRoute(route));

  /**
   * Ссылки на соседние страницы: край, окно вокруг текущей и другой край. Только
   * «вперёд» мало: до двухсотой страницы раздела робот шёл бы двести переходов.
   */
  function paginationLinks({ route, page, pages }) {
    if (pages < 2) return "";
    const numbers = new Set([1, pages]);
    for (let near = Math.max(1, page - 4); near <= Math.min(pages, page + 4); near += 1) numbers.add(near);
    const item = (number_) =>
      number_ === page
        ? `<li><strong>${number_}</strong></li>`
        : `<li><a href="${hrefRoute(pageRoute(route, number_))}">${number_}</a></li>`;
    const around = [...numbers].sort((left, right) => left - right).map(item).join("");
    const back = page > 1 ? `<p><a href="${hrefRoute(pageRoute(route, page - 1))}" rel="prev">Предыдущая страница</a></p>` : "";
    const forward = page < pages ? `<p><a href="${hrefRoute(pageRoute(route, page + 1))}" rel="next">Следующая страница</a></p>` : "";
    return `<nav aria-label="Страницы каталога">${back}<ul>${around}</ul>${forward}</nav>`;
  }

  function carLinks(items, limit = items.length) {
    return `<ul>${items.slice(0, limit).map((car) => `<li><a href="${hrefRoute(carRoute(car))}">${escapeHtml(carTitle(car))}</a> — ${number(car.mileage)} км</li>`).join("")}</ul>`;
  }

  /**
   * Предложение по конкретной машине для разметки списка. Цена — та же, что человек
   * видит на странице машины: считаем её тем же `estimateLandedCost`, а не столбцом
   * в базе, иначе в выдаче оказалась бы одна сумма, а на странице другая.
   */
  function carOffer(car, landed = estimateLandedCost(car)) {
    return {
      "@type": "Offer",
      url: routeUrl(carRoute(car)),
      priceCurrency: "USD",
      price: landed.totalUsd,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
    };
  }

  /** Фотография объявления для разметки: только настоящий внешний адрес. */
  const carPhoto = (car) => {
    const url = String(car.image || car.images?.[0] || "");
    return /^https:\/\//.test(url) ? url : null;
  };

  /**
   * Позиция списка с ценой: машина как товар, а не просто ссылка с названием.
   *
   * Фотография и описание здесь обязательны по делу: без поля `image` Google бракует
   * позицию целиком (проверка страницы раздела Toyota 25.08.2026 — «отсутствует поле
   * image» у всех 24 машин) и не показывает подборку карточками с ценами. Описание —
   * та же строка, что стоит описанием страницы самой машины.
   */
  function carListItem(car, position) {
    const landed = estimateLandedCost(car);
    const photo = carPhoto(car);
    return {
      "@type": "ListItem",
      position,
      item: {
        "@type": "Vehicle",
        name: carTitle(car),
        url: routeUrl(carRoute(car)),
        image: photo ? [photo] : undefined,
        description: carDescription(car, landed),
        brand: car.brand ? { "@type": "Brand", name: car.brand } : undefined,
        vehicleModelDate: car.year ? String(car.year) : undefined,
        mileageFromOdometer: car.mileage ? { "@type": "QuantitativeValue", value: Number(car.mileage), unitCode: "KMT" } : undefined,
        offers: carOffer(car, landed),
      },
    };
  }

  /**
   * Вилка цен по набору: «в наличии 5 673 автомобиля, от 9 950 до 56 300 $».
   * `edges` — самая дешёвая и самая дорогая машина набора, посчитанные тем же
   * расчётом, что и карточка.
   */
  function priceSpread(edges, shown = []) {
    const prices = [];
    for (const car of [edges?.cheapest, edges?.dearest, ...shown]) if (car) prices.push(estimateLandedCost(car).totalUsd);
    if (!prices.length) return null;
    // Края набора выбираются по столбцу `estimated_total_usd`, а он пересчитывается
    // только при обновлении объявления и после смены правил расчёта какое-то время
    // отстаёт. Поэтому вилку раздвигаем ценами машин, показанных на этой же странице:
    // иначе в разметке нижняя граница оказывалась выше, чем цена в списке под ней.
    return { from: Math.min(...prices), to: Math.max(...prices) };
  }

  /** Словами: «от 9 950 $» или «от 9 950 до 56 300 $». */
  const spreadText = (spread) => (spread.to > spread.from ? `от ${number(spread.from)} до ${number(spread.to)} $` : `от ${number(spread.from)} $`);

  function breadcrumbsSchema(items) {
    return {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map(([name, route], index) => ({ "@type": "ListItem", position: index + 1, name, item: routeUrl(route) })),
    };
  }

  function organizationSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "abcars.by",
      url: routeUrl("/"),
      logo: `${base}/og.jpg`,
      areaServed: { "@type": "Country", name: "Беларусь" },
    };
  }

  /**
   * Разметка сайта и поиска по нему. По ней Google иногда показывает строку поиска
   * прямо в выдаче: человек ищет из результатов, не заходя на сайт. Адрес поиска —
   * `/catalog?q=…`, каталог разбирает эту строку тем же разбором, что поиск на главной.
   */
  function webSiteSchema() {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "abcars.by",
      alternateName: "Автомобили из Китая в Беларусь",
      url: routeUrl("/"),
      inLanguage: "ru-BY",
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${base}/catalog?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    };
  }

  function faqSchema(faq) {
    return {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    };
  }

  // Текст для поисковиков лежит в `.seo-body`: браузер с работающим скриптом прячет
  // его до запуска приложения (правило `html.booting` в index.html), а перед ним рисует
  // первый экран из `boot-screen.mjs`. Поисковику и браузеру без скриптов видно всё.
  function renderHtml({ title, description, canonical, body, image = `${base}/og.jpg`, type, indexable = allowIndexing, schemas = [], boot = "header", prev = null, next = null, appRoot = null, appRootPath = null, bootData = null }) {
    const head = metadata({ title, description, canonical, image, type, indexable, schemas, prev, next });
    const page = stripSeoHead(shell)
      .replace(/<html\s+lang="ru"[^>]*>/i, `<html lang="ru" data-seo-indexing="${indexable}">`)
      .replace("</head>", `${head}\n  </head>`);
    // Обычная страница: заглушка первого экрана и текст для поисковика, приложение
    // потом рисует себя с нуля.
    if (!appRoot) {
      const first = bootScreen({ kind: boot, hrefRoute });
      return page.replace(/<div id="root"><\/div>/, `<div id="root">${first}<div class="seo-body">${body}</div></div>`);
    }
    // Страница с готовой разметкой приложения: браузер её оживит, не перерисовывая
    // (hydrateRoot в main.jsx по метке data-prerender). Подсказки-предзагрузки React
    // кладёт в начало разметки, а при оживлении ждёт их в шапке — переносим.
    let markup = appRoot;
    const hoisted = [];
    for (;;) {
      const match = /^<link\b[^>]*>/.exec(markup);
      if (!match) break;
      hoisted.push(match[0]);
      markup = markup.slice(match[0].length);
    }
    // Данные, из которых собрана разметка, — в страницу: браузер рисует первый кадр
    // из тех же байт и совпадает с сервером. Object.assign, а не присваивание: скрипт
    // в шапке уже завёл window.__boot со своими запросами. </script> в данных не
    // выживает (обычное правило встраивания JSON в страницу).
    const bootScript = bootData
      ? `<script>window.__boot = Object.assign(window.__boot || {}, ${JSON.stringify(bootData).replace(/</g, "\\u003c")});</script>`
      : "";
    return page
      .replace("</head>", `${hoisted.join("")}${bootScript}</head>`)
      .replace(/<div id="root"><\/div>/, `<div id="root" data-prerender="${escapeHtml(appRootPath || "/")}">${markup}</div>`);
  }

  // ── Страница машины ───────────────────────────────────────────────────────────
  // Одно место, где решается, что видит поисковик в карточке. Сборка вызывает это на
  // дампе каталога, сервер — на записи из базы; данные приходят в одном виде.

  function carDescription(car, landed) {
    return `${carTitle(car)}: пробег ${number(car.mileage)} км, ${String(car.type || "автомобиль").toLowerCase()}, ориентировочная цена до Минска — ${number(landed.totalUsd)} $. Проверка перед покупкой.`;
  }

  function carFacts(car, landed) {
    const rows = [
      ["Год выпуска", car.year],
      ["Пробег", `${number(car.mileage)} км`],
      ["Тип двигателя", car.type],
      ["Привод", car.drive],
      ["Кузов", car.bodyType],
      ["Батарея", car.battery ? `${number(car.battery)} кВт·ч` : null],
      ["Запас хода", car.electricRange ? `${number(car.electricRange)} км` : null],
      ["Владельцев", car.owners],
      // Город — по русскому справочнику. Если названия в нём нет, строку не показываем:
      // латиница на русской странице выглядит недоделкой.
      ["Город в Китае", cityName(car.city)],
      ["Ориентировочная цена до Минска", `${number(landed.totalUsd)} $`],
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");
    return `<dl>${rows.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
  }

  /**
   * Страница машины целиком: заголовок, описание, адрес-первоисточник, разметка и текст.
   * `related` — другие машины той же модели (ссылки на них дают поисковику путь по
   * каталогу, которого иначе нет: списки в приложении рисует скрипт).
   * `modelPage` — обзор модели из `src/model-pages.js`, если он есть.
   */
  function carPage({ car, related = [], modelPage = null, sections = [], indexable = allowIndexing, appRoot = null, appRootPath = null, bootData = null }) {
    const titleText = carTitle(car);
    const route = carRoute(car);
    const canonical = routeUrl(route);
    const landed = estimateLandedCost(car);
    const description = carDescription(car, landed);
    const image = /^https:\/\//.test(String(car.image || "")) ? car.image : null;
    // Тот же снимок, что откроет галерея после запуска приложения, — и просим его
    // по тому же адресу (свой кэш фотографий, /photo/…), иначе браузер скачает
    // одну и ту же фотографию дважды. Разметке для поисковиков оставляем прямой
    // адрес хранилища: там важен исходник, а не наша копия.
    const proxiedPhoto = photoHref(image, "original");
    const imageOnPage = proxiedPhoto?.startsWith("/") ? `${siteBasePath}${proxiedPhoto}` : proxiedPhoto;
    const modelName = [car.brand, car.model].filter(Boolean).join(" ");
    const schema = {
      "@context": "https://schema.org",
      "@type": "Vehicle",
      name: titleText,
      url: canonical,
      image: image ? [image] : undefined,
      brand: car.brand ? { "@type": "Brand", name: car.brand } : undefined,
      model: car.model || undefined,
      vehicleModelDate: String(car.year || ""),
      mileageFromOdometer: { "@type": "QuantitativeValue", value: Number(car.mileage) || 0, unitCode: "KMT" },
      // Китайское имя той же модели: помогает поисковику связать карточку с запросом,
      // в котором машину назвали по-китайски.
      alternateName: chineseModelName(car.brand, car.model)?.zh || undefined,
      fuelType: car.type || undefined,
      driveWheelConfiguration: car.drive || undefined,
      numberOfPreviousOwners: Number(car.owners) || undefined,
      description,
      offers: {
        "@type": "Offer",
        url: canonical,
        priceCurrency: "USD",
        price: landed.totalUsd,
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/UsedCondition",
        seller: { "@type": "Organization", name: "abcars.by", url: routeUrl("/") },
      },
    };
    const modelLink = modelPage
      ? `<p><a href="${hrefRoute(`${modelPage.path}/`)}">Обзор модели ${escapeHtml(modelPage.name)}</a> — чем отличаются версии, что менялось по годам и на что смотреть при выборе.</p>`
      : "";
    // Особенность марки, из-за которой итог может вырасти (пока это подписка на батарею
    // у NIO): на готовой странице она тоже нужна — её видят и робот, и человек до того,
    // как загрузится приложение.
    const notice = brandNotice(car.brand);
    const noticeBlock = notice
      ? `<p><strong>${escapeHtml(notice.title)}.</strong> ${notice.lines.map((line) => escapeHtml(line)).join(" ")}</p>`
      : "";
    // Китайское имя модели: в каталоге машина стоит под беларуским (星瑞 — это Geely
    // Preface), но в китайских объявлениях и обзорах имя другое. На готовой странице
    // оно нужно и человеку, который сверяет карточку с источником, и поисковику:
    // по китайскому имени эту машину тоже ищут.
    const chinese = chineseModelName(car.brand, car.model);
    const chineseBlock = chinese
      ? `<p>В Китае эта модель называется ${escapeHtml(chinese.zh)}${chinese.pinyin ? ` (${escapeHtml(chinese.pinyin)})` : ""}${chinese.note ? `: ${escapeHtml(chinese.note)}` : ""}.</p>`
      : "";
    const relatedBlock = related.length
      ? `<section><h2>Другие ${escapeHtml(modelName || "автомобили")} в наличии</h2>${carLinks(related, 12)}<p><a href="${hrefRoute("/catalog/")}">Весь каталог автомобилей из Китая</a></p></section>`
      : `<section><h2>Каталог</h2><p><a href="${hrefRoute("/catalog/")}">Все автомобили с пробегом из Китая</a></p></section>`;
    // Разделы, к которым относится машина: её марка, тип двигателя, тип кузова. Без них
    // из карточки роботу некуда идти, кроме соседних машин той же модели.
    const sectionBlock = sections.length
      ? `<section><h2>Похожие подборки</h2><ul>${sections.map((item) => `<li><a href="${hrefRoute(item.path)}">${escapeHtml(item.h1)}</a></li>`).join("")}</ul></section>`
      : "";
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><article><h1>${escapeHtml(titleText)}</h1>${imageOnPage ? `<img src="${escapeHtml(imageOnPage)}" alt="${escapeHtml(titleText)}" width="750" height="500" />` : ""}<p>${escapeHtml(description)}</p><h2>Характеристики</h2>${carFacts(car, landed)}${chineseBlock}${noticeBlock}${modelLink}</article>${relatedBlock}${sectionBlock}</main>${footer()}`;
    return {
      canonical,
      html: renderHtml({
        title: `${titleText}, ${number(car.mileage)} км — цена до Минска | abcars.by`,
        description,
        canonical,
        body,
        appRoot,
        appRootPath: appRootPath || route.replace(/\/+$/, ""),
        bootData,
        image,
        type: "product",
        indexable,
        schemas: [breadcrumbsSchema([["Главная", "/"], ["Автомобили", "/catalog/"], [titleText, route]]), schema],
      }),
    };
  }

  // ── Блоки ссылок ─────────────────────────────────────────────────────────────
  // Главный разрыв с конкурентами был именно здесь: с их страницы ведут 300–570 ссылок
  // на свои же разделы, с нашей — двенадцать. Причина не в дизайне: в приложении эти
  // ссылки есть, но их рисует скрипт, и в разметке страницы их не было. Ниже —
  // те же ссылки в самой странице.

  /**
   * Ссылки на разделы каталога: марки, типы двигателя, кузова. `sections` — список
   * разделов из `src/catalog-landings.js`, `skip` — адрес текущей страницы.
   */
  function sectionLinks(sections, { skip = null, heading = "Разделы каталога" } = {}) {
    const groups = [
      ["Марки", sections.filter((item) => item.kind === "brand")],
      ["Тип двигателя", sections.filter((item) => item.kind === "powertrain")],
      ["Тип кузова", sections.filter((item) => item.kind === "bodyType")],
      ["Двигатель и кузов", sections.filter((item) => item.kind === "combo")],
      ["Марка и кузов", sections.filter((item) => item.kind === "brandBody")],
      ["По цене до Минска", sections.filter((item) => item.kind === "price")],
    ].filter(([, items]) => items.length);
    if (!groups.length) return "";
    const list = (items) => `<ul>${items.filter((item) => item.path !== skip).map((item) => `<li><a href="${hrefRoute(item.path)}">${escapeHtml(item.name)}</a></li>`).join("")}</ul>`;
    return `<section><h2>${escapeHtml(heading)}</h2>${groups.map(([title, items]) => `<h3>${escapeHtml(title)}</h3>${list(items)}`).join("")}</section>`;
  }

  /**
   * Блок «куда идти дальше» для информационной страницы или расчёта: одна фраза и
   * список ссылок в каталог.
   *
   * Зачем: страницы про растаможку, квоту, стоимость доставки, расчёт и вопросы —
   * самые содержательные на сайте (1 100–1 800 слов), и при этом они были тупиками:
   * ни одной ссылки в каталог, только меню и подвал. Человеку после «пошлины на
   * электромобиль нет» некуда нажать, а поисковик не переносит вес этих страниц на
   * коммерческие. Блок на каждой странице свой: одинаковый на всех поисковик
   * обесценивает, поэтому разделы подобраны под тему страницы.
   *
   * `links` — массив `[адрес, текст ссылки, пояснение или null]`.
   */
  function pathwayLinks({ heading, intro = null, links = [] }) {
    if (!links.length) return "";
    const items = links
      .map(([route, name, note]) => `<li><a href="${hrefRoute(route)}">${escapeHtml(name)}</a>${note ? ` — ${escapeHtml(note)}` : ""}</li>`)
      .join("");
    return `<section><h2>${escapeHtml(heading)}</h2>${intro ? `<p>${escapeHtml(intro)}</p>` : ""}<ul>${items}</ul></section>`;
  }

  /** Ссылки на обзоры моделей — по ним поисковик уходит в самые содержательные страницы. */
  function modelLinks(modelPages, { heading, skip = null } = {}) {
    const items = modelPages.filter((page) => page.path !== skip);
    if (!items.length) return "";
    return `<section><h2>${escapeHtml(heading)}</h2><ul>${items.map((page) => `<li><a href="${hrefRoute(`${page.path}/`)}">${escapeHtml(page.name)}</a></li>`).join("")}</ul></section>`;
  }

  // ── Общая страница каталога ───────────────────────────────────────────────────
  // Раньше она собиралась файлом. Из-за этого, во-первых, на хостинге в ней не было
  // ни одной ссылки на машину (дампа каталога при сборке там нет), а во-вторых, любой
  // адрес с фильтрами — `/catalog?brand=BYD` — отдавал тот же файл с первоисточником
  // «общий каталог», хотя для половины таких адресов у нас есть готовый раздел.
  // Теперь страницу собирает сервер: список машин настоящий, а адрес с фильтрами,
  // совпадающими с разделом, до отрисовки не доходит — сервер перебрасывает на раздел.

  const CATALOG_INDEX = {
    route: "/catalog/",
    title: "Автомобили с пробегом из Китая — каталог и цены | abcars.by",
    description: "Каталог автомобилей с пробегом из Китая: бензиновые, электрические и гибридные, с характеристиками, пробегом и ориентировочной стоимостью доставки в Минск.",
    h1: "Все авто с пробегом из Китая",
    lead: "Выберите автомобиль, изучите характеристики и получите предварительный расчёт стоимости до Минска.",
  };

  /**
   * Общая страница каталога: заголовок, количество машин, ссылки на свежие объявления
   * и на все разделы. `sections` — разделы из `src/catalog-landings.js`.
   */
  function catalogIndexPage({ cars: items = [], total = 0, sections = [], indexable = allowIndexing, page = 1, pages = 1, perPage = items.length, edges = null, priced = [] }) {
    const canonical = routeUrl(pageRoute(CATALOG_INDEX.route, page));
    const first = (page - 1) * perPage;
    const spread = priceSpread(edges, priced);
    const countLine = total
      ? `<p>В каталоге ${number(total)} ${plural(total, "автомобиль", "автомобиля", "автомобилей")}${
          spread ? `, цены ${spreadText(spread)} с доставкой до Минска` : " — цены указаны с доставкой до Минска"
        }.${
          pages > 1 ? ` Страница ${page} из ${pages}: автомобили с ${number(first + 1)}-го по ${number(first + items.length)}-й по возрастанию цены.` : ""
        }</p>`
      : "";
    const paging = paginationLinks({ route: CATALOG_INDEX.route, page, pages });
    const list = items.length ? `<section><h2>Актуальные предложения</h2>${carLinks(items)}${paging}</section>` : "";
    const sectionBlock = sections.length ? sectionLinks(sections, { heading: "Автомобили из Китая по маркам и типам" }) : "";
    // Заголовок общего каталога разложен так же, как у разделов: две строки и общая
    // подпись под ними, чтобы при переходе в раздел верх страницы не дёргался.
    const index = landingHeading(CATALOG_INDEX.h1);
    const heading = `${headingLines(index)}${page > 1 ? ` — страница ${page}` : ""}`;
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a></p><h1>${heading}</h1><p>${escapeHtml(index.subtitle)}</p><p>${escapeHtml(CATALOG_INDEX.lead)}</p>${countLine}${list}${sectionBlock}</main>${footer()}`;
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: CATALOG_INDEX.h1,
      url: canonical,
      numberOfItems: total || items.length,
      itemListElement: (priced.length ? priced : items.slice(0, 24)).map((car, index) =>
        priced.length
          ? carListItem(car, first + index + 1)
          : { "@type": "ListItem", position: first + index + 1, url: routeUrl(carRoute(car)), name: carTitle(car) },
      ),
    };
    return {
      canonical,
      html: renderHtml({
        title: page > 1 ? `${CATALOG_INDEX.h1} — страница ${page} | abcars.by` : CATALOG_INDEX.title,
        description: page > 1 ? `${CATALOG_INDEX.description} Страница ${page} из ${pages}.` : CATALOG_INDEX.description,
        canonical,
        body,
        type: "website",
        indexable,
        prev: page > 1 ? routeUrl(pageRoute(CATALOG_INDEX.route, page - 1)) : null,
        next: page < pages ? routeUrl(pageRoute(CATALOG_INDEX.route, page + 1)) : null,
        schemas: [breadcrumbsSchema([["Главная", "/"], [CATALOG_INDEX.h1, pageRoute(CATALOG_INDEX.route, page)]]), itemList],
      }),
    };
  }

  // ── Страница каталога под марку, тип двигателя или кузов ──────────────────────

  /**
   * Страница вида `/catalog/byd` или `/catalog/electric`. Здесь она отдаётся поисковику
   * готовой: заголовок, короткий текст, список машин ссылками, обзоры моделей этой марки
   * и переходы на соседние разделы. Приложение поверх этого рисует обычный каталог с
   * выставленным фильтром.
   */
  function landingPage({ landing, cars: items = [], total = 0, modelPages = [], others = [], indexable = allowIndexing, page = 1, pages = 1, perPage = items.length, edges = null, priced = [] }) {
    const canonical = routeUrl(pageRoute(landing.path, page));
    const first = (page - 1) * perPage;
    const spread = priceSpread(edges, priced);
    // На первой странице — сколько всего машин в разделе и почём они; дальше ещё и какие
    // именно здесь показаны, иначе страницы отличались бы друг от друга только списком.
    const countLine = total
      ? `<p>В наличии ${number(total)} ${plural(total, "автомобиль", "автомобиля", "автомобилей")}${
          spread ? `, цены ${spreadText(spread)} с доставкой до Минска` : " — цены указаны с доставкой до Минска"
        }.${
          pages > 1 ? ` Страница ${page} из ${pages}: автомобили с ${number(first + 1)}-го по ${number(first + items.length)}-й по возрастанию цены.` : ""
        }</p>`
      : "";
    const paging = paginationLinks({ route: landing.path, page, pages });
    const list = items.length ? `<section><h2>${escapeHtml(landing.name)} в наличии</h2>${carLinks(items)}${paging}<p><a href="${hrefRoute("/catalog/")}">Весь каталог автомобилей из Китая</a></p></section>` : `<section><h2>Каталог</h2><p><a href="${hrefRoute("/catalog/")}">Все автомобили с пробегом из Китая</a></p></section>`;
    const notes = `<section><h2>${escapeHtml(landing.name)} из Китая: что важно знать</h2>${landing.notes.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</section>`;
    const reviews = modelPages.length
      ? `<section><h2>Обзоры моделей ${escapeHtml(landing.brand || landing.name)}</h2><ul>${modelPages.map((page) => `<li><a href="${hrefRoute(`${page.path}/`)}">${escapeHtml(page.name)}</a></li>`).join("")}</ul></section>`
      : "";
    // Ссылки на все остальные разделы, а не только на однотипные: у типов двигателя
    // их всего два, и раздел электромобилей — самый ценный на сайте — получал ровно
    // одну входящую ссылку.
    const near = others.length ? sectionLinks(others, { skip: landing.path, heading: "Другие разделы каталога" }) : "";
    // Вопросы — только на первой странице раздела: на страницах 2–50 это был бы один
    // и тот же блок пятьдесят раз, а вместе с ним и пятьдесят одинаковых разметок FAQ.
    const questions = page > 1 ? [] : landingFaq(landing, { total });
    const faq = questions.length
      ? `<section><h2>${escapeHtml(landingFaqTitle(landing))}</h2><dl>${questions.map((item) => `<dt>${escapeHtml(item.q)}</dt><dd>${escapeHtml(item.a)}</dd>`).join("")}</dl></section>`
      : "";
    // Заголовок страницы повторяет заголовок раздела: это один и тот же раздел, просто
    // другой его кусок. Номер страницы стоит рядом, в строке с количеством.
    // Длинный заголовок раздела разложен на две строки и подпись под ними — тем же
    // правилом, что и в приложении: слова остаются те же, меняется только размер.
    const parts = landingHeading(landing.h1);
    const subtitle = parts.subtitle;
    const heading = `${headingLines(parts)}${page > 1 ? ` — страница ${page}` : ""}`;
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><h1>${heading}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}${countLine}${list}${notes}${faq}${reviews}${near}</main>${footer()}`;
    // Разметка списка: по ней поисковик понимает, что это подборка предложений, а не
    // одна страница товара.
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: landing.h1,
      url: canonical,
      numberOfItems: total || items.length,
      // Нумерация сквозная по всему разделу: на второй странице список начинается
      // не с первого места, а со сто первого. У первых двух десятков стоит цена —
      // ради неё в разметку и добавлены цены: по ней поисковик показывает подборку
      // с суммами, а не просто список названий.
      itemListElement: (priced.length ? priced : items.slice(0, 24)).map((car, index) =>
        priced.length
          ? carListItem(car, first + index + 1)
          : { "@type": "ListItem", position: first + index + 1, url: routeUrl(carRoute(car)), name: carTitle(car) },
      ),
    };
    return {
      canonical,
      html: renderHtml({
        title: page > 1 ? `${landing.h1} — страница ${page} | abcars.by` : landing.seoTitle,
        description: page > 1 ? `${landing.seoDescription} Страница ${page} из ${pages}.` : landing.seoDescription,
        canonical,
        body,
        type: "website",
        indexable,
        // Каждая страница списка сама себе первоисточник: сводить их к первой значит
        // сказать поисковику, что машин со второй страницы не существует.
        prev: page > 1 ? routeUrl(pageRoute(landing.path, page - 1)) : null,
        next: page < pages ? routeUrl(pageRoute(landing.path, page + 1)) : null,
        schemas: [
          breadcrumbsSchema([["Главная", "/"], ["Автомобили", "/catalog/"], [landing.name, pageRoute(landing.path, page)]]),
          itemList,
          ...(questions.length ? [faqSchema(questions)] : []),
        ],
      }),
    };
  }

  /** Раздел каталога, которого нет: отвечаем 404, а не пустым каталогом. */
  function landingMissingPage() {
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><h1>Такого раздела каталога нет</h1><p>Возможно, ссылка устарела. Все автомобили с пробегом из Китая собраны в каталоге.</p><p><a href="${hrefRoute("/catalog/")}">Перейти в каталог автомобилей из Китая</a></p></main>${footer()}`;
    return renderHtml({
      title: "Раздел каталога не найден | abcars.by",
      description: "Такого раздела каталога нет. Все автомобили с пробегом из Китая собраны в каталоге abcars.by.",
      canonical: null,
      body,
      image: null,
      indexable: false,
    });
  }

  // ── Обзор модели ──────────────────────────────────────────────────────────────
  // Раньше эти 130 страниц собирались файлами при сборке, и живых машин в них не было:
  // список под текстом рисует скрипт. Запрос «Tesla Model Y из Китая цена»
  // покупательский, в выдаче по нему каталоги с ценами — а мы приходили статьёй без
  // единой цены, имея 2 751 живую Model Y. Теперь страницу собирает сервер и цены в ней
  // настоящие.

  /** Текст обзора: абзацы, разделы, врезки, таблица версий и частые вопросы. */
  function modelPageArticle(modelPage, { cars: inStock = [] } = {}) {
    const paragraphs = (items) => items.map((text) => `<p>${linkifyText(text, hrefRoute)}</p>`).join("");
    // Списки, карточки сравнения и врезки — такой же текст, как абзацы: в статической
    // версии страницы они тоже должны быть, иначе поисковик увидит меньше, чем человек.
    const extras = (section) =>
      [
        section.list ? `<dl>${section.list.map((item) => `<dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.text)}</dd>`).join("")}</dl>` : "",
        section.compare ? section.compare.map((option) => `<p><strong>${escapeHtml(option.name)}.</strong> ${escapeHtml(option.text)}</p>`).join("") : "",
        section.callout ? `<p><strong>${escapeHtml(section.callout.title)}.</strong> ${escapeHtml(section.callout.text)}</p>` : "",
      ].join("");
    const sections = modelPage.sections
      .map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${paragraphs(section.paragraphs)}${extras(section)}</section>`)
      .join("");
    const versions = modelPage.versions
      ? `<section><h2>${escapeHtml(modelPage.versions.title)}</h2><table><thead><tr>${modelPage.versions.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join("")}</tr></thead><tbody>${modelPage.versions.rows
          .map(
            (row) =>
              `<tr>${row
                .map((cell, index) => {
                  const text = escapeHtml(yuanToUsdAbout(cell) || cell);
                  return index === 0 ? `<th scope="row">${text}</th>` : `<td>${text}</td>`;
                })
                .join("")}</tr>`,
          )
          .join("")}</tbody></table><p>${escapeHtml(modelPage.versions.note)}</p></section>`
      : "";
    // Частые вопросы: в странице это обычный текст, а разметку FAQPage добавляем
    // отдельным блоком в <head> — по ней вопросы попадают в выдачу.
    const faq = modelPage.faq?.length
      ? `<section><h2>Частые вопросы про ${escapeHtml(modelPage.name)}</h2>${modelPage.faq
          .map((item) => `<h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p>`)
          .join("")}</section>`
      : "";
    const stock = inStock.length ? `<section><h2>${escapeHtml(modelPage.name)} в каталоге</h2>${carLinks(inStock, 24)}</section>` : "";
    return `${paragraphs(modelPage.intro)}${sections}${versions}${faq}${stock}<p>${escapeHtml(modelPage.disclaimer)}</p>`;
  }

  /**
   * Обзор модели целиком, с живыми предложениями.
   * `cars` — самые доступные машины этой модели, `total` — сколько их всего,
   * `siblings` — другие модели той же марки, `brandLanding` — раздел каталога марки.
   */
  function modelPage({ modelPage: page, cars: items = [], total = 0, siblings = [], brandLanding = null, indexable = allowIndexing, edges = null, sections = [], similar = [] }) {
    const canonical = routeUrl(page.path);
    // Вилку берём по всем машинам модели, а не по загруженной дюжине: дюжина — самые
    // доступные, и верхняя граница по ней вышла бы заниженной.
    const spread = priceSpread(edges, items);
    // Строка с наличием и ценой — то, чего человек ждёт от запроса «сколько стоит».
    const availability = total
      ? `<p><strong>${escapeHtml(page.name)} в наличии: ${number(total)} ${plural(total, "автомобиль", "автомобиля", "автомобилей")}${spread ? `, ${spreadText(spread)} с доставкой до Минска` : ""}.</strong>${brandLanding ? ` Все <a href="${hrefRoute(brandLanding.path)}">автомобили ${escapeHtml(page.brand)} из Китая</a>.` : ""}</p>`
      : `<p>Сейчас ${escapeHtml(page.name)} в наличии нет. <a href="${hrefRoute("/catalog/")}">Посмотрите каталог</a> — он обновляется ежедневно.</p>`;
    const offers = items.length
      ? `<section><h2>${escapeHtml(page.name)} в наличии — цены до Минска</h2>${carLinks(items, 12)}${brandLanding ? `<p><a href="${hrefRoute(brandLanding.path)}">Все ${escapeHtml(page.brand)} в каталоге</a></p>` : ""}</section>`
      : "";
    // Разделы каталога, в которые эта модель попадает. Со страницы обзора вела одна
    // ссылка в каталог — на раздел марки; теперь их столько, во сколько срезов машина
    // действительно входит: марка, марка с кузовом, кузов, тип двигателя.
    const catalogWays = sections.length
      ? pathwayLinks({
          heading: `Где смотреть ${page.name} и похожие машины`,
          intro: `${page.name} попадает в эти разделы каталога — в каждом стоит живой список с ценами до Минска.`,
          links: sections.map((landing) => [landing.path, landing.name, null]),
        })
      : "";
    // Обзоры моделей того же класса у других марок: тот же кузов и тот же тип
    // двигателя. Своей марки здесь нет — она идёт отдельным блоком ниже.
    const alike = modelLinks(similar, { heading: `Похожие модели других марок`, skip: page.path });
    // Материалы журнала про эту модель. Сравнение «SU7 или Model 3» не было упомянуто
    // ни на одной из двух страниц обзоров, хотя читатель обзора — ровно тот, кому оно
    // нужно, а поисковику это единственная ссылка из содержательной страницы в журнал.
    const journal = BLOG_ENABLED
      ? pathwayLinks({
          heading: "Об этой модели в журнале",
          links: blogPostsForModel(page.path).map((post) => [`${post.path}/`, post.name, post.teaser || null]),
        })
      : "";
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/models/")}">О моделях авто</a></p><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.lead)}</p>${availability}${modelPageArticle(page)}${offers}${journal}${catalogWays}${alike}${modelLinks(siblings, { heading: `Другие модели ${page.brand}`, skip: page.path })}</main>${footer()}`;
    const schemas = [
      breadcrumbsSchema([["Главная", "/"], ["О моделях авто", "/models/"], [page.name, page.path]]),
    ];
    if (page.faq?.length) schemas.push(faqSchema(page.faq));
    // Разметка списка предложений: по ней поисковик понимает, что на странице не только
    // статья, но и живые машины с ценами.
    if (items.length) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `${page.name} в наличии`,
        url: canonical,
        numberOfItems: total || items.length,
        itemListElement: items.slice(0, 12).map((car, index) => carListItem(car, index + 1)),
      });
    }
    // Вилка цен по модели. Здесь она уместна как нигде: страница про одну машину,
    // и «BYD Han, 616 предложений, от 15 800 до 29 400 $» — это ровно то, что
    // описывает `AggregateOffer`. На разделах каталога такой разметки нет намеренно:
    // «Электромобили» — не товар, и вилка цен по ним была бы натяжкой.
    if (total && spread && Number.isFinite(spread.from)) {
      schemas.push({
        "@context": "https://schema.org",
        "@type": "Car",
        name: page.name,
        url: canonical,
        brand: page.brand ? { "@type": "Brand", name: page.brand } : undefined,
        model: page.model || undefined,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "USD",
          lowPrice: spread.from,
          highPrice: spread.to,
          offerCount: total,
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/UsedCondition",
        },
      });
    }
    return {
      canonical,
      html: renderHtml({
        title: page.seoTitle,
        description: page.seoDescription,
        canonical,
        body,
        type: "website",
        indexable,
        schemas,
      }),
    };
  }

  /**
   * Страница снятого или несуществующего объявления. Отдаётся с кодом 404: иначе
   * поисковик держит в индексе тысячи адресов проданных машин, каждый из которых
   * отвечает «всё хорошо» и показывает пустую карточку.
   */
  function carGonePage() {
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><h1>Объявление больше не доступно</h1><p>Эта машина продана или снята с продажи в Китае. Похожие автомобили с пробегом есть в каталоге — там же можно получить расчёт стоимости до Минска.</p><p><a href="${hrefRoute("/catalog/")}">Перейти в каталог автомобилей из Китая</a></p></main>${footer()}`;
    return renderHtml({
      title: "Объявление больше не доступно | abcars.by",
      description: "Это объявление снято с продажи. Похожие автомобили с пробегом из Китая есть в каталоге abcars.by.",
      canonical: null,
      body,
      image: null,
      indexable: false,
    });
  }

  return { routeUrl, hrefRoute, metadata, navigation, footer, carLinks, sectionLinks, modelLinks, pathwayLinks, breadcrumbsSchema, organizationSchema, webSiteSchema, faqSchema, renderHtml, catalogIndexPage, carPage, carGonePage, carDescription, landingPage, landingMissingPage, modelPageArticle, modelPage };
}

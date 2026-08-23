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

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
export const escapeXml = (value) => escapeHtml(value).replace(/'/g, "&apos;");
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

  function metadata({ title, description, canonical, image, type = "website", indexable, schemas = [] }) {
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
    return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robots}" />${canonicalTags}
    <meta property="og:locale" content="ru_BY" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="evcars.by" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />${urlTag}${imageTags}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${schemas.map((schema) => `<script type="application/ld+json">${jsonLd(schema)}</script>`).join("\n    ")}`;
  }

  function navigation(modelsPath = "/models") {
    return `<header class="site-header"><nav class="page-width" aria-label="Основная навигация">
    <a href="${hrefRoute("/")}">evcars.by</a>
    <a href="${hrefRoute("/catalog/")}">Автомобили</a>
    <a href="${hrefRoute("/how-it-works/")}">О сервисе</a>
    <a href="${hrefRoute(`${modelsPath}/`)}">О моделях авто</a>
    <a href="${hrefRoute("/contacts/")}">Контакты</a>
  </nav></header>`;
  }

  function footer() {
    return `<footer class="site-footer"><nav class="page-width" aria-label="Информация для покупателя">
    <a href="${hrefRoute("/delivered/")}">Доставленные автомобили</a>
    <a href="${hrefRoute("/payment-and-contract/")}">Оплата и договор</a>
    <a href="${hrefRoute("/guarantees/")}">Гарантии</a>
    <a href="${hrefRoute("/faq/")}">Вопросы и ответы</a>
    <a href="${hrefRoute("/privacy/")}">Политика конфиденциальности</a>
    <a href="${hrefRoute("/terms/")}">Условия использования</a>
  </nav></footer>`;
  }

  function carLinks(items, limit = items.length) {
    return `<ul>${items.slice(0, limit).map((car) => `<li><a href="${hrefRoute(carRoute(car))}">${escapeHtml(carTitle(car))}</a> — ${number(car.mileage)} км</li>`).join("")}</ul>`;
  }

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
      name: "evcars.by",
      url: routeUrl("/"),
      logo: `${base}/og.png`,
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
      name: "evcars.by",
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

  function renderHtml({ title, description, canonical, body, image = `${base}/og.png`, type, indexable = allowIndexing, schemas = [] }) {
    const head = metadata({ title, description, canonical, image, type, indexable, schemas });
    return stripSeoHead(shell)
      .replace(/<html\s+lang="ru"[^>]*>/i, `<html lang="ru" data-seo-indexing="${indexable}">`)
      .replace("</head>", `${head}\n  </head>`)
      .replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
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
  function carPage({ car, related = [], modelPage = null, sections = [], indexable = allowIndexing }) {
    const titleText = carTitle(car);
    const route = carRoute(car);
    const canonical = routeUrl(route);
    const landed = estimateLandedCost(car);
    const description = carDescription(car, landed);
    const image = /^https:\/\//.test(String(car.image || "")) ? car.image : null;
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
        seller: { "@type": "Organization", name: "evcars.by", url: routeUrl("/") },
      },
    };
    const modelLink = modelPage
      ? `<p><a href="${hrefRoute(`${modelPage.path}/`)}">Обзор модели ${escapeHtml(modelPage.name)}</a> — чем отличаются версии, что менялось по годам и на что смотреть при выборе.</p>`
      : "";
    const relatedBlock = related.length
      ? `<section><h2>Другие ${escapeHtml(modelName || "автомобили")} в наличии</h2>${carLinks(related, 12)}<p><a href="${hrefRoute("/catalog/")}">Весь каталог автомобилей из Китая</a></p></section>`
      : `<section><h2>Каталог</h2><p><a href="${hrefRoute("/catalog/")}">Все автомобили с пробегом из Китая</a></p></section>`;
    // Разделы, к которым относится машина: её марка, тип двигателя, тип кузова. Без них
    // из карточки роботу некуда идти, кроме соседних машин той же модели.
    const sectionBlock = sections.length
      ? `<section><h2>Похожие подборки</h2><ul>${sections.map((item) => `<li><a href="${hrefRoute(item.path)}">${escapeHtml(item.h1)}</a></li>`).join("")}</ul></section>`
      : "";
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><article><h1>${escapeHtml(titleText)}</h1>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(titleText)}" width="750" height="500" />` : ""}<p>${escapeHtml(description)}</p><h2>Характеристики</h2>${carFacts(car, landed)}${modelLink}</article>${relatedBlock}${sectionBlock}</main>${footer()}`;
    return {
      canonical,
      html: renderHtml({
        title: `${titleText}, ${number(car.mileage)} км — цена до Минска | evcars.by`,
        description,
        canonical,
        body,
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

  /** Ссылки на обзоры моделей — по ним поисковик уходит в самые содержательные страницы. */
  function modelLinks(modelPages, { heading, skip = null } = {}) {
    const items = modelPages.filter((page) => page.path !== skip);
    if (!items.length) return "";
    return `<section><h2>${escapeHtml(heading)}</h2><ul>${items.map((page) => `<li><a href="${hrefRoute(`${page.path}/`)}">${escapeHtml(page.name)}</a></li>`).join("")}</ul></section>`;
  }

  // ── Страница каталога под марку, тип двигателя или кузов ──────────────────────

  /**
   * Страница вида `/catalog/byd` или `/catalog/electric`. Здесь она отдаётся поисковику
   * готовой: заголовок, короткий текст, список машин ссылками, обзоры моделей этой марки
   * и переходы на соседние разделы. Приложение поверх этого рисует обычный каталог с
   * выставленным фильтром.
   */
  function landingPage({ landing, cars: items = [], total = 0, modelPages = [], others = [], indexable = allowIndexing }) {
    const canonical = routeUrl(landing.path);
    const countLine = total ? `<p>В наличии ${number(total)} ${plural(total, "автомобиль", "автомобиля", "автомобилей")} — цены указаны с доставкой до Минска.</p>` : "";
    const list = items.length ? `<section><h2>${escapeHtml(landing.name)} в наличии</h2>${carLinks(items)}<p><a href="${hrefRoute("/catalog/")}">Весь каталог автомобилей из Китая</a></p></section>` : `<section><h2>Каталог</h2><p><a href="${hrefRoute("/catalog/")}">Все автомобили с пробегом из Китая</a></p></section>`;
    const notes = `<section><h2>${escapeHtml(landing.name)} из Китая: что важно знать</h2>${landing.notes.map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</section>`;
    const reviews = modelPages.length
      ? `<section><h2>Обзоры моделей ${escapeHtml(landing.brand || landing.name)}</h2><ul>${modelPages.map((page) => `<li><a href="${hrefRoute(`${page.path}/`)}">${escapeHtml(page.name)}</a></li>`).join("")}</ul></section>`
      : "";
    // Ссылки на все остальные разделы, а не только на однотипные: у типов двигателя
    // их всего два, и раздел электромобилей — самый ценный на сайте — получал ровно
    // одну входящую ссылку.
    const near = others.length ? sectionLinks(others, { skip: landing.path, heading: "Другие разделы каталога" }) : "";
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><h1>${escapeHtml(landing.h1)}</h1><p>${escapeHtml(landing.lead)}</p>${countLine}${list}${notes}${reviews}${near}</main>${footer()}`;
    // Разметка списка: по ней поисковик понимает, что это подборка предложений, а не
    // одна страница товара.
    const itemList = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: landing.h1,
      url: canonical,
      numberOfItems: total || items.length,
      itemListElement: items.slice(0, 24).map((car, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: routeUrl(carRoute(car)),
        name: carTitle(car),
      })),
    };
    return {
      canonical,
      html: renderHtml({
        title: landing.seoTitle,
        description: landing.seoDescription,
        canonical,
        body,
        type: "website",
        indexable,
        schemas: [breadcrumbsSchema([["Главная", "/"], ["Автомобили", "/catalog/"], [landing.name, landing.path]]), itemList],
      }),
    };
  }

  /** Раздел каталога, которого нет: отвечаем 404, а не пустым каталогом. */
  function landingMissingPage() {
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><h1>Такого раздела каталога нет</h1><p>Возможно, ссылка устарела. Все автомобили с пробегом из Китая собраны в каталоге.</p><p><a href="${hrefRoute("/catalog/")}">Перейти в каталог автомобилей из Китая</a></p></main>${footer()}`;
    return renderHtml({
      title: "Раздел каталога не найден | evcars.by",
      description: "Такого раздела каталога нет. Все автомобили с пробегом из Китая собраны в каталоге evcars.by.",
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
    const paragraphs = (items) => items.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
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
  function modelPage({ modelPage: page, cars: items = [], total = 0, siblings = [], brandLanding = null, indexable = allowIndexing }) {
    const canonical = routeUrl(page.path);
    const cheapest = items.reduce((min, car) => {
      const landed = estimateLandedCost(car).totalUsd;
      return min === null || landed < min ? landed : min;
    }, null);
    // Строка с наличием и ценой — то, чего человек ждёт от запроса «сколько стоит».
    const availability = total
      ? `<p><strong>${escapeHtml(page.name)} в наличии: ${number(total)} ${plural(total, "автомобиль", "автомобиля", "автомобилей")}${cheapest ? `, от ${number(cheapest)} $ с доставкой до Минска` : ""}.</strong>${brandLanding ? ` Все <a href="${hrefRoute(brandLanding.path)}">автомобили ${escapeHtml(page.brand)} из Китая</a>.` : ""}</p>`
      : `<p>Сейчас ${escapeHtml(page.name)} в наличии нет. <a href="${hrefRoute("/catalog/")}">Посмотрите каталог</a> — он обновляется ежедневно.</p>`;
    const offers = items.length
      ? `<section><h2>${escapeHtml(page.name)} в наличии — цены до Минска</h2>${carLinks(items, 12)}${brandLanding ? `<p><a href="${hrefRoute(brandLanding.path)}">Все ${escapeHtml(page.brand)} в каталоге</a></p>` : ""}</section>`
      : "";
    const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/models/")}">О моделях авто</a></p><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.lead)}</p>${availability}${modelPageArticle(page)}${offers}${modelLinks(siblings, { heading: `Другие модели ${page.brand}`, skip: page.path })}</main>${footer()}`;
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
        itemListElement: items.slice(0, 12).map((car, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: routeUrl(carRoute(car)),
          name: carTitle(car),
        })),
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
      title: "Объявление больше не доступно | evcars.by",
      description: "Это объявление снято с продажи. Похожие автомобили с пробегом из Китая есть в каталоге evcars.by.",
      canonical: null,
      body,
      image: null,
      indexable: false,
    });
  }

  return { routeUrl, hrefRoute, metadata, navigation, footer, carLinks, sectionLinks, modelLinks, breadcrumbsSchema, organizationSchema, webSiteSchema, faqSchema, renderHtml, carPage, carGonePage, carDescription, landingPage, landingMissingPage, modelPageArticle, modelPage };
}

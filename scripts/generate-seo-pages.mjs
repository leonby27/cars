#!/usr/bin/env node
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { estimateLandedCost } from "../src/pricing.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = path.join(root, "dist", "client");
const shellPath = path.join(clientDir, "index.html");
const catalogPath = path.join(root, "public", "data", "cars.json");
const siteUrl = String(process.env.SITE_URL || "https://evcars.by").replace(/\/+$/, "");
const siteBasePath = new URL(siteUrl).pathname.replace(/\/+$/, "");
const allowIndexing = /^(1|true|yes)$/i.test(String(process.env.SEO_ALLOW_INDEXING || "false"));
const shell = readFileSync(shellPath, "utf8");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const cars = (catalog.cars || catalog.items || []).filter((car) => car && car.id);

const publicPages = [
  { route: "/", title: "Автомобили из Китая в Беларусь — evcars.by", description: "Автомобили с пробегом из Китая с проверкой, расчётом стоимости и доставкой в Минск и Беларусь.", h1: "Автомобили с пробегом из Китая с доставкой в Беларусь", lead: "Каталог актуальных объявлений, предварительный расчёт цены до Минска и проверка автомобиля перед оплатой." },
  { route: "/catalog/", title: "Автомобили с пробегом из Китая — каталог и цены | evcars.by", description: "Каталог автомобилей с пробегом из Китая: электромобили и гибриды, характеристики, пробег и ориентировочная стоимость доставки в Беларусь.", h1: "Автомобили с пробегом из Китая", lead: "Выберите автомобиль, изучите характеристики и получите предварительный расчёт стоимости до Минска." },
  { route: "/how-it-works/", title: "О сервисе покупки автомобилей из Китая | evcars.by", description: "Проверка объявления и автомобиля, договор, оплата, выкуп, доставка и выдача автомобиля из Китая в Минске.", h1: "О сервисе evcars.by", lead: "Сначала подтверждаем наличие, состояние и полную смету. После согласования заключаем договор, выкупаем автомобиль и доставляем его в Минск." },
  { route: "/about/", title: "О сервисе доставки автомобилей из Китая | evcars.by", description: "evcars.by помогает выбрать, проверить, выкупить и доставить автомобиль с пробегом из Китая в Беларусь.", h1: "О сервисе evcars.by", lead: "Мы собираем объявления китайского вторичного рынка, переводим данные и сопровождаем покупку до выдачи автомобиля в Минске." },
  { route: "/delivered/", title: "Доставленные автомобили из Китая — примеры и цены | evcars.by", description: "Примеры автомобилей, доставленных из Китая в Беларусь: маршрут, сроки, пробег и итоговая стоимость до Минска.", h1: "Доставленные автомобили из Китая", lead: "Истории доставки с маршрутом, сроками, итоговой стоимостью и решениями, принятыми после проверки автомобиля." },
  { route: "/payment-and-contract/", title: "Оплата и договор при покупке авто из Китая | evcars.by", description: "Этапы оплаты автомобиля из Китая, условия договора, состав стоимости, ответственность сторон и документы.", h1: "Оплата и договор", lead: "До оплаты фиксируем выбранный автомобиль, состав услуг, порядок расчётов и ответственность сторон." },
  { route: "/guarantees/", title: "Гарантии при покупке автомобиля из Китая | evcars.by", description: "Что проверяется и фиксируется при покупке автомобиля из Китая, за что отвечает evcars.by и какие риски обсуждаются до договора.", h1: "Гарантии и ответственность", lead: "Фиксируем проверку, документы, платежи и сопровождение доставки, не подменяя факты обещаниями." },
  { route: "/faq/", title: "Вопросы о покупке и доставке авто из Китая | evcars.by", description: "Ответы о проверке, стоимости, оплате, сроках доставки, таможенном оформлении и покупке автомобиля из Китая в Беларуси.", h1: "Вопросы о покупке автомобиля из Китая", lead: "Короткие ответы о проверке, цене, договоре, оплате, доставке и ответственности." },
  { route: "/contacts/", title: "Контакты evcars.by — автомобили из Китая в Минске", description: "Контакты сервиса evcars.by в Минске. Консультация по выбору, проверке, покупке и доставке автомобиля из Китая.", h1: "Контакты evcars.by", lead: "Обсудим бюджет, подбор, проверку, договор и доставку автомобиля из Китая в Беларусь." },
  { route: "/privacy/", title: "Политика конфиденциальности | evcars.by", description: "Политика обработки и защиты персональных данных пользователей сайта evcars.by.", h1: "Политика конфиденциальности", lead: "Правила получения, использования, хранения и удаления персональных данных." },
  { route: "/terms/", title: "Условия использования сайта | evcars.by", description: "Условия использования каталога evcars.by, предварительных расчётов и информации об автомобилях из Китая.", h1: "Условия использования сайта", lead: "Информация каталога и расчёты являются предварительными; финальные условия фиксируются после проверки и в договоре." },
];

const privateRoutes = ["/favorites/", "/login/", "/register/", "/account/", "/analytics/"];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const escapeXml = (value) => escapeHtml(value).replace(/'/g, "&apos;");
const jsonLd = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const routeUrl = (route) => `${siteUrl}${route === "/" ? "/" : route}`;
const hrefRoute = (route) => `${siteBasePath}${route}` || "/";
const carRoute = (car) => `/cars/${encodeURIComponent(car.id)}/`;
const carTitle = (car) => car.title || [car.brand, car.model, car.year].filter(Boolean).join(" ");
const number = (value) => new Intl.NumberFormat("ru-RU").format(Number(value) || 0);
const isoDate = (value) => {
  const date = new Date(value || "");
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

function stripSeoHead(html) {
  return html
    .replace(/\s*<title>[\s\S]*?<\/title>/gi, "")
    .replace(/\s*<meta\s+(?:name|property)=["'](?:description|robots|googlebot|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, "")
    .replace(/\s*<link\s+rel=["']canonical["'][^>]*>/gi, "")
    .replace(/\s*<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

function metadata({ title, description, canonical, image, type = "website", indexable, schemas = [] }) {
  const robots = indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow, noarchive";
  const imageTags = image ? `
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />` : "";
  return `
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robots}" />
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <link rel="alternate" hreflang="ru-BY" href="${escapeHtml(canonical)}" />
    <meta property="og:locale" content="ru_BY" />
    <meta property="og:type" content="${type}" />
    <meta property="og:site_name" content="evcars.by" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />${imageTags}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${schemas.map((schema) => `<script type="application/ld+json">${jsonLd(schema)}</script>`).join("\n    ")}`;
}

function navigation() {
  return `<header class="site-header"><nav class="page-width" aria-label="Основная навигация">
    <a href="${hrefRoute("/")}">evcars.by</a>
    <a href="${hrefRoute("/catalog/")}">Автомобили</a>
    <a href="${hrefRoute("/how-it-works/")}">О сервисе</a>
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

function publicPageBody(page) {
  const links = page.route === "/" ? carLinks(cars, 20) : page.route === "/catalog/" ? carLinks(cars, 48) : "";
  return `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a></p><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.lead)}</p>${links ? `<section><h2>Актуальные предложения</h2>${links}</section>` : ""}</main>${footer()}`;
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
    logo: `${siteUrl}/og.png`,
    areaServed: { "@type": "Country", name: "Беларусь" },
  };
}

function renderHtml({ title, description, canonical, body, image = `${siteUrl}/og.png`, type, indexable = allowIndexing, schemas = [] }) {
  const head = metadata({ title, description, canonical, image, type, indexable, schemas });
  return stripSeoHead(shell)
    .replace(/<html\s+lang="ru"[^>]*>/i, `<html lang="ru" data-seo-indexing="${indexable}">`)
    .replace("</head>", `${head}\n  </head>`)
    .replace(/<div id="root"><\/div>/, `<div id="root">${body}</div>`);
}

function writeRoute(route, html) {
  const relative = route === "/" ? "index.html" : path.join(route.replace(/^\/+|\/+$/g, ""), "index.html");
  const target = path.join(clientDir, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, html);
}

for (const page of publicPages) {
  const schemas = [breadcrumbsSchema(page.route === "/" ? [["Главная", "/"]] : [["Главная", "/"], [page.h1, page.route]])];
  if (page.route === "/") schemas.unshift(organizationSchema());
  writeRoute(page.route, renderHtml({ ...page, canonical: routeUrl(page.route), body: publicPageBody(page), schemas }));
}

for (const car of cars) {
  const titleText = carTitle(car);
  const route = carRoute(car);
  const canonical = routeUrl(route);
  const landed = estimateLandedCost(car);
  const description = `${titleText}: пробег ${number(car.mileage)} км, ${String(car.type || "автомобиль").toLowerCase()}, ориентировочная цена до Минска — ${number(landed.totalUsd)} $. Проверка перед покупкой.`;
  const image = /^https:\/\//.test(String(car.image || "")) ? car.image : null;
  const related = cars.filter((candidate) => candidate.id !== car.id && candidate.brand === car.brand).slice(0, 8);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: titleText,
    url: canonical,
    image: image ? [image] : undefined,
    vehicleModelDate: String(car.year || ""),
    mileageFromOdometer: { "@type": "QuantitativeValue", value: Number(car.mileage) || 0, unitCode: "KMT" },
    fuelType: car.type || undefined,
    description,
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "USD",
      price: landed.totalUsd,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
    },
  };
  const body = `${navigation()}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a> → <a href="${hrefRoute("/catalog/")}">Автомобили</a></p><article><h1>${escapeHtml(titleText)}</h1>${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(titleText)}" width="750" height="500" />` : ""}<p>${escapeHtml(description)}</p><h2>Характеристики</h2><dl><dt>Год</dt><dd>${escapeHtml(car.year)}</dd><dt>Пробег</dt><dd>${number(car.mileage)} км</dd><dt>Тип</dt><dd>${escapeHtml(car.type)}</dd><dt>Привод</dt><dd>${escapeHtml(car.drive)}</dd><dt>Ориентировочная цена до Минска</dt><dd>${number(landed.totalUsd)} $</dd></dl></article>${related.length ? `<section><h2>Другие автомобили ${escapeHtml(car.brand)}</h2>${carLinks(related)}</section>` : ""}</main>${footer()}`;
  writeRoute(route, renderHtml({ title: `${titleText}, ${number(car.mileage)} км — цена до Минска | evcars.by`, description, canonical, body, image, type: "product", schemas: [breadcrumbsSchema([["Главная", "/"], ["Автомобили", "/catalog/"], [titleText, route]]), schema] }));
}

for (const route of privateRoutes) {
  const name = route.split("/").filter(Boolean).join(" ") || "Личный раздел";
  writeRoute(route, renderHtml({ title: `${name} | evcars.by`, description: "Личный раздел пользователя evcars.by.", canonical: routeUrl(route), body: `<main class="page-width"><h1>Личный раздел</h1><p>Для работы этой страницы требуется JavaScript.</p></main>`, image: null, indexable: false }));
}

const privateHtml = renderHtml({ title: "Личный раздел | evcars.by", description: "Личный раздел пользователя evcars.by.", canonical: routeUrl("/account/"), body: `<main class="page-width"><h1>Личный раздел</h1><p>Для работы этой страницы требуется JavaScript.</p></main>`, image: null, indexable: false });
writeFileSync(path.join(clientDir, "private.html"), privateHtml);

const notFoundHtml = renderHtml({ title: "Страница не найдена | evcars.by", description: "Запрошенная страница не найдена.", canonical: routeUrl("/404/"), body: `${navigation()}<main class="page-width"><h1>Страница не найдена</h1><p><a href="${hrefRoute("/")}">Вернуться на главную</a></p></main>${footer()}`, image: null, indexable: false });
writeFileSync(path.join(clientDir, "404.html"), notFoundHtml);

const pageEntries = publicPages.map((page) => ({ loc: routeUrl(page.route), lastmod: null }));
const carEntries = cars.map((car) => ({ loc: routeUrl(carRoute(car)), lastmod: isoDate(car.updated || car.importedAt) }));
const urlset = (entries) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
writeFileSync(path.join(clientDir, "sitemap-pages.xml"), urlset(pageEntries));
writeFileSync(path.join(clientDir, "sitemap-cars.xml"), urlset(carEntries));
writeFileSync(path.join(clientDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>${escapeXml(siteUrl)}/sitemap-pages.xml</loc></sitemap>\n  <sitemap><loc>${escapeXml(siteUrl)}/sitemap-cars.xml</loc></sitemap>\n</sitemapindex>\n`);

const robots = allowIndexing
  ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\nDisallow: /account/\nDisallow: /favorites/\nDisallow: /login/\nDisallow: /register/\nDisallow: /orders/\nDisallow: /analytics/\n\nSitemap: ${siteUrl}/sitemap.xml\n`
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
  "firstSeenAt", "importedAt",
];
const compactCars = cars.map((car) => ({
  ...Object.fromEntries(summaryKeys.filter((key) => car[key] !== undefined).map((key) => [key, car[key]])),
  title: carTitle(car),
  images: car.image ? [car.image] : [],
  _summary: true,
}));
const compactPayload = JSON.stringify({ generatedAt:catalog.generatedAt || null, cars:compactCars });
writeFileSync(path.join(clientDir, "data", "catalog.json"), compactPayload);
writeFileSync(path.join(clientDir, "data", "catalog.json.gz"), gzipSync(compactPayload, { level:9 }));
for (const car of cars) {
  const target = path.join(clientDir, "data", "cars", `${encodeURIComponent(car.id)}.json`);
  mkdirSync(path.dirname(target), { recursive:true });
  writeFileSync(target, JSON.stringify(car));
}
rmSync(path.join(clientDir, "data", "cars.json"), { force:true });

console.log(`Generated ${publicPages.length} public pages, ${cars.length} vehicle pages, sitemaps and robots.txt (indexing ${allowIndexing ? "enabled" : "disabled"}).`);

#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { normalizeDrive } from "../src/drive-types.js";
import { MODEL_PAGES, MODELS_INDEX } from "../src/model-pages.js";
import { CATALOG_LANDINGS } from "../src/catalog-landings.js";
import { TOOL_PAGES } from "../src/tool-pages.js";
import { EV_QUOTA, evQuotaState } from "../src/ev-quota.js";
// Тексты информационных страниц берём из тех же данных, по которым их рисует
// приложение: в разметке этих девяти страниц было по 32–43 слова — заголовок и одна
// фраза, — а всё остальное появлялось только после запуска сайта в браузере.
import { FAQ_GROUPS, HOME_FAQ, HOME_ORDER_STEPS, PAYMENT_STAGES, RESPONSIBILITY_ITEMS } from "../src/purchase-info.js";
import { DELIVERY_CASES, DELIVERY_STATS } from "../src/delivery-cases.js";
import { LEGAL_COPY } from "../src/legal-copy.js";
import { COMPANY } from "../src/company-data.js";
import { ABOUT_LIMITS, ABOUT_PIPELINE, ABOUT_PRINCIPLES, ABOUT_PURPOSE, BEFORE_PAYMENT, PURCHASE_STEPS, SERVICE_PROOF, SERVICE_SECTIONS } from "../src/service-copy.js";
// Разметку страниц держит общий модуль: этими же функциями сервер собирает страницу
// машины в момент запроса. Пока разметка жила только здесь, серверная страница
// расходилась бы со статической при каждой правке.
import { carRoute, carTitle, createSeoRenderer, escapeHtml, escapeXml, isoDate, listingNumber, number, plural, stripSeoHead } from "../server/seo-render.mjs";

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
const siteUrl = String(process.env.SITE_URL || "https://evcars.by").replace(/\/+$/, "");
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
const { carLinks, footer, hrefRoute, navigation, renderHtml, routeUrl } = renderer;
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
  // Общая страница «О моделях авто». Сами обзоры файлами не собираются: их отдаёт
  // сервер, потому что в них нужны живые цены и наличие. Готовый файл по такому адресу
  // перекрыл бы правило переадресации, и сервер до отрисовки не дошёл бы.
  { route: `${MODELS_INDEX.path}/`, title: MODELS_INDEX.seoTitle, description: MODELS_INDEX.seoDescription, h1: MODELS_INDEX.h1, lead: MODELS_INDEX.lead, modelsIndex: true },
  // Страницы-инструменты: квота, растаможка, стоимость доставки, калькулятор. Файлами,
  // а не сервером: их содержимое не зависит от каталога, а остаток квоты обновляется
  // ежедневной задачей, которая и так пересобирает сайт.
  ...TOOL_PAGES.map((tool) => ({ route: `${tool.path}/`, title: tool.seoTitle, description: tool.seoDescription, h1: tool.h1, lead: tool.lead, tool })),
];

const privateRoutes = ["/favorites/", "/searches/", "/login/", "/register/", "/account/", "/analytics/"];

// Текст информационной страницы из тех же данных, что показывает приложение. Ничего
// нового здесь не пишется: это ровно то, что видит человек.
// Текст страницы-инструмента. Цифры берутся из тех же данных, что и расчёт в карточке,
// поэтому страница не расходится с каталогом.
function toolArticle(tool) {
  const paragraphs = (items) => items.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
  const sections = tool.sections
    .map((section) => `<section><h2>${escapeHtml(section.title)}</h2>${paragraphs(section.paragraphs)}</section>`)
    .join("");
  let live = "";
  if (tool.kind === "quota") {
    const state = evQuotaState();
    const rows = [...EV_QUOTA.reports].reverse().slice(0, 12);
    // Живая часть страницы: остаток, темп и история сводок. Это то, за чем сюда придут.
    live = `<section><h2>Сколько осталось сейчас</h2><p><strong>Гражданам доступно ещё ${number(state.remaining)} ${plural(state.remaining, "электромобиль", "электромобиля", "электромобилей")}</strong> из ${number(state.total)} по квоте ${EV_QUOTA.year} года — по сводке на ${escapeHtml(state.asOfLabel)}.</p>${
      state.perWeek ? `<p>Темп расхода — около ${number(state.perWeek)} машин в неделю.${state.runsOutLabel && !state.overdue ? ` При таком темпе квота заканчивается около ${escapeHtml(state.runsOutLabel)}.` : ""}</p>` : ""
    }<p>Квота для торгового оборота (юридические лица) объёмом ${number(EV_QUOTA.businessTotal)} машин выбрана полностью${state.exhaustedOnLabel ? "" : ""}.</p></section><section><h2>История сводок таможни</h2><table><thead><tr><th scope="col">Дата сводки</th><th scope="col">Осталось у граждан</th><th scope="col">Осталось у юрлиц</th></tr></thead><tbody>${rows
      .map(([date, personal, business]) => `<tr><th scope="row">${escapeHtml(date)}</th><td>${personal === null ? "не названо" : number(personal)}</td><td>${business === null ? "не названо" : number(business)}</td></tr>`)
      .join("")}</tbody></table><p>Источник — недельные сводки Государственного таможенного комитета. Квота ${EV_QUOTA.year} года действует с ${escapeHtml(EV_QUOTA.startedOn)}.</p></section>`;
  }
  return `${paragraphs(tool.intro)}${live}${sections}<p>${escapeHtml(tool.disclaimer)}</p>`;
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
    ).join("")}</section><section><h2>${escapeHtml(SERVICE_SECTIONS[1].title)}</h2><p>${escapeHtml(SERVICE_SECTIONS[1].text)}</p><p>До оплаты автомобиля вы получите:</p><ul>${BEFORE_PAYMENT.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
  }
  if (route === "/about/") {
    return `<p>${escapeHtml(ABOUT_PURPOSE)}</p><section><h2>Как мы работаем</h2>${list(ABOUT_PRINCIPLES.map((item) => [item.title, item.text]))}</section><section><h2>${escapeHtml(ABOUT_PIPELINE.title)}</h2><p>${escapeHtml(ABOUT_PIPELINE.text)}</p><ul>${ABOUT_PIPELINE.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul></section><section><h2>Чего мы не делаем</h2>${list(ABOUT_LIMITS.map((item) => [item.title, item.text]))}</section>`;
  }
  const legal = route === "/privacy/" ? LEGAL_COPY.privacy : route === "/terms/" ? LEGAL_COPY.terms : null;
  if (legal) {
    return `<p>${escapeHtml(legal.intro)}</p>${legal.sections.map(([title, text]) => `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`).join("")}<p>Редакция от 15 августа 2026 года.</p>`;
  }
  return "";
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

function publicPageBody(page) {
  // Блок с предложениями появляется только когда есть что в него положить: заголовок
  // над пустым списком читается поисковиком как сломанная страница.
  const linkLimit = page.route === "/" ? 20 : page.route === "/catalog/" ? 48 : 0;
  const links = linkLimit && cars.length ? carLinks(cars, linkLimit) : "";
  const article = page.tool ? toolArticle(page.tool) : page.modelsIndex ? modelsIndexArticle() : infoArticle(page.route);
  // Ссылки на разделы каталога — на главной и в каталоге. Раньше с этих двух страниц
  // вели ровно двенадцать ссылок (меню и подвал), и в 31 раздел нельзя было попасть
  // ниоткуда, кроме карты сайта: плитку марок рисует скрипт, в разметке её нет.
  const sections = page.route === "/" || page.route === "/catalog/" ? renderer.sectionLinks(CATALOG_LANDINGS, { heading: "Автомобили из Китая по маркам и типам" }) : "";
  return `${navigation(MODELS_INDEX.path)}<main class="page-width seo-prerender"><p><a href="${hrefRoute("/")}">Главная</a></p><h1>${escapeHtml(page.h1)}</h1><p>${escapeHtml(page.lead)}</p>${article}${links ? `<section><h2>Актуальные предложения</h2>${links}</section>` : ""}${sections}</main>${footer()}`;
}

for (const page of publicPages) {
  const schemas = [renderer.breadcrumbsSchema(page.route === "/" ? [["Главная", "/"]] : [["Главная", "/"], [page.h1, page.route]])];
  if (page.route === "/") schemas.unshift(renderer.organizationSchema(), renderer.webSiteSchema());
  // Вопросы со страницы «Вопросы и ответы» — по этой разметке они попадают
  // в выдачу раскрывающимся списком. На страницах моделей это уже работает.
  if (page.route === "/faq/") schemas.push(renderer.faqSchema(FAQ_GROUPS.flatMap((group) => group.items.map((item) => ({ q: item.question, a: item.answer })))));
  writeRoute(page.route, renderHtml({ ...page, canonical: routeUrl(page.route), body: publicPageBody(page), schemas }));
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
  writeRoute(route, renderHtml({ title: `${name} | evcars.by`, description: "Личный раздел пользователя evcars.by.", canonical: routeUrl(route), body: `<main class="page-width"><h1>Личный раздел</h1><p>Для работы этой страницы требуется JavaScript.</p></main>`, image: null, indexable: false }));
}

const privateHtml = renderHtml({ title: "Личный раздел | evcars.by", description: "Личный раздел пользователя evcars.by.", canonical: routeUrl("/account/"), body: `<main class="page-width"><h1>Личный раздел</h1><p>Для работы этой страницы требуется JavaScript.</p></main>`, image: null, indexable: false });
writeFileSync(path.join(clientDir, "private.html"), privateHtml);

const notFoundHtml = renderHtml({ title: "Страница не найдена | evcars.by", description: "Запрошенная страница не найдена.", canonical: routeUrl("/404/"), body: `${navigation(MODELS_INDEX.path)}<main class="page-width"><h1>Страница не найдена</h1><p><a href="${hrefRoute("/")}">Вернуться на главную</a></p></main>${footer()}`, image: null, indexable: false });
writeFileSync(path.join(clientDir, "404.html"), notFoundHtml);

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
  title: "Автомобиль с пробегом из Китая — цена до Минска | evcars.by",
  description: "Характеристики, пробег, состояние и ориентировочная стоимость автомобиля с пробегом из Китая с доставкой в Минск.",
  canonical: null,
  body: `${navigation(MODELS_INDEX.path)}<main class="page-width"><h1>Автомобиль с пробегом из Китая</h1><p>Загружаем карточку автомобиля: характеристики, фотографии и ориентировочную стоимость до Минска.</p><p><a href="${hrefRoute("/catalog/")}">Все автомобили в каталоге</a></p></main>${footer()}`,
  type: "product",
});
writeFileSync(path.join(clientDir, "car.html"), carShellHtml);

// ── Карты сайта ───────────────────────────────────────────────────────────────
const urlset = (entries) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;

/**
 * Адреса машин для карты сайта. Из дампа каталога, если он есть; иначе — из базы,
 * одним запросом за номером объявления и датой последней записи. База может быть
 * недоступна (сборка без доступа к ней) — тогда карта машин просто не пишется, и в
 * выводе об этом сказано: молча отдать поисковику сайт без тридцати тысяч карточек хуже.
 */
async function carSitemapEntries() {
  if (!carsSitemap) return [];
  if (cars.length) return cars.map((car) => ({ loc: routeUrl(carRoute(car)), lastmod: isoDate(car.updated || car.importedAt) }));
  if (!carsFromDatabase) {
    console.warn("Карта сайта с машинами не собрана: дампа каталога нет, а чтение из базы не разрешено (SEO_CARS_FROM_DB=1).");
    return [];
  }
  let pool = null;
  try {
    ({ pool } = await import("../server/db.mjs"));
    // `content_changed_at` ставится только когда данные объявления действительно
    // изменились (см. миграцию 021). `imported_at` для этого не годится: она одинаковая
    // у всех карточек, потому что приходит из последнего полного импорта, — и поисковику
    // мы сообщали «ничего не менялось» даже при изменении цены.
    const result = await pool.query("SELECT l.id, COALESCE(l.content_changed_at, l.imported_at) AS changed_at FROM listings l WHERE l.status='active'");
    return result.rows.map((row) => ({ loc: routeUrl(`/cars/${encodeURIComponent(listingNumber(row.id))}/`), lastmod: isoDate(row.changed_at) }));
  } catch (error) {
    console.warn(`Карта сайта с машинами не собрана: база недоступна (${error.code || error.message}).`);
    return [];
  } finally {
    // Соединение закрываем всегда: иначе сборка висела бы, ожидая простаивающий пул.
    await pool?.end().catch(() => {});
  }
}

// Разделы каталога (`/catalog/byd`, `/catalog/electric`, `/catalog/suv`) в карту сайта
// попадают, а файлами не собираются: их отдаёт сервер. Готовый файл по такому адресу
// перекрыл бы правило переадресации, и сервер до отрисовки не дошёл бы.
const pageEntries = [
  ...publicPages.map((page) => ({ loc: routeUrl(page.route), lastmod: null })),
  ...MODEL_PAGES.map((modelPage) => ({ loc: routeUrl(modelPage.path), lastmod: null })),
  ...CATALOG_LANDINGS.map((landing) => ({ loc: routeUrl(landing.path), lastmod: null })),
];
writeFileSync(path.join(clientDir, pagesSitemapName), urlset(pageEntries));

const carEntries = await carSitemapEntries();
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
      // параметрами, с чистым адресом раздела. Первоисточник у нас и так указан, но
      // Яндекс по Clean-param не тратит на такие адреса обход вообще.
      "Clean-param: sort&brand&model&type&body&color&drive&yearFrom&yearTo&priceFrom&priceTo&mileage&owners&battery&range&accel&tire&torque&condition&q /catalog",
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
  "firstSeenAt", "importedAt",
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
console.log(`Generated ${publicPages.length} public pages, ${MODEL_PAGES.length} model reviews and ${CATALOG_LANDINGS.length} catalog sections (server-rendered), ${cars.length} vehicle pages${vehiclePages ? "" : " (страницы машин собирает сервер в момент запроса)"}, sitemaps and robots.txt (indexing ${allowIndexing ? "enabled" : "disabled"}).`);
console.log(`Адресов машин в карте сайта: ${carsInSitemap}${carsSitemap ? "" : " (включается SEO_CARS_SITEMAP=1 или открытой индексацией)"}.`);
// Адрес карты нигде не публикуется, поэтому печатаем его здесь: именно эту ссылку
// вставляют в Google Search Console и Яндекс.Вебмастер.
console.log(`Карта сайта (в robots.txt не указана, добавить вручную в Search Console и Вебмастер): ${siteUrl}/${sitemapIndexName}`);

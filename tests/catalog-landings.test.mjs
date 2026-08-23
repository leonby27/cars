import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CATALOG_LANDINGS, brandLandingPath, catalogLandingForFilters, catalogLandingForParams, catalogLandingRedirect, findCatalogLanding, landingApiParams, landingFilterParams, relatedLandings } from "../src/catalog-landings.js";
import { createSeoRenderer, plural } from "../server/seo-render.mjs";

const shell = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>evcars.by</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const render = (options = {}) => createSeoRenderer({ shell, siteUrl: "https://evcars.by", allowIndexing: true, ...options });

const cars = [
  { id: "che168-1", title: "BYD Han 2023", brand: "BYD", model: "Han", year: 2023, mileage: 21400, chinaPrice: 128000, type: "Электромобиль" },
  { id: "che168-2", title: "BYD Seal 2024", brand: "BYD", model: "Seal", year: 2024, mileage: 12000, chinaPrice: 145000, type: "Электромобиль" },
];

test("у каждого раздела свой адрес, заголовок и описание", () => {
  const paths = CATALOG_LANDINGS.map((landing) => landing.path);
  const titles = CATALOG_LANDINGS.map((landing) => landing.seoTitle);
  assert.equal(new Set(paths).size, paths.length, "адреса разделов повторяются");
  assert.equal(new Set(titles).size, titles.length, "заголовки разделов повторяются");
  for (const landing of CATALOG_LANDINGS) {
    assert.match(landing.path, /^\/catalog\/[a-z0-9-]+$/, landing.path);
    assert.ok(landing.seoTitle.length <= 70, `${landing.path}: заголовок ${landing.seoTitle.length} символов`);
    assert.ok(landing.seoDescription.length >= 70 && landing.seoDescription.length <= 175, `${landing.path}: описание ${landing.seoDescription.length} символов`);
    assert.ok(landing.notes.length >= 1, `${landing.path}: нет текста`);
    for (const note of landing.notes) assert.ok(note.length > 80, `${landing.path}: текст слишком короткий`);
  }
});

test("раздел находится по адресу и задаёт свой фильтр", () => {
  assert.equal(findCatalogLanding("/catalog/byd").brand, "BYD");
  // Косая черта на конце адреса не должна ломать поиск раздела.
  assert.equal(findCatalogLanding("/catalog/byd/").brand, "BYD");
  assert.equal(findCatalogLanding("/catalog/nonsense"), null);
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/byd")).get("brand"), "BYD");
  // В адресе каталога тип двигателя называется во множественном числе, а в запросе
  // к базе — в единственном. Без этого страница типа показывала бы весь каталог.
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/electric")).get("type"), "Электромобили");
  assert.equal(landingApiParams(findCatalogLanding("/catalog/electric")).get("type"), "Электромобиль");
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/hybrid")).get("type"), "Гибриды");
  // Кузов в адресе страницы называется `body`, а в запросе к каталогу — `bodyType`:
  // из-за этого расхождения страница кузова показывала бы весь каталог.
  assert.equal(landingFilterParams(findCatalogLanding("/catalog/suv")).get("body"), "SUV / кроссовер");
  assert.equal(landingApiParams(findCatalogLanding("/catalog/suv")).get("bodyType"), "SUV / кроссовер");
});

test("ссылка на марку с главной ведёт на её страницу", () => {
  // Иначе ссылка ведёт на адрес с параметром, а он указывает поисковику на общий
  // каталог — то есть страницы под марку по такой ссылке не существует.
  assert.equal(brandLandingPath("BYD"), "/catalog/byd");
  assert.equal(brandLandingPath("Li Auto"), "/catalog/li-auto");
  assert.equal(brandLandingPath("Lynk & Co"), "/catalog/lynk-co");
  assert.equal(brandLandingPath("Такой марки нет"), null);
});

test("страница раздела отдаётся с текстом, машинами и разметкой списка", () => {
  const landing = findCatalogLanding("/catalog/byd");
  const modelPages = [{ path: "/models/byd-han", name: "BYD Han" }];
  // Блок «другие разделы» группирует их по виду, поэтому нужен настоящий раздел.
  const others = [findCatalogLanding("/catalog/tesla"), findCatalogLanding("/catalog/electric")];
  const { html } = render().landingPage({ landing, cars, total: 5673, modelPages, others });
  assert.match(html, /<title>BYD из Китая — каталог с ценами до Минска \| evcars\.by<\/title>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/evcars\.by\/catalog\/byd"/);
  assert.match(html, /<h1>Автомобили BYD из Китая с доставкой в Беларусь<\/h1>/);
  assert.match(html, /В наличии 5[^<]*673 автомобиля/);
  // Текст раздела лежит в самой странице, а не подгружается скриптом.
  assert.match(html, /собственный тип батареи Blade/);
  // Ссылки: машины, обзор модели, соседний раздел.
  assert.match(html, /<a href="\/cars\/1">BYD Han 2023<\/a>/);
  assert.match(html, /<a href="\/models\/byd-han">BYD Han<\/a>/);
  assert.match(html, /<a href="\/catalog\/tesla">Tesla<\/a>/);
  assert.match(html, /"@type":"ItemList"/);
  assert.match(html, /"numberOfItems":5673/);
  assert.match(html, /"@type":"BreadcrumbList"/);
  // Адреса без косой черты на конце — хостинг с чертой перебрасывает.
  assert.doesNotMatch(html, /<a href="\/[^"]+\/"/);
  assert.doesNotMatch(html, /"item":"https:\/\/evcars\.by\/[^"]+\/"/);
});

test("пустой раздел не показывает пустой список", () => {
  const { html } = render().landingPage({ landing: findCatalogLanding("/catalog/wagon"), cars: [], total: 0 });
  assert.doesNotMatch(html, /<ul><\/ul>/);
  assert.match(html, /<a href="\/catalog">Все автомобили с пробегом из Китая<\/a>/);
});

test("несуществующий раздел не притворяется страницей", () => {
  const html = render().landingMissingPage();
  assert.match(html, /<h1>Такого раздела каталога нет<\/h1>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(html, /rel="canonical"/);
});

test("на закрытой сборке раздел не индексируется", () => {
  const { html } = render({ allowIndexing: false }).landingPage({ landing: findCatalogLanding("/catalog/byd"), cars, total: 2 });
  assert.match(html, /<meta name="robots" content="noindex, nofollow, noarchive"/);
});

test("числа склоняются по-русски", () => {
  const word = (n) => plural(n, "автомобиль", "автомобиля", "автомобилей");
  assert.equal(word(1), "автомобиль");
  assert.equal(word(2), "автомобиля");
  assert.equal(word(5), "автомобилей");
  assert.equal(word(11), "автомобилей");
  assert.equal(word(21), "автомобиль");
  assert.equal(word(5673), "автомобиля");
});

// ── Общая страница каталога ───────────────────────────────────────────────────

test("общая страница каталога показывает машины, разделы и свой адрес", () => {
  // Файлом она собиралась вхолостую: на хостинге дампа каталога нет, и в странице
  // не оставалось ни одной ссылки на машину. Сервер берёт список из базы.
  const { html } = render().catalogIndexPage({ cars, total: 32916, sections: CATALOG_LANDINGS });
  assert.match(html, /<h1>Автомобили с пробегом из Китая<\/h1>/);
  assert.match(html, /В каталоге 32[\s\u00a0\u202f]916 автомобилей/);
  assert.match(html, /<a href="\/cars\/1">BYD Han 2023<\/a>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/evcars\.by\/catalog"/);
  assert.match(html, /"@type":"ItemList"/);
  const sections = [...html.matchAll(/<a href="\/catalog\/[a-z0-9-]+"/g)];
  assert.ok(sections.length >= 25, `ссылок на разделы ${sections.length}, ожидалось не меньше 25`);
  assert.match(html, /<a href="\/catalog\/byd">/);
  // Внутренние ссылки без косой черты на конце — хостинг с чертой перебрасывает.
  assert.doesNotMatch(html, /<a href="\/[^"]+\/"/);
});

test("пустой каталог не обещает предложений", () => {
  const { html } = render().catalogIndexPage({ cars: [], total: 0, sections: CATALOG_LANDINGS });
  assert.doesNotMatch(html, /Актуальные предложения/);
  assert.doesNotMatch(html, /В каталоге 0/);
});

// ── Адрес каталога с фильтрами ────────────────────────────────────────────────

test("адрес каталога с фильтрами раздела уводит на раздел", () => {
  // `/catalog?brand=BYD` показывает то же, что `/catalog/byd`. Пока такой адрес отдавал
  // общий каталог, поисковику сообщалось, что первоисточник этой выдачи — каталог
  // целиком: ссылки на марку доставались не разделу марки.
  assert.equal(catalogLandingRedirect("brand=BYD"), "/catalog/byd");
  assert.equal(catalogLandingRedirect("type=Электромобили"), "/catalog/electric");
  assert.equal(catalogLandingRedirect("body=SUV / кроссовер"), "/catalog/suv");
  assert.equal(catalogLandingRedirect("type=Электромобили&body=SUV / кроссовер"), "/catalog/electric-suv");
  assert.equal(catalogLandingRedirect("brand=BYD&body=Седан"), "/catalog/byd-sedan");
  // Регистр в адресе бывает любым — раздел от этого не меняется.
  assert.equal(catalogLandingRedirect("brand=byd"), "/catalog/byd");
});

test("каждый раздел узнаётся по своим же фильтрам", () => {
  // Круговая проверка: раздел задаёт фильтры, по фильтрам должен находиться он же.
  // Если разойдётся, приложение на такой странице сразу уведёт посетителя на другой
  // адрес — оно тем же разбором решает, какому разделу отвечает выбранное в фильтрах.
  for (const landing of CATALOG_LANDINGS) {
    const found = catalogLandingForParams(landingFilterParams(landing));
    assert.equal(found?.path, landing.path, `раздел ${landing.path} по своим фильтрам находится как ${found?.path ?? "ничто"}`);
  }
});

test("поиск с главной уносит в адрес все фильтры сразу, и это тоже раздел", () => {
  // Форма поиска дописывает в адрес и незаполненные списки — их подписи означают
  // «не выбрано». Без этого `/catalog?brand=BYD&type=Все&…` разделом бы не признался.
  const url = "type=Все&brand=BYD&mileage=Пробег&drive=Привод&owners=Владельцы&battery=Батарея&condition=Состояние";
  assert.equal(catalogLandingRedirect(url), "/catalog/byd");
  assert.equal(catalogLandingRedirect("type=Электромобили&brand=Все марки&model=Все модели&body=Все кузова"), "/catalog/electric");
});

test("часть раздела и лишние фильтры разделом не считаются", () => {
  // У этих выдач своей страницы нет: перебрасывать их на раздел значит показать
  // человеку не то, что он выбрал.
  assert.equal(catalogLandingForParams("brand=BYD&model=Han"), null);
  assert.equal(catalogLandingForParams("brand=BYD&yearFrom=2023"), null);
  assert.equal(catalogLandingForParams("brand=BYD&brand=Zeekr"), null);
  assert.equal(catalogLandingForParams("body=Седан,Хэтчбек"), null);
  assert.equal(catalogLandingForParams("q=byd han до 25000"), null);
  assert.equal(catalogLandingForParams(""), null);
  assert.equal(catalogLandingForParams("sort=price_asc"), null);
});

test("переброс сохраняет метки переходов и порядок сортировки", () => {
  // Иначе переход из рекламы или письма терялся бы в статистике.
  assert.equal(catalogLandingRedirect("brand=BYD&utm_source=telegram"), "/catalog/byd?utm_source=telegram");
  assert.equal(catalogLandingRedirect("brand=BYD&sort=price_desc"), "/catalog/byd?sort=price_desc");
});

test("подписи «не выбрано» перечислены все", () => {
  // Список подписей в src/catalog-landings.js повторяет константы ANY_* приложения.
  // Появится новый фильтр — этот тест не даст списку отстать.
  const sources = ["../src/App.jsx", "../src/drive-types.js"].map((file) => readFileSync(new URL(file, import.meta.url), "utf8"));
  const labels = sources.flatMap((code) => [...code.matchAll(/const ANY_[A-Z_]+ = "([^"]+)"/g)].map((match) => match[1]));
  assert.ok(labels.length >= 15, `подписей ANY_* найдено ${labels.length}`);
  for (const label of labels) {
    assert.equal(catalogLandingForParams(`brand=BYD&mileage=${encodeURIComponent(label)}`), findCatalogLanding("/catalog/byd"), `подпись «${label}» не считается пустой`);
  }
});

test("ссылки между разделами идут по смыслу, а не одним блоком на всех страницах", () => {
  // Раньше в блок под выдачей попадали все 54 остальных раздела, одинаково на каждой
  // странице: из 138 ссылок 68 повторялись. Такой блок поисковик со временем считает
  // частью шаблона и обесценивает, а вес размазывается ровным слоем.
  const byd = relatedLandings(findCatalogLanding("/catalog/byd")).map((item) => item.path);
  assert.ok(byd.length <= 12, `ссылок ${byd.length}, ожидалось не больше 12`);
  // Сначала своё: разделы той же марки.
  for (const path of ["/catalog/byd-sedan", "/catalog/byd-suv", "/catalog/byd-hatchback"]) {
    assert.ok(byd.includes(path), `нет ссылки на ${path}`);
  }
  const sedan = relatedLandings(findCatalogLanding("/catalog/sedan")).map((item) => item.path);
  for (const path of ["/catalog/electric-sedan", "/catalog/hybrid-sedan", "/catalog/byd-sedan"]) {
    assert.ok(sedan.includes(path), `нет ссылки на ${path}`);
  }
  // Соседние страницы получают разные наборы: BYD и Tesla стоят в списке рядом,
  // и без разного шага обхода у них совпадал бы почти весь блок.
  const tesla = new Set(relatedLandings(findCatalogLanding("/catalog/tesla")).map((item) => item.path));
  const shared = byd.filter((path) => tesla.has(path)).length;
  assert.ok(shared <= 4, `у BYD и Tesla общих ссылок ${shared}, ожидалось не больше 4`);
  // Своей же страницы среди ссылок быть не должно.
  assert.equal(byd.includes("/catalog/byd"), false);
});

test("на каждый раздел ссылается хотя бы один другой раздел", () => {
  // Полный список всех 57 лежит в каталоге, но и между собой разделы должны быть
  // связаны: иначе часть из них держится только на одной странице.
  const incoming = new Map(CATALOG_LANDINGS.map((item) => [item.path, 0]));
  for (const landing of CATALOG_LANDINGS) {
    for (const related of relatedLandings(landing)) incoming.set(related.path, incoming.get(related.path) + 1);
  }
  const orphans = [...incoming].filter(([, count]) => count === 0).map(([path]) => path);
  assert.deepEqual(orphans, [], `разделы без входящих ссылок: ${orphans.join(", ")}`);
});

// ── Какой раздел показывать при выбранных фильтрах ────────────────────────────

test("лишний фильтр раздел не отменяет, а вот выбор чужого кузова — отменяет", () => {
  const at = (search, prefer) => catalogLandingForFilters(search, prefer)?.path ?? null;
  // Сузить раздел можно: модель и год — это часть его же выдачи.
  assert.equal(at("brand=BYD&model=Han", "/catalog/byd"), "/catalog/byd");
  assert.equal(at("brand=BMW&yearFrom=2023", "/catalog"), "/catalog/bmw");
  // А несколько кузовов сразу выводят выдачу за пределы раздела седанов: остаётся
  // марка, потому что все показанные машины по-прежнему BYD.
  assert.equal(at("brand=BYD&body=Седан&body=SUV / кроссовер", "/catalog/byd-sedan"), "/catalog/byd");
  // Без марки от такой выдачи не остаётся ни одного правдивого раздела.
  assert.equal(at("body=Седан&body=Хэтчбек", "/catalog/sedan"), null);
  assert.equal(at("brand=BYD&brand=Tesla", "/catalog/byd"), null);
});

test("из раздела уходим только туда, где заголовок остаётся правдой", () => {
  const at = (search, prefer) => catalogLandingForFilters(search, prefer)?.path ?? null;
  // Точное совпадение важнее общего: на странице кроссоверов выбрали BYD — впереди
  // есть готовая страница «Кроссоверы BYD».
  assert.equal(at("brand=BYD&body=SUV / кроссовер", "/catalog/suv"), "/catalog/byd-suv");
  // Ничья между двумя одинаково подходящими разделами решается в пользу открытого.
  assert.equal(at("brand=Mazda&type=Гибриды", "/catalog/mazda"), "/catalog/mazda");
  assert.equal(at("brand=Mazda&type=Гибриды", "/catalog/hybrid"), "/catalog/hybrid");
  // Пустые фильтры — это общий каталог, а не раздел.
  assert.equal(at("", "/catalog/byd"), null);
  assert.equal(at("sort=price_asc", "/catalog/byd"), null);
});

test("каждый раздел остаётся собой при своих же фильтрах", () => {
  // Иначе страница уводила бы посетителя сразу после открытия.
  for (const landing of CATALOG_LANDINGS) {
    const found = catalogLandingForFilters(landingFilterParams(landing), landing.path);
    assert.equal(found?.path, landing.path, `раздел ${landing.path} при своих фильтрах превращается в ${found?.path ?? "общий каталог"}`);
  }
});

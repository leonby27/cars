import assert from "node:assert/strict";
import test from "node:test";
import { catalogSeoOrigin } from "../src/catalog-seo-origin.js";
import { CATALOG_LANDINGS, findCatalogLanding, landingApiParams, landingSeoDescription, landingSeoTitle } from "../src/catalog-landings.js";
import { modelCatalogSeo, modelLandingObject } from "../src/model-landing.js";
import { MODEL_PAGES } from "../src/model-pages.js";
import { modelPageWithText } from "../src/model-texts.js";
import { createSeoRenderer } from "../server/seo-render.mjs";

const stats = { total: 25, priceFrom: 20000 };
const renderer = createSeoRenderer({ shell: '<html><head><title>abcars.by</title></head><body><div id="root"></div></body></html>', siteUrl: "https://abcars.by", allowIndexing: true });
const metadata = (html) => (html.slice(0, html.indexOf("</head>")).match(/<title>[\s\S]*?<\/title>|<meta\b[^>]*>/g) || []).join("\n");

test("общие метатеги китайских марок и их разделов называют только Китай", () => {
  for (const path of ["geely", "byd", "haval", "zeekr", "li-auto", "chery", "xpeng", "jaecoo", "omoda", "geely-suv", "geely-sedan"]) {
    const landing = findCatalogLanding(`/catalog/${path}`);
    assert.ok(landing, path);
    for (const facts of [null, stats, { total: 0 }]) {
      const title = landingSeoTitle(landing, facts);
      const description = landingSeoDescription(landing, facts);
      assert.match(title, /из Китая/, path);
      assert.match(description, /из Китая/, path);
      assert.doesNotMatch(`${title} ${description}`, /Кореи|корейск/, path);
    }
    assert.equal(landing.origin, undefined, "метатеги не назначают стране фильтр");
    assert.equal(landingApiParams(landing).get("country"), null);
    assert.match(landing.h1, /Китая и Кореи/, "видимый заголовок сохраняет выбор всех стран");
  }
});

test("Audi и другие иностранные марки сохраняют оба направления независимо от наличия", () => {
  for (const brand of ["audi", "bmw", "tesla", "volvo", "toyota"]) {
    const landing = findCatalogLanding(`/catalog/${brand}`);
    for (const facts of [null, stats, { total: 0 }]) {
      assert.match(landingSeoTitle(landing, facts), /Китая и Кореи/);
      assert.match(landingSeoDescription(landing, facts), /Китая и Кореи/);
    }
  }
  assert.equal(catalogSeoOrigin("Новая неизвестная марка"), null);
  assert.equal(catalogSeoOrigin(" geely "), "china");
});

test("страна модели наследуется от марки и не зависит от обзора, остатков или страницы", () => {
  for (const [brand, model] of [["Geely", "Monjaro"], ["Zeekr", "001"], ["NIO", "ET5"], ["Jaecoo", "J7"], ["Omoda", "C5"]]) {
    for (const facts of [null, stats, { total: 0 }]) {
      for (const page of [1, 2]) {
        const seo = modelCatalogSeo({ name: `${brand} ${model}`, brand, facts, page });
        assert.match(seo.title, /из Китая/);
        assert.match(seo.description, /из Китая/);
        assert.doesNotMatch(`${seo.title} ${seo.description}`, /Кореи|корейск/);
        assert.match(seo.h1, /Китая и Кореи/);
      }
    }
    const landing = modelLandingObject({ model: { brand, model, name: `${brand} ${model}`, path: "/catalog/example/model" }, facts: stats });
    assert.doesNotMatch(`${landing.seoTitle} ${landing.seoDescription}`, /Кореи|корейск/);
  }
  const audi = modelCatalogSeo({ name: "Audi A6", brand: "Audi", facts: stats });
  assert.match(audi.title, /Китая и Кореи/);
  assert.match(audi.description, /Китая и Кореи/);
  const byd = modelCatalogSeo({ name: "BYD Atto 3", brand: "BYD", facts: stats });
  assert.match(byd.title, /из Китая/);
  assert.doesNotMatch(`${byd.title} ${byd.description}`, /Кореи|корейск/);
});

test("явная страна сохраняет приоритет, общие разделы сохраняют оба направления", () => {
  assert.equal(catalogSeoOrigin("Geely", "KR"), "korea");
  const seo = modelCatalogSeo({ name: "Geely Monjaro", brand: "Geely", origin: "korea", facts: stats });
  assert.match(seo.title, /из Кореи/);
  assert.match(seo.description, /из Кореи/);
  for (const path of ["electric", "suv", "under-20000"]) {
    const landing = findCatalogLanding(`/catalog/${path}`);
    assert.match(landingSeoTitle(landing, stats), /Китая и Кореи|китайские и корейские/i);
    assert.match(landingSeoDescription(landing, stats), /Китая и Кореи/);
  }
  for (const [path, from] of [["china", /из Китая/], ["korea", /из Кореи/]]) {
    const landing = findCatalogLanding(`/catalog/${path}`);
    assert.match(landingSeoTitle(landing, stats), from);
    assert.match(landingSeoDescription(landing, stats), from);
  }
});

test("готовый HTML марки и пагинации согласует title, description, Open Graph и Twitter", () => {
  for (const slug of ["geely", "geely-suv", "audi"]) {
    const landing = findCatalogLanding(`/catalog/${slug}`);
    for (const page of [1, 2]) {
      const result = renderer.landingPage({ landing, total: 250, page, pages: 3 });
      const head = metadata(result.html);
      if (slug === "audi") assert.match(head, /Китая и Кореи/);
      else {
        assert.match(head, /из Китая/);
        assert.doesNotMatch(head, /Кореи|корейск/);
      }
      for (const tag of ["og:title", "og:description", "twitter:title", "twitter:description"]) assert.ok(head.includes(`"${tag}"`), tag);
      assert.equal(result.canonical, `https://abcars.by/catalog/${slug}${page > 1 ? `?page=${page}` : ""}`);
    }
  }
});

test("резервные метатеги обзоров не возвращают Корею китайским маркам", () => {
  for (const page of MODEL_PAGES.filter(({ brand }) => catalogSeoOrigin(brand) === "china")) {
    assert.doesNotMatch(`${page.seoTitle} ${page.seoDescription}`, /Кореи|корейск/, page.path);
  }
  const page = MODEL_PAGES.find(({ brand }) => brand === "Geely");
  assert.ok(page);
  const result = renderer.modelPage({ modelPage: modelPageWithText(page) });
  assert.doesNotMatch(metadata(result.html), /Кореи|корейск/);
  assert.ok(CATALOG_LANDINGS.some(({ brand }) => brand === "Geely"));
});

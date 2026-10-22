import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_LANDINGS, catalogPageTitle, findCatalogLanding, isCatalogGroup, landingSeoTitle } from "../src/catalog-landings.js";
import { createSeoRenderer } from "../server/seo-render.mjs";

const groups = CATALOG_LANDINGS.filter(({ kind, brand }) => !brand && ["powertrain", "bodyType", "combo"].includes(kind));
const stats = { total: 7297, priceFrom: 11800 };
const tail = " — 7\u00a0297 в наличии, от 11\u00a0800 $ ▶ Абкарс";
const renderer = createSeoRenderer({ shell: '<html><head><title>abcars.by</title></head><body><div id="root"></div></body></html>', siteUrl: "https://abcars.by", allowIndexing: true });

test("все 23 группы сохраняют полную основу, наличие и цену без сокращения", () => {
  assert.equal(groups.length, 23);
  for (const landing of groups) {
    assert.equal(isCatalogGroup(landing), true, landing.path);
    const title = landingSeoTitle(landing, stats);
    assert.match(title, /^Каталог .+ из Китая и Кореи с доставкой в Беларусь/);
    assert.ok(title.endsWith(tail), `${landing.path}: ${title}`);
    assert.doesNotMatch(title, /Китайские|\{N\}|undefined|NaN/);
  }
  for (const [slug, subject] of [["hatchback", "хэтчбеков"], ["electric", "электромобилей"], ["hybrid-suv", "гибридных кроссоверов"], ["electric-suv", "электрокроссоверов"]]) {
    assert.equal(landingSeoTitle(findCatalogLanding(`/catalog/${slug}`), stats), `Каталог ${subject} из Китая и Кореи с доставкой в Беларусь${tail}`);
  }
});

test("при изменении фактов title получает новые цифры, без данных не выдумывает наличие", () => {
  for (const landing of groups) {
    const title = landingSeoTitle(landing, { total: 8001, priceFrom: 12500 });
    assert.ok(title.endsWith(" — 8\u00a0001 в наличии, от 12\u00a0500 $ ▶ Абкарс"));
    for (const missing of [null, { total: 0 }, { total: 0, priceFrom: 12500 }]) {
      assert.equal(landingSeoTitle(landing, missing), landing.seoTitle);
      assert.doesNotMatch(landingSeoTitle(landing, missing), /в наличии|от .*\$|NaN|undefined/);
    }
    assert.ok(landingSeoTitle(landing, { total: 15 }).endsWith(" — 15 в наличии ▶ Абкарс"));
  }
});

test("сервер, Open Graph, Twitter и пагинация сохраняют полный title групп", () => {
  for (const landing of groups) {
    for (const page of [1, 2]) {
      const base = landingSeoTitle(landing, stats);
      const expected = catalogPageTitle(base, page);
      const { html, canonical } = renderer.landingPage({ landing, total: stats.total, seo: { title: base, description: landing.seoDescription }, page, pages: 3 });
      assert.ok(html.includes(`<title>${expected}</title>`), landing.path);
      for (const [attribute, key] of [["property", "og:title"], ["name", "twitter:title"]]) assert.ok(html.includes(`<meta ${attribute}="${key}" content="${expected}"`), `${landing.path}: ${key}`);
      assert.equal(canonical, `https://abcars.by${landing.path}${page > 1 ? "?page=2" : ""}`);
      if (page > 1) assert.ok(expected.endsWith(" — страница 2 ▶ Абкарс"));
    }
  }
});

test("готовый HTML без явно переданных метатегов использует количество этого раздела", () => {
  const landing = findCatalogLanding("/catalog/hatchback");
  const { html } = renderer.landingPage({ landing, total: 17, page: 2, pages: 3 });
  assert.ok(html.includes('<title>Каталог хэтчбеков из Китая и Кореи с доставкой в Беларусь — 17 в наличии — страница 2 ▶ Абкарс</title>'));
});

test("марки, модели, бюджеты и страны не попадают под шаблон групп", () => {
  for (const slug of ["geely", "audi", "byd-sedan", "under-20000", "china", "korea"]) {
    const landing = findCatalogLanding(`/catalog/${slug}`);
    assert.equal(isCatalogGroup(landing), false, landing.path);
    const title = landingSeoTitle(landing, stats);
    if (slug !== "china" && slug !== "korea") assert.doesNotMatch(title, /^Каталог /);
  }
  assert.equal(isCatalogGroup({ kind: "model", slug: "hatchback", brand: "Geely" }), false);
});

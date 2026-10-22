import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG_LANDINGS, catalogPageTitle, findCatalogLanding, isCatalogGroup, landingSeoTitle } from "../src/catalog-landings.js";
import { createSeoRenderer, escapeHtml } from "../server/seo-render.mjs";

const groups = CATALOG_LANDINGS.filter(({ kind, brand }) => !brand && ["powertrain", "bodyType", "combo"].includes(kind));
const dynamicGroups = groups.filter(({ slug }) => slug !== "electric");
const stats = { total: 7297, priceFrom: 11800 };
const tail = " — 7\u00a0297 в наличии, от 11\u00a0800 $ ▶ Абкарс";
const renderer = createSeoRenderer({ shell: '<html><head><title>abcars.by</title></head><body><div id="root"></div></body></html>', siteUrl: "https://abcars.by", allowIndexing: true });

test("22 группы сохраняют динамический title, электромобили используют выбранный владельцем", () => {
  assert.equal(groups.length, 23);
  assert.equal(dynamicGroups.length, 22);
  for (const landing of dynamicGroups) {
    assert.equal(isCatalogGroup(landing), true, landing.path);
    const title = landingSeoTitle(landing, stats);
    assert.match(title, /^Каталог .+ из Китая и Кореи с доставкой в Беларусь/);
    assert.ok(title.endsWith(tail), `${landing.path}: ${title}`);
    assert.doesNotMatch(title, /Китайские|\{N\}|undefined|NaN/);
  }
  for (const [slug, subject] of [["hatchback", "хэтчбеков"], ["hybrid-suv", "гибридных кроссоверов"], ["electric-suv", "электрокроссоверов"]]) {
    assert.equal(landingSeoTitle(findCatalogLanding(`/catalog/${slug}`), stats), `Каталог ${subject} из Китая и Кореи с доставкой в Беларусь${tail}`);
  }
});

test("при изменении фактов title получает новые цифры, без данных не выдумывает наличие", () => {
  for (const landing of dynamicGroups) {
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
      if (page > 1) assert.match(expected, / — страница 2 ▶ (?:Каталог )?Абкарс$/);
    }
  }
});

test("выбранные title не заменяются остатками и одинаковы в серверном HTML и пагинации", () => {
  const selected = [
    ["china", "Купить авто из Китая в Беларусь под заказ ▶ Каталог Абкарс"],
    ["korea", "Купить авто из Кореи в Беларусь под заказ ▶ Каталог Абкарс"],
    ["geely", "Купить Geely из Китая в Беларусь под заказ ▶ Каталог Абкарс"],
    ["electric", "Купить электромобиль из Китая в Беларусь под заказ ▶ Каталог Абкарс"],
  ];
  for (const [slug, title] of selected) {
    const landing = findCatalogLanding(`/catalog/${slug}`);
    assert.equal(landing.seoTitle, title);
    for (const facts of [null, { total: 0 }, stats, { total: 8001, priceFrom: 12500 }]) assert.equal(landingSeoTitle(landing, facts), title);
    for (const page of [1, 2]) {
      const expected = page === 1 ? title : title.replace(" ▶ Каталог Абкарс", " — страница 2 ▶ Каталог Абкарс");
      assert.equal(catalogPageTitle(title, page), expected);
      for (const seo of [undefined, { title, description: landing.seoDescription }]) {
        const { html, canonical } = renderer.landingPage({ landing, total: stats.total, page, pages: 3, seo });
        assert.ok(html.includes(`<title>${expected}</title>`), `${slug}: title`);
        assert.ok(html.includes(`<meta property="og:title" content="${expected}"`), `${slug}: Open Graph`);
        assert.ok(html.includes(`<meta name="twitter:title" content="${expected}"`), `${slug}: Twitter`);
        assert.equal(canonical, `https://abcars.by/catalog/${slug}${page > 1 ? "?page=2" : ""}`);
      }
    }
  }
});

test("готовый HTML без явно переданных метатегов использует количество этого раздела", () => {
  const landing = findCatalogLanding("/catalog/hatchback");
  const { html } = renderer.landingPage({ landing, total: 17, page: 2, pages: 3 });
  assert.ok(html.includes('<title>Каталог хэтчбеков из Китая и Кореи с доставкой в Беларусь — 17 в наличии — страница 2 ▶ Абкарс</title>'));
});

test("все марки используют шаблон Geely с собственной страной и без цифр наличия", () => {
  const brands = CATALOG_LANDINGS.filter(({ kind }) => kind === "brand");
  assert.ok(brands.length > 20);
  for (const landing of brands) {
    const title = landingSeoTitle(landing, stats);
    assert.ok(title.startsWith(`Купить ${landing.brand} из `), landing.path);
    assert.ok(title.endsWith(" в Беларусь под заказ ▶ Каталог Абкарс"), landing.path);
    assert.doesNotMatch(title, /в наличии|от [\d\s]+\$/);
    assert.equal(landingSeoTitle(landing, null), title);
    const expected = escapeHtml(catalogPageTitle(title, 2));
    const { html } = renderer.landingPage({ landing, total: stats.total, page: 2, pages: 3 });
    assert.ok(html.includes(`<title>${expected}</title>`), landing.path);
    assert.ok(html.includes(`<meta property="og:title" content="${expected}"`), landing.path);
    assert.ok(html.includes(`<meta name="twitter:title" content="${expected}"`), landing.path);
  }
  assert.equal(findCatalogLanding("/catalog/audi").seoTitle, "Купить Audi из Китая и Кореи в Беларусь под заказ ▶ Каталог Абкарс");
  assert.equal(findCatalogLanding("/catalog/byd").seoTitle, "Купить BYD из Китая в Беларусь под заказ ▶ Каталог Абкарс");
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

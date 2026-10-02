import assert from "node:assert/strict";
import test from "node:test";
import { findRoot, hoistLinks, injectAppRoot } from "../server/root-inject.mjs";
import { renderWithApi } from "../server/api-replay.mjs";
import { dropHeadFaqIfRendered, isStaticAppPath } from "../server/static-page.mjs";
import { embeddedApiValue } from "../src/boot-api.js";

// С 26.09.2026 журнал, инструменты и справочные страницы сервер рисует тем же
// приложением, что и браузер, — вместо отдельного текста для робота внутри #root.

test("сервер рисует журнал и справочные страницы, личные разделы — нет", () => {
  for (const path of ["/blog", "/blog/suv-under-20000", "/customs", "/how-it-works", "/models", "/china-brands"]) assert.equal(isStaticAppPath(path), true, path);
  for (const path of ["/faq", "/login", "/favorites", "/analytics", "/blog/", "/blog/a/b", "/catalog"]) assert.equal(isStaticAppPath(path), false, path);
});

test("готовая разметка встаёт вместо содержимого #root вместе с текстом для робота", () => {
  const html = `<html><head><title>t</title></head><body><div id="root"><div class="boot-screen"><div>x</div></div><div class="seo-body"><main><h1>Старое</h1></main></div></div><script src="/a.js"></script></body></html>`;
  assert.ok(findRoot(html));
  const out = injectAppRoot(html, '<link rel="preload" href="/f.woff2"><main><h1>Новое</h1></main>', { path: "/blog/x", boot: { api: { "/api/cars?a=1": { items: [] } } } });
  assert.match(out, /<div id="root" data-prerender="\/blog\/x"><main><h1>Новое<\/h1><\/main><\/div><script src="\/a.js">/);
  assert.doesNotMatch(out, /seo-body|Старое/);
  // Подсказка предзагрузки — в шапке, данные — там же, «<» в них экранирован.
  const head = out.slice(0, out.indexOf("</head>"));
  assert.match(head, /rel="preload"/);
  assert.match(head, /window\.__boot = Object\.assign\(window\.__boot \|\| \{\}, \{"api":/);
  assert.deepEqual(hoistLinks("<link a><link b><p>").hoisted, ["<link a>", "<link b>"]);
});

test("встроенный ответ находится по адресу, а неизвестный адрес записывается для второго прохода", () => {
  const saved = globalThis.window;
  const asked = [];
  globalThis.window = { __boot: { api: { "/api/model-facts": { models: [] } } }, __bootRecord: (url) => asked.push(url) };
  try {
    assert.deepEqual(embeddedApiValue("/api/model-facts"), { models: [] });
    assert.equal(embeddedApiValue("/api/cars?x=1"), undefined);
    assert.deepEqual(asked, ["/api/cars?x=1"]);
  } finally {
    globalThis.window = saved;
  }
});

test("отрисовка с ответами останавливается, когда новых ответов не появилось", async () => {
  let passes = 0;
  const { markup, api } = await renderWithApi(() => {
    passes += 1;
    // Адрес не из списка сервера — ответа не будет, второго прохода тоже.
    globalThis.window.__bootRecord?.("/api/unknown");
    return "<main></main>";
  });
  assert.equal(markup, "<main></main>");
  assert.deepEqual(api, {});
  assert.equal(passes, 1);
});

// Проверка 28.09.2026 нашла на /customs и в журнале два одинаковых FAQPage: один из
// шапки сборки, второй — от блока вопросов приложения.
test("вопросы размечены один раз: копия из шапки уходит, когда их разметило приложение", () => {
  const faq = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}</script>';
  const post = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting"}</script>';
  const html = `<html><head>${post}\n    ${faq}</head><body><div id="root"><main>${faq}</main></div></body></html>`;
  const out = dropHeadFaqIfRendered(html, `<main>${faq}</main>`);
  assert.equal(out.match(/"FAQPage"/g).length, 1);
  assert.match(out.slice(0, out.indexOf("</head>")), /BlogPosting/);
  // Приложение вопросов не разметило — шапка остаётся как есть.
  assert.equal(dropHeadFaqIfRendered(html, "<main></main>"), html);
});

// A cold homepage must still respond when the catalog is unavailable.
test("home uses saved data once, shares tracking URLs and invalidates changed snapshots", async () => {
  const { createStaticPageRenderer } = await import("../server/static-page.mjs");
  let renders = 0, day = new Date("2026-10-02T12:00:00Z");
  let saved = JSON.stringify({ models: [{ name: "BYD Seal" }], brands: [], showcase: [{ id: "che168-1" }], catalogFacts: { total: 132856, updatedAt: "2026-10-02" } });
  const file = '<html><head><script id="home-data">old snapshot</script></head><body><div id="root"><main>old</main></div></body></html>';
  const forbidden = () => { throw new Error("homepage must not wait for live catalog"); };
  const render = createStaticPageRenderer({
    readPage: async () => file, readHome: async () => saved, renderApi: forbidden, getFacts: forbidden, now: () => day,
    loadEntry: async () => ({ renderStaticApp(path, search, boot) { renders++; assert.equal(path, "/"); assert.deepEqual(boot.api, {}); return `<main><h1>${boot.catalogFacts.total}</h1><p>${search}</p></main>`; } }),
  });
  const first = await render("/");
  assert.match(first.html, /132856/); assert.doesNotMatch(first.html, /old snapshot/);
  assert.match(first.html, /"homeShowcase":\[\{"id":"che168-1"\}\]/);
  assert.equal(await render("/", "?utm_source=test&gclid=123&nocount=1"), first); assert.equal(renders, 1);
  const searched = await render("/", "?q=Tesla&utm_campaign=test"); assert.match(searched.html, /\?q=Tesla/); assert.doesNotMatch(searched.html, /utm_campaign/); assert.equal(renders, 2);
  saved = JSON.stringify({ catalogFacts: { total: 132857 }, models: [], brands: [], showcase: [] });
  assert.match((await render("/")).html, /132857/); assert.equal(renders, 3);
  day = new Date("2026-10-03T00:00:00Z"); await render("/"); assert.equal(renders, 4);
  saved = "corrupt"; assert.match((await render("/")).html, /"homeShowcase":\[\]/); assert.equal(renders, 5);
});

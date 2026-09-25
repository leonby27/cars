import assert from "node:assert/strict";
import test from "node:test";
import { findRoot, hoistLinks, injectAppRoot } from "../server/root-inject.mjs";
import { renderWithApi } from "../server/api-replay.mjs";
import { isStaticAppPath } from "../server/static-page.mjs";
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

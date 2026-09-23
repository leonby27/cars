import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const analytics = fs.readFileSync(new URL("../src/analytics-page.jsx", import.meta.url), "utf8");
const renderer = fs.readFileSync(new URL("../server/seo-render.mjs", import.meta.url), "utf8");

test("внешние ссылки по умолчанию получают nofollow", () => {
  const helper = app.slice(app.indexOf("const EXTERNAL_LINK_REL"), app.indexOf("// Абзацы обзоров"));
  assert.match(helper, /const EXTERNAL_LINK_REL = "nofollow noopener noreferrer"/);
  assert.match(helper, /follow \? "noopener noreferrer" : EXTERNAL_LINK_REL/);
  assert.match(app, /<ExternalLink className="article-inline-link"[\s\S]*?href=\{part\.href\}>/);
  assert.match(renderer, /part\.external[\s\S]*?rel="nofollow noopener noreferrer"/);
});

test("служебные ссылки в новой вкладке тоже не обходят правило", () => {
  for (const tag of analytics.match(/<a\b[^>]*target="_blank"[^>]*>/g) || []) {
    assert.match(tag, /rel="nofollow noopener noreferrer"/, tag);
  }
});

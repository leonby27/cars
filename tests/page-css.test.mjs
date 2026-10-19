import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pageCriticalCss, withPageCss } from "../server/page-css.mjs";

test("page CSS keeps matching rules, theme/state alternatives and nested at-rules in source order", () => {
  const css = '/*! font license */@font-face{font-family:licensed;src:url("/licensed.woff2")}:root{--ink:black}.catalog{display:block}.blog-page{display:grid}'
    + '@media(max-width:600px){.catalog h1{font-size:27px}.blog-page{margin:0}}'
    + 'html[data-theme="dark"] .catalog{color:white}.catalog.open{padding:1px}'
    + '.blog-page,.catalog{gap:2px}:not(.absent){box-sizing:border-box}'
    + 'img[src$=".svg"]{display:block}@font-face{font-family:x;src:url("/font.woff2")}'
    + '@keyframes spin{to{transform:rotate(1turn)}}.catalog{display:flex}';
  const result = pageCriticalCss(css, '<main class="catalog"><h1>Каталог</h1></main>');
  assert.doesNotMatch(result, /display:grid|margin:0/);
  assert.match(result, /@media\(max-width:600px\).*?catalog/s);
  for (const part of ['/*! font license */', 'font-family:licensed', 'data-theme="dark"', '.catalog.open', ':not(.absent)', 'img[src$=".svg"]', '@font-face', '@keyframes']) assert.ok(result.includes(part), part);
  assert.ok(result.indexOf('display:block') < result.indexOf('display:flex'));
  assert.equal(withPageCss(`<style data-page-css>${css}</style><style>.unmarked{}</style>`, '<main class="catalog"/>'), `<style data-page-css>${result}</style><style>.unmarked{}</style>`);
});

test("CSS build retains the complete stylesheet, its hashed URL and no-script fallback", () => {
  const dir = mkdtempSync(join(tmpdir(), 'abcars-page-css-'));
  try {
    mkdirSync(join(dir, 'assets'));
    const css = '.catalog-heading h1{font-size:33px}.not-a-page-class{display:grid}.catalog-heading{color:black}';
    writeFileSync(join(dir, 'assets/index-test.css'), css);
    writeFileSync(join(dir, 'index.html'), '<head><link rel="stylesheet" href="/assets/index-test.css"></head>');
    execFileSync(process.execPath, ['scripts/split-css.mjs', `--dir=${dir}`]);
    const complete = readFileSync(join(dir, 'assets/index-test.css'), 'utf8');
    assert.ok(complete.includes('.catalog-heading h1{font-size:33px}'));
    assert.ok(complete.includes('.not-a-page-class{display:grid}'));
    assert.ok(complete.indexOf('.catalog-heading{color:black}') < complete.indexOf('.not-a-page-class'), 'keep the existing critical-then-deferred cascade');
    execFileSync(process.execPath, ['scripts/split-css.mjs', `--dir=${dir}`]);
    assert.equal(readFileSync(join(dir, 'assets/index-test.css'), 'utf8'), complete);
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.match(html, /<style data-page-css>/);
    assert.doesNotMatch(html.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1], /not-a-page-class/);
    assert.match(html, /media="print" onload="this.media='all'"/);
    assert.match(html, /<noscript><link rel="stylesheet" crossorigin href="\/assets\/index-test.css"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [toolPages, app, styles, png] = await Promise.all([
  readFile(new URL("../src/tool-pages.js", import.meta.url), "utf8"),
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  readFile(new URL("../public/services/price-comparison.png", import.meta.url)),
]);

test("шапка сравнения цен использует утверждённые заголовок и описание", () => {
  assert.match(toolPages, /h1: "Где дешевле купить авто: из Китая или в Беларуси"/);
  assert.match(toolPages, /lead: "Честно сравниваем цены на одинаковые машины\."/);
});

test("иллюстрация сравнения цен вернулась к исходному крупному размеру", () => {
  assert.match(app, /market: \{ src: "\/services\/price-comparison\.png", width: 512, height: 512 \}/);
  assert.doesNotMatch(app, /market:[^\n]+fit: "compact"/);
  assert.match(styles, /\.tool-page-hero-icon img \{[\s\S]*?width:\s*134px;[\s\S]*?height:\s*134px;/);
  assert.doesNotMatch(styles, /\.tool-page-hero-icon-compact/);
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
});

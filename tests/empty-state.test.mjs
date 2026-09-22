import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../src/empty-state.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("полноценные заглушки страниц используют общий EmptyState", () => {
  for (const className of [
    "search-empty",
    "favorites-empty",
    "saved-searches-empty",
    "model-page-catalog-empty",
    "brand-directory-empty",
    "market-compare-empty-state",
  ]) {
    assert.match(appSource, new RegExp(`<EmptyState[\\s\\S]{0,320}className="${className}"`), `${className} собрана отдельно от общего компонента`);
  }
});

test("общая заглушка содержит иконку, заголовок, описание и тематическую подложку", () => {
  assert.match(componentSource, /content-empty-state/);
  assert.match(componentSource, /<Icon/);
  assert.match(componentSource, /<h3>/);
  assert.match(componentSource, /description && <p>/);
  assert.match(styles, /\.content-empty-state\s*\{[\s\S]*?display:\s*flex[\s\S]*?gap:\s*10px[\s\S]*?background:\s*var\(--surface\)/);
  assert.match(styles, /\.empty-state\.content-empty-state > h3\s*\{\s*margin:\s*0/);
  assert.match(styles, /\.empty-state\.content-empty-state > p\s*\{\s*margin:\s*0/);
  assert.match(styles, /html\[data-theme="dark"\] \.content-empty-state\s*\{[\s\S]*?border-color:\s*transparent/);
});

test("короткие сообщения внутри списков остаются компактными", () => {
  assert.match(appSource, /className="select-empty"/);
});

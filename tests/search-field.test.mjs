import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const fieldSource = await readFile(new URL("../src/search-field.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("обычные поиски страниц используют общий SearchField", () => {
  for (const className of ["brand-directory-search", "market-compare-search", "models-index-search", "spec-search", "sheet-search"]) {
    assert.match(appSource, new RegExp(`<SearchField[\\s\\S]{0,180}className="${className}"`), `${className} собран отдельно от общего компонента`);
  }
});

test("общий поиск содержит иконку, очистку и единый размер", () => {
  assert.match(fieldSource, /MagnifyingGlass/);
  assert.match(fieldSource, /app-search-field-clear/);
  assert.match(styles, /\.app-search-field[\s\S]*?height:\s*48px/);
  assert.match(styles, /\.app-search-field input[\s\S]*?font:\s*600 15px\/1\.3/);
});

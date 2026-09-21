import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, styles] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
]);

test("до загрузки сравнения показывается доступный скелетон", () => {
  assert.match(app, /if \(!data\)[\s\S]*?<MarketCompareSkeleton \/>/);
  assert.match(app, /className="market-compare market-compare-skeleton"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.match(app, /Загружаем сравнение цен/);
  assert.match(app, /MARKET_SKELETON_CARDS\.map/);
});

test("скелетон повторяет геометрию фильтров и карточек", () => {
  assert.match(styles, /\.market-skeleton-search,[\s\S]*?height:\s*44px/);
  assert.match(styles, /\.market-card-skeleton[\s\S]*?min-height:\s*154px/);
  assert.match(styles, /\.market-skeleton-photo[\s\S]*?height:\s*124px/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.market-card-skeleton/);
});

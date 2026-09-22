import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, styles] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
]);

test("фильтры показываются сразу, а скелетон занимает только место карточек", () => {
  assert.match(app, /api\/market\/compare\?quota=\$\{quotaMode\}/);
  assert.match(app, /<MarketCompareCards cards=\{cards\} navigate=\{navigate\} loading=\{!data\} quotaPricingOn=\{quotaPricingOn\} \/>/);
  assert.match(app, /\{loading && <MarketCompareSkeleton \/>\}/);
  assert.match(app, /className="market-card-list market-card-list-skeleton"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-busy="true"/);
  assert.match(app, /Загружаем сравнение цен/);
  assert.match(app, /MARKET_SKELETON_CARDS\.map/);
  assert.doesNotMatch(app, /market-skeleton-search/);
  assert.doesNotMatch(app, /MARKET_SKELETON_CHIPS/);
});

test("скелетон повторяет геометрию карточек", () => {
  assert.match(styles, /\.market-card-skeleton[\s\S]*?min-height:\s*154px/);
  assert.match(styles, /\.market-skeleton-photo[\s\S]*?height:\s*124px/);
  assert.match(styles, /@media \(max-width: 700px\)[\s\S]*?\.market-card-skeleton/);
});

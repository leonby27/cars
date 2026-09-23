import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("customs warning stays inside the customs row in both price breakdowns", () => {
  const alerts = [...app.matchAll(/<div className="price-customs-copy">[\s\S]*?price-customs-alert[\s\S]*?<\/div>/g)];
  assert.equal(alerts.length, 2);
  assert.match(alerts[0][0], /Растаможка и сборы/);
  assert.match(alerts[1][0], /Таможня и сборы/);
  assert.match(styles, /\.price-customs-copy\s*\{[\s\S]*?display:\s*grid;/);
  assert.match(styles, /\.price-customs-alert\s*\{[\s\S]*?margin:\s*1px 0 0;/);
});

test("customs details stay in the tooltip instead of the visible row", () => {
  assert.equal((app.match(/className="price-customs-includes"/g) || []).length, 0);
  assert.equal((app.match(/description=\{\[price\.customsHint \|\| price\.customsNote, price\.customsIncludedText\]/g) || []).length, 2);
  assert.doesNotMatch(styles, /\.price-customs-includes\s*\{/);
});

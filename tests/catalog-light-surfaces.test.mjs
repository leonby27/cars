import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test("catalog cards keep raised surfaces in the light theme and tonal surfaces in dark", () => {
  assert.match(styles, /--raised-surface-shadow:\s*0 18px 50px rgba\(24, 27, 32, 0\.1\)/);
  assert.match(styles, /\.brand-guide\s*\{[^}]*border:\s*1px solid var\(--line\)[^}]*box-shadow:\s*var\(--raised-surface-shadow\)/s);
  assert.match(styles, /\.side-card,\s*\.source-card\s*\{[^}]*background:\s*var\(--panel\)[^}]*box-shadow:\s*var\(--raised-surface-shadow\)/s);
  assert.match(styles, /\.custom-search-cta\s*\{[^}]*box-shadow:\s*var\(--raised-surface-shadow\)/s);
  assert.match(styles, /\.custom-search-cta\.is-empty\s*\{[^}]*box-shadow:\s*none/s);
  assert.match(styles, /html\[data-theme="dark"\] #root :is\(\.custom-search-cta, \.brand-guide, \.side-card, \.source-card\)\s*\{[^}]*box-shadow:\s*none/s);
});

test("service catalog has a solid contrasting surface in both themes", () => {
  assert.match(styles, /\.service-catalog-section\s*\{[^}]*background:\s*var\(--panel-soft\)/s);
  assert.match(styles, /html\[data-theme="dark"\] \.service-catalog-section\s*\{[^}]*background:\s*#0b0d0f/s);
});

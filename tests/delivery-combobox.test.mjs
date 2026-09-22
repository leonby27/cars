import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const combobox = app.slice(app.indexOf("function ComboboxField"), app.indexOf("function HomeFaqItem"));
const deliveryCalculator = app.slice(app.indexOf("function DeliveryCalculator"), app.indexOf("function CustomsCalculator"));

test("delivery combobox closes after choosing an option", () => {
  const choose = combobox.slice(combobox.indexOf("const choose"), combobox.indexOf("const move"));
  assert.match(choose, /changeOpen\(false\)/);
  assert.doesNotMatch(choose, /\.focus\(/);
});

test("delivery combobox reopens around the selected option", () => {
  assert.match(combobox, /findIndex\(\(item\) => item\.value === value\?\.value\)/);
  assert.match(combobox, /menu\.scrollTop = Math\.max\(0, top - \(menu\.clientHeight - active\.offsetHeight\) \/ 2\)/);
  assert.doesNotMatch(combobox, /scrollIntoView/);
});

test("an already open delivery combobox is not centered again by the same click", () => {
  const openAtSelection = combobox.slice(combobox.indexOf("const openAtSelection"), combobox.indexOf("const choose"));
  assert.match(openAtSelection, /if \(openRef\.current\) return;/);
});

test("delivery combobox uses the customs-calculator field typography and caret geometry", () => {
  assert.match(combobox, /className="tool-combobox-caret" size=\{16\} weight="bold"/);
  assert.match(styles, /\.tool-combobox \.tool-calc-main\s*\{[\s\S]*?justify-content:\s*flex-end;[\s\S]*?padding:\s*0 48px var\(--tool-calc-field-value-bottom\) var\(--tool-calc-field-inline\);/);
  assert.match(styles, /\.tool-combobox \.tool-calc-label\s*\{[\s\S]*?top:\s*var\(--tool-calc-field-label-top\);[\s\S]*?left:\s*var\(--tool-calc-field-inline\);/);
  assert.match(styles, /#root \.tool-calc-select \.select-trigger > svg:last-child\s*\{[\s\S]*?var\(--tool-calc-field-caret-size\)/);
});

test("delivery total stays visible while selected-model dimensions are loading", () => {
  assert.match(deliveryCalculator, /<strong>≈ \{amount\(estimate\.total\)\}<\/strong>/);
  assert.doesNotMatch(deliveryCalculator, /sizeLoading \? "…"/);
});

test("delivery body class has no visible loading state after choosing a model", () => {
  assert.match(deliveryCalculator, /const bodyClass = model && !model\.custom\s*\? deliveryBodyClass\(model\.label, modelSize\)/);
  assert.match(deliveryCalculator, /const bodyClassText = `\$\{bodyClass \|\| "Кузов не определён"\}\.\`;/);
  assert.doesNotMatch(deliveryCalculator, /Кузов уточняется/);
});

test("only the large-body label is highlighted like the currency", () => {
  assert.match(deliveryCalculator, /<span className=\{`tool-calc-body-class\$\{bodyClass === "Крупный кузов" \? " large" : ""\}`\}>\{bodyClassText\}<\/span>/);
  assert.match(styles, /\.tool-calc-body-class\.large\s*\{[\s\S]*?color:\s*var\(--accent-dark\);[\s\S]*?font-weight:\s*700;/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("окно приложения использует шестерёнку 80 px и заголовок в одну строку", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /app-unavailable-icon[^>]+app-gear\.png[^>]+width="80" height="80"/);
  assert.match(styles, /app-unavailable-modal\s*\{[^}]*width:\s*min\(460px, 100%\)/s);
  assert.match(styles, /\.app-unavailable-modal > h2\s*\{[^}]*white-space:\s*nowrap/s);
});

test("окно приостановленных заказов использует секундомер и ту же сетку", async () => {
  const [app, styles] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
  ]);
  assert.match(app, /<h2 id="social-unavailable-title">Скоро вернёмся к вам<\/h2>/);
  assert.match(app, /orders-unavailable-icon[^>]+orders-stopwatch\.png[^>]+width="80" height="80"/);
  assert.match(styles, /orders-unavailable-modal\s*\{[^}]*width:\s*min\(460px, 100%\)/s);
  assert.match(styles, /\.orders-unavailable-modal > h2\s*\{[^}]*white-space:\s*nowrap/s);
});

test("в компактных информационных окнах уменьшен отступ до описания", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(styles, /availability-paused-modal\.social-unavailable-modal > h2\s*\{[^}]*margin-bottom:\s*0/s);
  assert.match(styles, /availability-paused-modal\.social-unavailable-modal > p\s*\{[^}]*margin-top:\s*6px/s);
});

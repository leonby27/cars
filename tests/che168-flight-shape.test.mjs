import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { looksLikeFlight } from "../scripts/lib/che168-flight-shape.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const gone = fs.readFileSync(path.join(here, "fixtures", "che168-detail-gone.txt"), "utf8");

// Настоящий ответ источника на снятую с продажи машину, снятый 06.09.2026.
// Раньше сборщик считал его молчанием и после тридцати таких подряд объявлял
// несуществующую стену — из-за этого четыре ночных прогона подряд обходили
// три-шесть марок из сорока четырёх вместо всех.
test("снятая машина — это ответ источника, а не молчание", () => {
  assert.equal(looksLikeFlight(gone), true);
});

test("живая карточка тоже узнаётся как ответ", () => {
  const alive = `3:I[4707,[],""]\n8:{"ssrCarDetail":{"price":"18000"}}\n${"x".repeat(3000)}`;
  assert.equal(looksLikeFlight(alive), true);
});

test("молчание, обрыв и заглушка проверки «не робот» ответом не считаются", () => {
  assert.equal(looksLikeFlight(""), false);
  assert.equal(looksLikeFlight(undefined), false);
  // Короткий ответ — признак обрыва: настоящая страница меньше двух килобайт не бывает.
  assert.equal(looksLikeFlight(`3:I[4707,[],""]\n`), false);
  const captcha = `<!doctype html><html><head><title>Verify</title></head><body>${"e".repeat(4000)}</body></html>`;
  assert.equal(looksLikeFlight(captcha), false);
});

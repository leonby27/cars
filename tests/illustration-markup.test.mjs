import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

// Картинка, завёрнутая в <picture>, перестаёт быть прямым потомком своего блока: правило
// вида «.блок > img» после этого молча не применяется и вёрстка разъезжается. Один раз
// так уехал блок «Остались вопросы?» на странице «О сервисе». Поэтому у каждого такого
// правила должен быть двойник «.блок > picture > img» — тогда обернуть любую картинку
// в лёгкие форматы можно, не трогая стили.
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("у правил с прямым потомком-картинкой есть двойник для <picture>", () => {
  const lonely = [];
  for (const line of styles.split("\n")) {
    const rule = line.match(/^\s*(.+?)\s*\{\s*$/);
    if (!rule) continue;
    const parts = rule[1].split(",").map((part) => part.trim());
    for (const part of parts) {
      if (/picture\s*>\s*img$/.test(part)) continue;
      const direct = part.match(/^(.*?)>\s*img$/);
      if (!direct) continue;
      const twin = `${direct[1].trim()} > picture > img`;
      if (!parts.includes(twin)) lonely.push(part);
    }
  }
  assert.deepEqual(lonely, [], `правила без двойника для <picture>: ${lonely.join("; ")}`);
});

// Вторая ловушка той же обёртки: браузер выбирает источник по типу и, не найдя файла,
// показывает пустое место вместо картинки — запасной вариант уже не подставляется.
const sources = ["../src/App.jsx", "../src/inspection-report.jsx", "../src/service-copy.js"]
  .map((file) => readFileSync(new URL(file, import.meta.url), "utf8"))
  .join("\n");
const publicDir = new URL("../public/", import.meta.url);

test("у каждой картинки из <Illustration> рядом лежат avif и webp", () => {
  const missing = [];
  for (const match of sources.matchAll(/<Illustration\b[^>]*?src="(\/[^"]+\.(?:png|jpe?g|webp))"/g)) {
    const base = match[1].replace(/\.(png|jpe?g|webp)$/, "");
    for (const format of [".avif", ".webp"]) {
      if (!existsSync(new URL(`.${base}${format}`, publicDir))) missing.push(`${base}${format}`);
    }
  }
  assert.deepEqual(missing, [], `нет лёгких версий: ${missing.join(", ")}`);
});

test("лёгкие версии не бывают поодиночке", () => {
  const broken = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(`${dir}/`, publicDir), { withFileTypes:true })) {
      if (entry.isDirectory()) { walk(join(dir, entry.name)); continue; }
      if (extname(entry.name) !== ".avif") continue;
      const base = join(dir, entry.name).replace(/\.avif$/, "");
      if (!existsSync(new URL(`./${base}.webp`, publicDir))) broken.push(`${base}: есть avif, нет webp`);
    }
  };
  for (const dir of ["illustrations", "services", "trust-strip"]) walk(dir);
  assert.deepEqual(broken, [], broken.join("; "));
});

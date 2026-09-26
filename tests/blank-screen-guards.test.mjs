import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// 25.09.2026 переход из списка на машину показывал пустой тёмный экран: карточка
// читала car.brand до проверки «машина уже есть», а первый кадр после перехода
// рисуется без машины. Там же нашлись соседние случаи того же рода — запрет
// хранилища в браузере и частая запись истории в Safari. Проверки ниже держат
// каждое из этих мест.

const app = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");

test("компоненты с проверкой «машины нет» не читают машину до неё", () => {
  const guard = /^  if \(!car\) return /m;
  const starts = [...app.matchAll(/^function ([A-Z]\w*)\(\{[^)]*\bcar\b[^)]*\}\) \{$/gm)];
  let checked = 0;
  for (const start of starts) {
    const body = app.slice(start.index, app.indexOf("\n}\n", start.index));
    const at = body.search(guard);
    if (at < 0) continue;
    checked += 1;
    // Верхние объявления до проверки: в них можно держать функции (их тело
    // выполнится по нажатию), но не вычисления от car.
    for (const line of body.slice(0, at).split("\n")) {
      if (!/^  const /.test(line) || !/\bcar\./.test(line)) continue;
      assert.match(line, /=\s*(async\s*)?(\([^)]*\)|\w+)\s*=>/, `${start[1]}: до проверки машины читается car — ${line.trim()}`);
    }
  }
  assert.ok(checked >= 2, "проверка должна найти карточку и черновик заказа");
});

test("история пишется только через обёртки с try/catch", () => {
  assert.equal(app.match(/window\.history\.replaceState\(/g).length, 2);
  assert.equal(app.match(/window\.history\.pushState\(/g).length, 1);
});

test("приложение обёрнуто защитой от пустого экрана, хранилище проверяется первым", () => {
  assert.match(main, /^import "\.\/storage-guard\.js";/);
  assert.equal(main.match(/<CrashGuard>\s*<App \/>\s*<\/CrashGuard>/g).length, 2);
});

test("при запрете хранилища приложение получает хранилище в памяти", async () => {
  const saved = globalThis.window;
  const blocked = {};
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(blocked, name, { configurable:true, get() { throw new Error("SecurityError"); } });
  }
  globalThis.window = blocked;
  try {
    const { guardBrowserStorage } = await import(`../src/storage-guard.js?case=${Date.now()}`);
    guardBrowserStorage();
    window.localStorage.setItem("a", 1);
    assert.equal(window.localStorage.getItem("a"), "1");
    assert.equal(window.sessionStorage.getItem("missing"), null);
  } finally {
    globalThis.window = saved;
  }
});

test("рабочее хранилище не подменяется", async () => {
  const saved = globalThis.window;
  const values = new Map([["favorites", "[1]"]]);
  const real = { getItem:(k) => values.get(k) ?? null, setItem:(k, v) => values.set(k, v), removeItem:(k) => values.delete(k), get length() { return values.size; } };
  globalThis.window = { localStorage:real, sessionStorage:real };
  try {
    const { guardBrowserStorage } = await import(`../src/storage-guard.js?case=${Date.now()}`);
    guardBrowserStorage();
    assert.equal(window.localStorage, real);
    assert.equal(window.localStorage.getItem("favorites"), "[1]");
  } finally {
    globalThis.window = saved;
  }
});

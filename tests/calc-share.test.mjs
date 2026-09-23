import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calcParamNames, calcShareSearch, calcStateFromSearch, calcYears } from "../src/tool-pages.js";

// Ссылка на расчёт уходит в чужую переписку и живёт там годами. Поэтому проверяем
// две вещи: расчёт восстанавливается из своей же ссылки один в один, а испорченная
// ссылка открывает рабочий калькулятор, а не ошибку.

const full = {
  kind: "ice",
  price: 21500,
  currency: "eur",
  engineCc: 1600,
  year: calcYears()[2],
  refund50: true,
};

test("расчёт восстанавливается из собственной ссылки", () => {
  const restored = calcStateFromSearch(calcShareSearch(full));
  assert.deepEqual(restored, full);
});

test("объём двигателя не попадает в ссылку там, где его не спрашивают", () => {
  // У электромобиля пошлина считается от стоимости: объём в адресе сбивал бы с толку.
  const search = calcShareSearch({ ...full, kind: "ev" });
  assert.equal(new URLSearchParams(search).has("cc"), false);
  assert.equal(calcStateFromSearch(search).engineCc, undefined);
});

test("выключенный переключатель ссылку не засоряет", () => {
  const search = calcShareSearch({ ...full, refund50: false });
  assert.equal(new URLSearchParams(search).has("refund"), false);
});

test("у электромобиля скрытое возмещение не попадает в ссылку", () => {
  const search = calcShareSearch({ ...full, kind: "ev", refund50: true });
  assert.equal(new URLSearchParams(search).has("refund"), false);
});

test("электромобиль меняет переключатель возмещения на квоту", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /isElectric \? "Учитывать квоту на беспошлинный ввоз" : "Возмещение 50% по указу № 140"/);
  assert.match(app, /checked=\{isElectric \? Boolean\(quotaPricing\?\.on\) : refund50\}/);
  assert.match(app, /refund50: isElectric \? false : refund50/);
});

test("испорченная ссылка не ломает форму", () => {
  const broken = calcStateFromSearch("kind=ядерный&price=-5&cur=бел&year=1999&cc=99999&refund=да");
  assert.deepEqual(broken, {});
});

test("имена полей для Clean-param совпадают с теми, что уходят в адрес", () => {
  const names = new Set(calcParamNames());
  for (const key of new URLSearchParams(calcShareSearch(full)).keys()) {
    assert.ok(names.has(key), `поле ${key} не описано для robots.txt`);
  }
});

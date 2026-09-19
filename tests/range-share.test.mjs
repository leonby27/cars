import test from "node:test";
import assert from "node:assert/strict";
import { rangeParamNames, rangeShareSearch, rangeStateFromSearch } from "../src/range-estimate.js";

// Ссылка на расчёт уходит в чужую переписку и живёт там годами. Проверяем две вещи:
// расчёт восстанавливается из своей же ссылки один в один, а испорченная ссылка
// открывает рабочую форму, а не ошибку.

const full = {
  rated: 520,
  cycle: "wltp",
  celsius: -18,
  mode: "highway",
  chemistry: "lfp",
  ageYears: 4,
  heatPump: true,
};

test("расчёт запаса хода восстанавливается из собственной ссылки", () => {
  assert.deepEqual(rangeStateFromSearch(rangeShareSearch(full)), full);
});

test("ноль градусов — это значение, а не пустое поле", () => {
  const search = rangeShareSearch({ ...full, celsius: 0 });
  assert.equal(new URLSearchParams(search).get("t"), "0");
  assert.equal(rangeStateFromSearch(search).celsius, 0);
});

test("выключенный тепловой насос ссылку не засоряет", () => {
  const search = rangeShareSearch({ ...full, heatPump: false });
  assert.equal(new URLSearchParams(search).has("pump"), false);
  assert.equal(rangeStateFromSearch(search).heatPump, undefined);
});

test("испорченная ссылка не ломает форму расчёта", () => {
  assert.deepEqual(rangeStateFromSearch("km=99999&cycle=лунный&t=-500&mode=полёт&battery=банка&age=99&pump=да"), {});
});

test("имена полей расчёта описаны для Clean-param", () => {
  const names = new Set(rangeParamNames());
  for (const key of new URLSearchParams(rangeShareSearch(full)).keys()) {
    assert.ok(names.has(key), `поле ${key} не описано для robots.txt`);
  }
});

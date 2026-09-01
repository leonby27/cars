import test from "node:test";
import assert from "node:assert/strict";
import { median, priceIndexChange, priceIndexSeries, priceMovers, seriesChangePct } from "../src/price-index.js";

const row = (bucket, medianUsd, listings = 10) => ({ bucket, brand: bucket.split("|")[0], model: bucket.split("|")[1], year: 2023, listings, medianUsd });

test("середина ряда считается и для чётной длины", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

// Главная ловушка отчёта: состав каталога меняется сам по себе. Наборы, которых не
// было в прошлом снимке, обязаны выпадать из расчёта, иначе пополнение каталога
// читается как движение цен.
test("в расчёт идут только наборы, которые есть в обоих снимках", () => {
  const before = [row("BYD|Han|2023", 20000), row("Zeekr|001|2023", 30000)];
  const after = [row("BYD|Han|2023", 19000), row("Zeekr|001|2023", 30000), row("Xiaomi|SU7|2024", 5000)];
  const change = priceIndexChange(before, after);
  assert.equal(change.baskets, 2, "новый набор Xiaomi не должен участвовать");
  // Один набор подешевел на 5%, второй не менялся: медиана изменений −2,5%.
  assert.equal(change.changePct, -2.5);
});

test("наборы из пары объявлений не участвуют", () => {
  const before = [row("BYD|Han|2023", 20000, 2)];
  const after = [row("BYD|Han|2023", 10000, 2)];
  const change = priceIndexChange(before, after);
  assert.equal(change.baskets, 0);
  assert.equal(change.changePct, null, "падение вдвое у двух объявлений — не обвал рынка");
});

test("сравнивать не с чем — изменения нет, а не ноль", () => {
  const change = priceIndexChange([], [row("BYD|Han|2023", 20000)]);
  assert.equal(change.baskets, 0);
  assert.equal(change.changePct, null);
});

test("подешевевшие и подорожавшие берутся из сравнимых наборов", () => {
  const before = [row("BYD|Han|2023", 20000), row("Zeekr|001|2023", 30000), row("Nio|ET5|2023", 25000)];
  const after = [row("BYD|Han|2023", 18000), row("Zeekr|001|2023", 33000), row("Nio|ET5|2023", 25050)];
  const movers = priceMovers(priceIndexChange(before, after));
  assert.deepEqual(movers.cheaper.map((item) => item.model), ["Han"]);
  assert.deepEqual(movers.dearer.map((item) => item.model), ["001"]);
  // Nio сдвинулся на 0,2% — это шум округления, в списки он не попадает.
  assert.equal(movers.cheaper.length + movers.dearer.length, 2);
});

// Ряд считается по цепочке: неделя к неделе. Иначе за месяц половина наборов
// сменится и сравнивать с первой неделей будет нечего.
test("ряд индекса начинается со ста и считается по цепочке", () => {
  const snapshots = new Map([
    ["2026-09-06", [row("BYD|Han|2023", 20000), row("Zeekr|001|2023", 30000)]],
    ["2026-09-13", [row("BYD|Han|2023", 19000), row("Zeekr|001|2023", 28500)]],
    ["2026-09-20", [row("BYD|Han|2023", 19000), row("Zeekr|001|2023", 28500)]],
  ]);
  const points = priceIndexSeries(snapshots);
  assert.deepEqual(points.map((point) => point.value), [100, 95, 95]);
  assert.equal(seriesChangePct(points), -5);
});

test("один снимок — ряд из одной точки без изменения", () => {
  const points = priceIndexSeries(new Map([["2026-09-06", [row("BYD|Han|2023", 20000)]]]));
  assert.deepEqual(points, [{ date: "2026-09-06", value: 100, changePct: null, baskets: 1 }]);
  assert.equal(seriesChangePct(points), 0);
});

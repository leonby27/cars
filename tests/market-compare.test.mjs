import test from "node:test";
import assert from "node:assert/strict";
import { brandCoverage, compareRows, compareSummary, compareTable, coverageNote, groupCompareRows, normalizeModel } from "../src/market-compare.js";

// Сравнение цен — это публичное утверждение «у нас дешевле на столько-то». Ошибка
// в нём дороже любой другой, поэтому проверяем не вид таблицы, а правила отбора:
// одинаковый год, середины цен и минимальное число предложений с обеих сторон.

const market = {
  collectedAt: "2026-09-18T00:00:00.000Z",
  brands: {
    BYD: {
      "Han|2022": { count: 14, median: 29000, low: 26000, high: 33000 },
      "Han|2023": { count: 4, median: 31000, low: 28000, high: 35000 },
      "Song Plus DM|2022": { count: 9, median: 24000, low: 22000, high: 27000 },
      "Seal|2023": { count: 5, median: 27000, low: 25000, high: 30000, onlyNew: true },
    },
    Geely: {
      "Preface|2022": { count: 11, median: 19000, low: 17000, high: 22000 },
    },
  },
};

const ours = [
  { brand: "BYD", model: "Han", year: 2022, count: 120, median: 22000 },
  { brand: "BYD", model: "Han", year: 2023, count: 60, median: 24000 },
  { brand: "BYD", model: "Song PLUS DM-i", year: 2022, count: 80, median: 18000 },
  { brand: "BYD", model: "Seal", year: 2023, count: 40, median: 21000 },
  { brand: "Geely", model: "Preface", year: 2021, count: 90, median: 15000 },
  { brand: "NIO", model: "ET5", year: 2022, count: 70, median: 26000 },
];

test("сравниваются только одинаковые годы", () => {
  const rows = compareRows({ ours, market });
  const preface = rows.find((row) => row.model === "Preface");
  // У нас Preface 2021, на площадке — 2022. Разных лет сравнивать нельзя.
  assert.equal(preface, undefined);
});

test("модель без белорусских объявлений в таблицу не попадает", () => {
  const rows = compareRows({ ours, market });
  assert.equal(rows.find((row) => row.brand === "NIO"), undefined);
});

test("каждый год выпуска — своя строка", () => {
  // Машина 2022 года и та же модель 2025-го — разные машины, и выгода у них разная.
  // Схлопывать их в одну строку значит прятать половину ответа.
  const rows = compareRows({ ours, market });
  const han2022 = rows.find((row) => row.model === "Han" && row.year === 2022);
  const han2023 = rows.find((row) => row.model === "Han" && row.year === 2023);
  assert.ok(han2022 && han2023, "оба года должны быть в таблице");
  assert.equal(han2022.theirMedian, 29000);
  assert.equal(han2022.ourMedian, 22000);
  assert.equal(han2022.diff, 7000);
  assert.equal(han2022.diffPercent, 24);
  assert.equal(han2023.theirMedian, 31000);
  assert.equal(han2023.diff, 7000);
});

test("разные хвосты в названии версии не мешают найти ту же машину", () => {
  const rows = compareRows({ ours, market });
  const song = rows.find((row) => row.model.startsWith("Song"));
  assert.ok(song, "«Song PLUS DM-i» и «Song Plus DM» — одна и та же машина");
  assert.equal(song.theirCount, 9);
});

test("набор из одних новых машин не берём", () => {
  const rows = compareRows({ ours, market });
  assert.equal(rows.find((row) => row.model === "Seal"), undefined);
});

test("пустой свод не роняет страницу", () => {
  assert.deepEqual(compareRows({ ours, market: null }), []);
  assert.deepEqual(compareRows({ ours: [], market }), []);
  assert.equal(compareSummary([]), null);
});

test("итог считает, на скольких моделях дешевле", () => {
  const rows = compareRows({ ours, market });
  const summary = compareSummary(rows);
  assert.equal(summary.models, rows.length);
  assert.equal(summary.cheaper, rows.length);
  assert.ok(summary.medianPercent > 0);
  assert.ok(summary.bestSaving.diff > 0);
});

test("в подписи под таблицей сказано, что цена ориентировочная", () => {
  const table = compareTable(compareRows({ ours, market }), { collectedAt: market.collectedAt });
  assert.match(table.note, /ориентир до договора/);
  // Площадку по имени не называем: в подписи только «белорусские площадки».
  assert.doesNotMatch(table.note, /av\.by|onliner/i);
  assert.match(table.note, /белорусских площадок/);
  assert.equal(table.columns.length, 4);
});

test("названия моделей приводятся к одному виду", () => {
  assert.equal(normalizeModel("Song PLUS DM-i"), "songplusdmi");
  assert.equal(normalizeModel(" Yuan  Up "), "yuanup");
  assert.equal(normalizeModel(null), "");
});

test("в списке марок остаются и те, по которым сравнивать не с чем", () => {
  const rows = compareRows({ ours, market });
  const coverage = brandCoverage({
    ourBrands: [["BYD", 800], ["Geely", 400], ["NIO", 2252], ["Пустая", 0]],
    rows,
    market,
  });
  const names = coverage.map((item) => item.brand);
  assert.ok(names.includes("NIO"), "марку без сравнения из списка убирать нельзя");
  assert.ok(!names.includes("Пустая"), "марку, которой нет в каталоге, показывать незачем");
  // Сортировка по числу наших машин: сверху то, что человек скорее всего и ищет.
  assert.equal(names[0], "NIO");
});

test("причина отсутствия сравнения называется прямо", () => {
  const rows = compareRows({ ours, market });
  const coverage = brandCoverage({ ourBrands: [["NIO", 2252], ["BYD", 800]], rows, market });
  const nio = coverage.find((item) => item.brand === "NIO");
  const byd = coverage.find((item) => item.brand === "BYD");
  assert.match(coverageNote(nio), /не нашлось/);
  assert.equal(coverageNote(byd), null, "у марки со сравнением объяснения быть не должно");
});

test("длиннобазная китайская версия сравнивается с обычной европейской", () => {
  // В Китае Audi A6 продаётся как A6L — она длиннее. В Беларуси её называют просто
  // A6, и без этого правила самая массовая часть каталога не сравнивалась ни с чем.
  const longMarket = { brands: { Audi: { "A6|2022": { count: 33, median: 41200, low: 35000, high: 48000 } } } };
  const rows = compareRows({
    ours: [{ brand: "Audi", model: "A6L", year: 2022, count: 198, median: 42875 }],
    market: longMarket,
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].longVersion, true, "разницу в длине нужно назвать прямо");
  assert.match(compareTable(rows).rows[0][0], /длиннобазная/);
});

test("у китайских марок буква L — это другая модель, а не длина", () => {
  // BYD Han L — отдельная машина, а не длинная версия Han. Склеивать нельзя.
  const rows = compareRows({
    ours: [{ brand: "BYD", model: "Han L", year: 2022, count: 50, median: 25000 }],
    market,
  });
  assert.deepEqual(rows, []);
});

test("годы одной модели собираются в одну строку с разбегом лет", () => {
  const rows = compareRows({ ours, market });
  const groups = groupCompareRows(rows);
  const han = groups.find((group) => group.model === "Han");
  assert.equal(han.yearFrom, 2022);
  assert.equal(han.yearTo, 2023);
  assert.equal(han.years.length, 2, "внутри группы годы остаются по отдельности");
  assert.equal(han.ourCount, 180, "машины по годам складываются");
  assert.equal(han.cheaperYears, 2, "по обоим годам привозить дешевле");
});

test("в сводной строке цена — середина по годам, а не среднее", () => {
  const groups = groupCompareRows([
    { brand: "X", model: "M", year: 2021, ourMedian: 10000, theirMedian: 12000, ourCount: 10, theirCount: 5, diff: 2000, diffPercent: 17 },
    { brand: "X", model: "M", year: 2022, ourMedian: 20000, theirMedian: 24000, ourCount: 10, theirCount: 5, diff: 4000, diffPercent: 17 },
    { brand: "X", model: "M", year: 2023, ourMedian: 90000, theirMedian: 99000, ourCount: 10, theirCount: 5, diff: 9000, diffPercent: 9 },
  ]);
  assert.equal(groups.length, 1);
  // Середина — 20 000, а среднее было бы 40 000: один дорогой год не должен
  // определять строку целиком.
  assert.equal(groups[0].ourMedian, 20000);
  assert.equal(groups[0].ourCount, 30);
  assert.equal(groups[0].yearFrom, 2021);
  assert.equal(groups[0].yearTo, 2023);
});

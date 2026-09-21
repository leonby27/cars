import test from "node:test";
import assert from "node:assert/strict";
import { aggregateComparisonPrices, bestComparisonYear, brandCoverage, compareDetailedRows, compareRows, compareSummary, compareTable, comparisonOwnPrices, comparisonYearDifference, coverageNote, groupCompareRows, groupDetailedRows, hasEnoughComparisonSample, hasEnoughMarketSample, hasRebuiltHint, normalizeModel } from "../src/market-compare.js";

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

test("подсказка о восстановлении зависит от модели и года, а не только от марки", () => {
  assert.equal(hasRebuiltHint({ brand:"BMW", model:"X3", year:2022, diff:-5 }), true);
  assert.equal(hasRebuiltHint({ brand:"BMW", model:"i3", year:2022, diff:-5 }), false);
  assert.equal(hasRebuiltHint({ brand:"Audi", model:"A6L", year:2024, diff:-5 }), false);
  assert.equal(hasRebuiltHint({ brand:"Honda", model:"Civic", year:2023, diff:-5 }), true);
  assert.equal(hasRebuiltHint({ brand:"Honda", model:"XR-V", year:2023, diff:-5 }), false);
  assert.equal(hasRebuiltHint({ brand:"Buick", model:"Verano", year:2022, diff:-5 }), false);
  assert.equal(hasRebuiltHint({ brand:"Hyundai", model:"Santa Fe", year:2024, diff:-5 }), true);
  assert.equal(hasRebuiltHint({ brand:"BYD", model:"Han", year:2023, diff:-5 }), false);
  assert.equal(hasRebuiltHint({ brand:"BMW", model:"X3", year:2022, diff:5 }), false);
});

test("для сравнения нужно не меньше пяти машин с каждой стороны", () => {
  assert.equal(hasEnoughMarketSample({ count:5 }), true);
  assert.equal(hasEnoughMarketSample({ count:4 }), false);
  assert.equal(hasEnoughMarketSample(null), false);
  assert.equal(hasEnoughComparisonSample({ ours:{ count:5 }, belarus:{ count:5 } }), true);
  assert.equal(hasEnoughComparisonSample({ ours:{ count:4 }, belarus:{ count:40 } }), false);
  assert.equal(hasEnoughComparisonSample({ ours:{ count:40 }, belarus:{ count:4 } }), false);
  assert.equal(hasEnoughComparisonSample({ ours:{ count:5 }, belarus:null }), false);
});

test("цена нашего каталога следует за переключателем квот", () => {
  const stats = {
    count:8,
    median:34_000,
    quotaOn:{ count:8, median:29_000 },
    quotaOff:{ count:8, median:34_000 },
  };
  assert.equal(comparisonOwnPrices(stats, true).median, 29_000);
  assert.equal(comparisonOwnPrices(stats, false).median, 34_000);
  assert.equal(comparisonOwnPrices({ count:8, median:31_000 }, true).median, 31_000);
});

test("по умолчанию выбирается самый выгодный год с достаточной выборкой", () => {
  const card = { years:[
    { year:2026, prices:{ 100000:{ ours:{ count:4, median:40_000 }, belarus:{ count:12, median:80_000 } } } },
    { year:2025, prices:{ 100000:{ ours:{ count:8, median:72_000 }, belarus:{ count:9, median:80_000 } } } },
    { year:2024, prices:{ 100000:{ ours:{ count:7, median:56_000 }, belarus:{ count:6, median:80_000 } } } },
  ] };
  const best = bestComparisonYear(card, "100000", "median", true);
  assert.equal(best.year.year, 2024);
  assert.equal(best.difference, 30);
  assert.equal(comparisonYearDifference(card.years[0], "100000", "median", true), null, "четырёх машин недостаточно");
});

test("самый выгодный год учитывает переключатель квот", () => {
  const stats = (median, quotaMedian) => ({ count:8, median, quotaOn:{ count:8, median:quotaMedian }, quotaOff:{ count:8, median } });
  const card = { years:[
    { year:2025, prices:{ all:{ ours:stats(90_000, 50_000), belarus:{ count:8, median:100_000 } } } },
    { year:2024, prices:{ all:{ ours:stats(70_000, 70_000), belarus:{ count:8, median:100_000 } } } },
  ] };
  assert.equal(bestComparisonYear(card, "all", "median", true).year.year, 2025);
  assert.equal(bestComparisonYear(card, "all", "median", false).year.year, 2024);
});

test("без надёжного сравнения берётся самый свежий год с нашей ценой", () => {
  const card = { years:[
    { year:2025, prices:{ all:{ ours:{ count:7, median:42_000 }, belarus:null } } },
    { year:2024, prices:{ all:{ ours:{ count:9, median:38_000 }, belarus:{ count:3, median:50_000 } } } },
  ] };
  const best = bestComparisonYear(card, "all", "median", true);
  assert.equal(best.year.year, 2025);
  assert.equal(best.difference, null);
});

test("если отдельные годы малы, достаточная сумма выбирается как Все года", () => {
  const card = { years:[
    { year:2025, prices:{ 100000:{ ours:{ count:3, min:40_000, mean:42_000, median:42_000 }, belarus:{ count:3, min:50_000, mean:52_000, median:52_000 } } } },
    { year:2024, prices:{ 100000:{ ours:{ count:3, min:30_000, mean:32_000, median:32_000 }, belarus:{ count:3, min:40_000, mean:45_000, median:45_000 } } } },
  ] };
  const best = bestComparisonYear(card, "100000", "median", true);
  assert.equal(best.year, null);
  assert.equal(best.aggregate, true);
  assert.ok(best.difference > 0);
  assert.deepEqual(best.prices, aggregateComparisonPrices(card.years, "100000", true));
  assert.equal(best.prices.ours.count, 6);
  assert.equal(best.prices.belarus.count, 6);
});

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

test("подробное сравнение сохраняет год, пробег и все показатели цены", () => {
  const detailed = {
    brands:{ BYD:{ Han:{ 2023:{
      100000:{ count:5, min:25000, mean:30000, median:29500, max:36000 },
      all:{ count:7, min:22000, mean:29000, median:28500, max:36000 },
    } } } },
  };
  const rows = compareDetailedRows({
    market:detailed,
    ours:[
      { brand:"BYD", model:"Han", type:"Электромобиль", year:2023, mileageMax:100000, count:12, min:21000, mean:24000, median:23500, max:29000, image:"han.jpg" },
      { brand:"BYD", model:"Han", type:"Электромобиль", year:2023, mileageMax:null, count:14, min:20000, mean:23500, median:23000, max:29000, image:"han.jpg" },
    ],
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].belarus, { count:5, min:25000, mean:30000, median:29500, max:36000 });
  assert.deepEqual(rows[0].ours, { count:12, min:21000, mean:24000, median:23500, max:29000 });
  const cards = groupDetailedRows(rows);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].type, "Электромобиль");
  assert.equal(cards[0].years[0].prices["100000"].belarus.median, 29500);
  assert.equal(cards[0].years[0].prices.all.ours.count, 14);
  assert.equal(cards[0].image, "han.jpg");
  assert.equal(cards[0].years[0].image, "han.jpg");
});

test("подробная статистика сохраняет нашу версию, но не подмешивает рынок другой силовой установки", () => {
  const detailed = { brands:{ BYD:{ "Song Plus EV":{ 2024:{ all:{ count:8, min:20000, mean:23000, median:22500, max:27000 } } } } } };
  const rows = compareDetailedRows({
    market:detailed,
    ours:[{ brand:"BYD", model:"Song PLUS DM-i", type:"Гибрид", year:2024, mileageMax:null, count:20, min:21000, mean:24000, median:23500, max:29000 }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, "Гибрид");
  assert.equal(rows[0].belarus, null);
});

test("модель без белорусских объявлений остаётся карточкой с нашей ценой", () => {
  const rows = compareDetailedRows({
    market:{ brands:{} },
    ours:[{ brand:"NIO", model:"ET5", type:"Электромобиль", year:2024, mileageMax:null, count:9, min:25000, mean:29000, median:28500, max:34000, image:"nio.jpg" }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ours.median, 28500);
  assert.equal(rows[0].belarus, null);
  const [card] = groupDetailedRows(rows);
  assert.equal(card.brand, "NIO");
  assert.equal(card.years[0].prices.all.belarus, null);
});

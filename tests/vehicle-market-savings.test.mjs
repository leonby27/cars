import assert from "node:assert/strict";
import test from "node:test";
import { MIN_MARKET_COMPARISON_CARS, selectMarketComparison } from "../src/market-compare.js";
import { createVehicleMarketLoader, vehicleMarketComparisonUrl, vehicleMarketSavings, vehicleMarketChoice } from "../src/vehicle-market-savings.js";

const car = { id: "sample", brand: "BMW", model: "X3", type: "Гибрид", year: 2022, mileage: 75900 };
const stats = (value, count = MIN_MARKET_COMPARISON_CARS) => ({ count, min: value, mean: value, median: value });
const fixture = () => ({ cards: [{ ...car, years: [{ year: 2022, prices: {
  "100000": { ours: stats(31000), belarus: stats(50000) },
  all: { ours: stats(10000), belarus: stats(50000) },
} }] }], collectedAt: "2026-09-18" });

test("сравнивает модель того же года и двигателя, в диапазоне пробега машины", () => {
  const result = vehicleMarketSavings(car, fixture());
  assert.equal(result.year, 2022);
  assert.equal(result.mileageMax, 100000);
  assert.deepEqual(result.options.map(({ key, percent }) => [key, percent]), [["mean", 38], ["median", 38], ["min", 38]]);
  for (const patch of [{ type: "ДВС" }, { model: "X4" }, { brand: "Audi" }, { available: false }]) {
    assert.equal(vehicleMarketSavings({ ...car, ...patch }, fixture()), null);
  }
  const longer = fixture(); longer.cards[0].longVersion = true;
  assert.equal(vehicleMarketSavings(car, longer), null);
});

test("нет выгоды или данных во всех диапазонах — блока нет", () => {
  for (const side of ["ours", "belarus"]) {
    const data = fixture();
    for (const prices of Object.values(data.cards[0].years[0].prices)) prices[side].count = MIN_MARKET_COMPARISON_CARS - 1;
    assert.equal(vehicleMarketSavings(car, data), null);
  }
  const data = fixture(); data.cards[0].years[0].prices = {};
  assert.equal(vehicleMarketSavings(car, data), null);
  for (const price of [50000, 60000, 0, NaN, Infinity]) {
    const data = fixture(); data.cards[0].years[0].prices["100000"].ours = stats(price);
    assert.equal(vehicleMarketSavings(car, data), null);
  }
  assert.equal(vehicleMarketSavings(car, null), null);
});

test("у нулевого пробега самый узкий диапазон, у неизвестного и большого — общий", () => {
  const data = fixture(); data.cards[0].years[0].prices["20000"] = { ours: stats(40000), belarus: stats(50000) };
  assert.equal(vehicleMarketSavings({ ...car, mileage: 0 }, data).mileageMax, 20000);
  assert.equal(vehicleMarketSavings({ ...car, mileage: 20000 }, data).mileageMax, 20000);
  for (const mileage of [null, undefined, "", -1, 250000]) {
    assert.equal(vehicleMarketSavings({ ...car, mileage }, data).mileageMax, null);
  }
});

test("учитывает только положительные сравнения, без нулевого процента", () => {
  const data = fixture();
  data.cards[0].years[0].prices["100000"].ours = { count: 5, mean: 60000, median: 49999, min: 31000 };
  assert.deepEqual(vehicleMarketSavings(car, data).options.map(x => x.key), ["min"]);
});

test("квота и указ выбирают соответствующие данные, а цена отдельной машины не влияет на выгоду модели", () => {
  const data = fixture();
  const own = data.cards[0].years[0].prices["100000"].ours;
  own.quotaOn = stats(25000); own.quotaOff = stats(60000);
  assert.equal(vehicleMarketSavings(car, data), null);
  assert.equal(vehicleMarketSavings({ ...car, estimatedTotalUsd: 90000 }, data, { quotaOn: true }).options[0].percent, 50);
  const without = new URL(vehicleMarketComparisonUrl(car), "https://example.test");
  const withBenefits = new URL(vehicleMarketComparisonUrl(car, { quotaOn: true, refund50: true }), "https://example.test");
  assert.equal(without.searchParams.get("quota"), "off");
  assert.equal(without.searchParams.has("refund50"), false);
  assert.equal(withBenefits.searchParams.get("quota"), "on");
  assert.equal(withBenefits.searchParams.get("refund50"), "1");
  assert.equal(withBenefits.searchParams.get("type"), "Гибрид");
  assert.equal(vehicleMarketComparisonUrl({ ...car, available: false }), null);
});

test("фильтрация API сохраняет полный свод для страницы и отделяет модель/двигатель для машины", () => {
  const data = fixture();
  data.cards.push({ ...data.cards[0], type: "ДВС" }, { ...data.cards[0], model: "X4" });
  assert.equal(selectMarketComparison(data), data);
  const selected = selectMarketComparison(data, { brand: "BMW", model: "x3", type: "Гибрид" });
  assert.equal(selected.cards.length, 1);
  assert.equal(selected.cards[0].type, "Гибрид");
  assert.equal(selected.collectedAt, data.collectedAt);
  assert.equal(data.cards.length, 3);
});

test("быстрые просмотры разделяют запрос, другой режим не получает старые данные", async () => {
  let calls = 0, time = 0;
  const load = createVehicleMarketLoader({ now: () => time, ttl: 10, fetcher: async () => { calls++; return new Response(JSON.stringify(fixture())); } });
  const url = vehicleMarketComparisonUrl(car);
  const a = load(url), b = load(url);
  assert.equal(a, b); await a;
  await load(url); assert.equal(calls, 1);
  await load(vehicleMarketComparisonUrl(car, { refund50: true })); assert.equal(calls, 2);
  time = 11; await load(url); assert.equal(calls, 3);
});

test("ошибка сравнения не кэшируется навсегда", async () => {
  let calls = 0;
  const load = createVehicleMarketLoader({ fetcher: async () => ++calls === 1 ? new Response("error", { status: 503 }) : new Response('{"cards":[]}') });
  await assert.rejects(load("/test"));
  assert.deepEqual(await load("/test"), { cards: [] });
  assert.equal(calls, 2);
});


test("выбор: порог от двух раз, точное 10 и ограничение более 10 без завышения", () => {
  for (const [ours, belarus, expected] of [
    [4, 2, "×2"], [5, 2, "×2,5"], [10, 2, "×5"],
    [20, 2, "×10"], [21, 2, "×10"], [1000, 2, "×10"],
    [299, 100, "×2,9"], [199, 100, null], [3, 2, null], [20, 0, null], [20, 1, null],
    [Infinity, 2, null], [4.5, 2, null],
  ]) {
    const data = fixture();
    data.cards[0].years[0].prices["100000"].ours.count = ours;
    data.cards[0].years[0].prices["100000"].belarus.count = belarus;
    const choice = vehicleMarketChoice(car, data);
    assert.equal(choice?.multiplier ?? null, expected, `${ours}/${belarus}`);
    if (choice) { assert.equal(choice.ours, ours); assert.equal(choice.belarus, belarus); }
  }
});

test("больший выбор показывается независимо от выгоды в цене, но в том же срезе", () => {
  const data = fixture();
  data.cards[0].years[0].prices["100000"] = { ours: stats(60000, 20), belarus: stats(50000, 2) };
  assert.equal(vehicleMarketSavings(car, data), null);
  assert.equal(vehicleMarketChoice(car, data).multiplier, "×10");
  assert.equal(vehicleMarketChoice(car, data).mileageMax, 100000);
  for (const patch of [{type:"ДВС"}, {model:"X4"}, {available:false}]) {
    assert.equal(vehicleMarketChoice({...car,...patch}, data), null);
  }
  assert.equal(vehicleMarketChoice(car, null), null);
});


test("автоматически выбирает наибольшую выгоду среди трёх способов сравнения", () => {
  for (const key of ["mean", "median", "min"]) {
    const data = fixture();
    data.cards[0].years[0].prices["100000"].ours[key] = 20000;
    const result = vehicleMarketSavings(car, data);
    assert.equal(result.best.key, key);
    assert.equal(result.best.percent, 60);
  }
  assert.equal(vehicleMarketSavings(car, fixture()).best.key, "mean");
});


test("плашка экономии требует минимум 10% до округления; выбор независим", () => {
  for (const [price, expected] of [[49300, null], [45005, null], [45000, 10], [44950, 10.1]]) {
    const data = fixture();
    data.cards[0].years[0].prices["100000"].ours = stats(price, 6);
    const result = vehicleMarketSavings(car, data);
    assert.equal(result?.best.percent ?? null, expected);
    assert.ok(vehicleMarketChoice(car, data));
  }
  const data = fixture();
  data.cards[0].years[0].prices["100000"].ours = { count: 2, mean: 49300, median: 45000, min: 46000 };
  assert.equal(vehicleMarketSavings(car, data).best.key, "median");
});


test("расширяет пробег до ближайшей достаточной выборки для обеих плашек", () => {
  const data = fixture();
  const prices = data.cards[0].years[0].prices;
  prices["20000"] = { ours: stats(31000, 20), belarus: null };
  prices["50000"] = { ours: stats(31000, 20), belarus: stats(50000, 1) };
  prices["100000"] = { ours: stats(31000, 20), belarus: stats(50000, 2) };
  prices["150000"] = { ours: stats(10000, 100), belarus: stats(50000, 2) };
  const lowMileageCar = { ...car, mileage: 20000 };
  assert.equal(vehicleMarketSavings(lowMileageCar, data).mileageMax, 100000);
  assert.equal(vehicleMarketSavings(lowMileageCar, data).best.percent, 38);
  assert.equal(vehicleMarketChoice(lowMileageCar, data).mileageMax, 100000);
  prices["50000"].belarus.count = 2;
  assert.equal(vehicleMarketSavings(lowMileageCar, data).mileageMax, 50000);
  assert.equal(vehicleMarketChoice(lowMileageCar, data).mileageMax, 50000);
  prices["50000"].ours.count = 1;
  assert.equal(vehicleMarketSavings(lowMileageCar, data).mileageMax, 100000);
  assert.equal(vehicleMarketChoice(lowMileageCar, data).mileageMax, 100000);
});

test("переходит к общему пробегу при нехватке данных, но не ищет более выгодный диапазон", () => {
  const data = fixture();
  delete data.cards[0].years[0].prices["100000"];
  data.cards[0].years[0].prices.all.ours.count = 10;
  assert.equal(vehicleMarketSavings(car, data).mileageMax, null);
  assert.equal(vehicleMarketChoice(car, data).mileageMax, null);
  data.cards[0].years[0].prices["100000"] = { ours: stats(50000, 2), belarus: stats(50000, 2) };
  assert.equal(vehicleMarketSavings(car, data), null);
  assert.equal(vehicleMarketChoice(car, data), null);
});

test("при 0–1 местном объявлении и минимум 10 наших показывает ×10 без плашки экономии", () => {
  for (const belarus of [null, stats(50000, 0), stats(50000, 1)]) {
    for (const count of [9, 10, 100]) {
      const data = fixture();
      data.cards[0].years[0].prices = { all: { ours: stats(10000, count), belarus } };
      const choice = vehicleMarketChoice(car, data);
      assert.equal(choice?.multiplier ?? null, count >= 10 ? "×10" : null);
      if (choice) assert.equal(choice.mileageMax, null);
      assert.equal(vehicleMarketSavings(car, data), null);
    }
  }
});

test("не принимает неизвестную или повреждённую выборку за отсутствие местных объявлений", () => {
  for (const belarus of [undefined, {}, { count: null }, { count: -1 }, { count: 0.5 }, { count: Infinity }]) {
    const data = fixture();
    data.cards[0].years[0].prices = { all: { ours: stats(10000, 100), belarus } };
    assert.equal(vehicleMarketChoice(car, data), null);
  }
  for (const count of [undefined, NaN, Infinity, 10.5]) {
    const data = fixture();
    data.cards[0].years[0].prices = { all: { ours: { count }, belarus: null } };
    assert.equal(vehicleMarketChoice(car, data), null);
  }
});

test("редкая местная выборка не заменяет достаточный срез и не смешивает машины", () => {
  const data = fixture();
  data.cards[0].years[0].prices.all = { ours: stats(10000, 100), belarus: null };
  assert.equal(vehicleMarketChoice(car, data), null); // В ближайшем достаточном срезе выбор одинаковый.
  delete data.cards[0].years[0].prices["100000"];
  assert.equal(vehicleMarketChoice(car, data).multiplier, "×10");
  for (const patch of [{ type: "ДВС" }, { model: "X4" }, { available: false }]) {
    assert.equal(vehicleMarketChoice({ ...car, ...patch }, data), null);
  }
  data.cards[0].longVersion = true;
  assert.equal(vehicleMarketChoice(car, data), null);
});

test("если года машины нет, сравнивает все годы той же модели и двигателя", () => {
  const data = fixture();
  data.cards[0].years[0].prices["100000"].ours.count = 20;
  const missingYear = { ...car, year: 2026 };
  const savings = vehicleMarketSavings(missingYear, data);
  const choice = vehicleMarketChoice(missingYear, data);
  assert.equal(savings.year, null);
  assert.equal(savings.best.percent, 38);
  assert.equal(choice.year, null);
  assert.equal(choice.multiplier, "×10");
  assert.equal(choice.mileageMax, 100000);
});

test("9 машин одного года при редкой местной выборке дополняются остальными годами модели", () => {
  const data = fixture();
  data.cards[0].years = [
    { year: 2022, prices: { all: { ours: stats(31000, 9), belarus: null } } },
    { year: 2021, prices: { all: { ours: stats(30000, 8), belarus: stats(50000, 1) } } },
  ];
  const choice = vehicleMarketChoice(car, data);
  assert.equal(choice.year, null);
  assert.equal(choice.ours, 17);
  assert.equal(choice.belarus, 1);
  assert.equal(choice.multiplier, "×10");
  assert.equal(vehicleMarketSavings(car, data), null);
});

test("достаточный год без выгоды не заменяется выгодной моделью, а редкий — объединяется с весами", () => {
  const data = fixture();
  data.cards[0].years = [
    { year: 2022, prices: { all: { ours: stats(50000, 2), belarus: stats(50000, 2) } } },
    { year: 2021, prices: { all: { ours: stats(20000, 8), belarus: stats(50000, 2) } } },
  ];
  assert.equal(vehicleMarketChoice(car, data), null);
  assert.equal(vehicleMarketSavings(car, data), null);
  data.cards[0].years[0].prices.all.belarus.count = 1;
  const savings = vehicleMarketSavings(car, data);
  assert.equal(savings.year, null);
  assert.equal(savings.options.find(item => item.key === "mean").percent, 48);
  assert.equal(vehicleMarketChoice(car, data).multiplier, "×3,3");
});

test("объединение лет сохраняет выбор квоты и не считает неизвестные данные нулём", () => {
  const data = fixture();
  const own = data.cards[0].years[0].prices["100000"].ours;
  own.quotaOn = stats(25000, 20);
  own.quotaOff = stats(60000, 20);
  const missingYear = { ...car, year: 2026 };
  assert.equal(vehicleMarketSavings(missingYear, data), null);
  assert.equal(vehicleMarketSavings(missingYear, data, { quotaOn: true }).best.percent, 50);
  for (const belarus of [undefined, {}, { count: null }, { count: -1 }]) {
    data.cards[0].years[0].prices = { all: { ours: stats(20000, 20), belarus } };
    assert.equal(vehicleMarketChoice(missingYear, data), null);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { marketPriceStatsFromRows, marketPriceStatsFromRowsAsync } from "../server/market-price-stats.mjs";

const row = (id, { type = "Электромобиль", mileage = 40_000 } = {}) => ({
  id:String(id),
  brand:type === "Электромобиль" ? "Test EV" : "Test Petrol",
  model:"One",
  year:2024,
  mileage_km:mileage,
  price_cny:100_000 + id * 1_000,
  source:"Guazi",
  city:"Шанхай",
  type,
  engine:type === "Электромобиль" ? null : "1.5T 150HP L4",
  transmission:type === "Электромобиль" ? "Single-speed" : "7-speed dual-clutch",
  image:id === 1 ? "fresh.jpg" : null,
});

test("сравнение рынка применяет указ № 140 к каждому автомобилю перед агрегацией", () => {
  for (const type of ["Электромобиль", "Бензин"]) {
    const rows = [1, 2, 3, 4, 5].map((id) => row(id, { type }));
    const full = marketPriceStatsFromRows(rows);
    const half = marketPriceStatsFromRows(rows, { refund50:true });
    assert.equal(full.length, half.length);
    for (let index = 0; index < full.length; index++) {
      assert.equal(half[index].count, full[index].count);
      assert.ok(half[index].quotaOff.median < full[index].quotaOff.median);
      if (type === "Электромобиль") assert.equal(half[index].quotaOn.median, full[index].quotaOn.median);
      else assert.ok(half[index].quotaOn.median < full[index].quotaOn.median);
    }
  }
});

test("свод цен хранит режим с квотой и без неё", () => {
  const rows = [1, 2, 3, 4, 5].map((id) => row(id));
  const stats = marketPriceStatsFromRows(rows);
  const under50 = stats.find((item) => item.brand === "Test EV" && item.mileageMax === 50_000);
  assert.equal(under50.count, 5);
  assert.equal(under50.quotaOn.count, 5);
  assert.equal(under50.quotaOff.count, 5);
  assert.ok(under50.quotaOff.median > under50.quotaOn.median);
  assert.equal(under50.image, "fresh.jpg");
});

test("квота не меняет цену автомобиля с ДВС", () => {
  const [stats] = marketPriceStatsFromRows([row(1, { type:"Бензин", mileage:210_000 })]);
  assert.equal(stats.mileageMax, null);
  assert.equal(stats.type, "ДВС");
  assert.deepEqual(stats.quotaOn, stats.quotaOff);
});

test("одинаковые модели разных типов не смешиваются в одну цену", () => {
  const electric = row(1, { type:"Электромобиль" });
  const hybrid = row(2, { type:"Гибрид" });
  const stats = marketPriceStatsFromRows([
    { ...electric, brand:"Test", model:"One" },
    { ...hybrid, brand:"Test", model:"One" },
  ]).filter((item) => item.mileageMax === 50_000);
  assert.deepEqual(stats.map((item) => item.type).sort(), ["Гибрид", "Электромобиль"]);
  assert.ok(stats.every((item) => item.count === 1));
});

test("background aggregation yields to other requests and preserves all results", async () => {
  const rows = Array.from({length:2100}, (_,i)=>row(i%20+1,{type:i%2 ? "Электромобиль" : "Бензин"}));
  let yielded = false;
  setImmediate(()=>{yielded=true;});
  for (const refund50 of [false,true]) {
    const actual = await marketPriceStatsFromRowsAsync(rows,{refund50});
    assert.equal(yielded,true);
    assert.deepEqual(actual,marketPriceStatsFromRows(rows,{refund50}));
  }
});

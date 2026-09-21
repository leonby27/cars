import test from "node:test";
import assert from "node:assert/strict";
import { marketPriceStatsFromRows } from "../server/market-price-stats.mjs";

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

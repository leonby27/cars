import test from "node:test";
import assert from "node:assert/strict";
import { getPriceChange, formatChangeDate } from "../src/price-change.js";

const car = {
  source: "Che168",
  usdPrice: 27780,
  chinaPrice: 198600,
  year: 2025,
  type: "Электромобиль",
  city: "Shanghai",
};
const now = new Date("2026-08-25T12:00:00Z").getTime();
const changedAt = "2026-08-24T09:00:00Z";

test("a real re-pricing gives a direction and the previous landed price", () => {
  const cheaper = getPriceChange({ ...car, previousPriceUsd: 28900, priceChangedAt: changedAt }, now);
  assert.equal(cheaper.direction, "down");
  assert.ok(cheaper.previousTotalUsd > 0);
  const dearer = getPriceChange({ ...car, previousPriceUsd: 26500, priceChangedAt: changedAt }, now);
  assert.equal(dearer.direction, "up");
  assert.ok(dearer.previousTotalUsd < cheaper.previousTotalUsd);
});

test("exchange-rate noise and old changes are not shown", () => {
  assert.equal(getPriceChange({ ...car, previousPriceUsd: 27750, priceChangedAt: changedAt }, now), null);
  assert.equal(getPriceChange({ ...car, previousPriceUsd: 28900, priceChangedAt: "2026-06-01T09:00:00Z" }, now), null);
  assert.equal(getPriceChange({ ...car, previousPriceUsd: 28900 }, now), null);
  assert.equal(getPriceChange({ ...car, priceChangedAt: changedAt }, now), null);
  assert.equal(getPriceChange(car, now), null);
});

test("the tooltip date is written the Russian way", () => {
  assert.equal(formatChangeDate("2026-08-24T09:00:00Z"), "24 августа");
  assert.equal(formatChangeDate("nonsense"), null);
});

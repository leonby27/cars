import test from "node:test";
import assert from "node:assert/strict";
import { isDamagedMarketListing, withoutLowPriceOutliers } from "../src/market-price-cleanup.js";

test("аварийные машины и машины на запчасти не попадают в сравнение", () => {
  assert.equal(isDamagedMarketListing({ condition:"аварийный" }), true);
  assert.equal(isDamagedMarketListing({ properties:{ condition:"на запчасти" } }), true);
  assert.equal(isDamagedMarketListing({ condition:"с пробегом" }), false);
});

test("аномально дешёвое объявление Voyah FREE не задаёт нижнюю цену рынка", () => {
  const prices = [3_308, 26_300, 29_106, 29_900, 30_000, 31_000, 32_300];
  assert.deepEqual(withoutLowPriceOutliers(prices), [26_300, 29_106, 29_900, 30_000, 31_000, 32_300]);
});

test("несколько дешёвых объявлений ниже большого разрыва удаляются вместе", () => {
  const prices = [3_500, 4_900, 25_000, 26_000, 27_000, 28_000];
  assert.deepEqual(withoutLowPriceOutliers(prices), [25_000, 26_000, 27_000, 28_000]);
});

test("обычный ценовой разброс и дорогая комплектация сохраняются", () => {
  const prices = [18_000, 24_000, 29_000, 34_000, 49_000];
  assert.deepEqual(withoutLowPriceOutliers(prices), prices);
});

test("разрыв ровно в десять тысяч уже считается аномальным", () => {
  assert.deepEqual(withoutLowPriceOutliers([10_000, 20_000, 22_000, 24_000, 26_000]), [20_000, 22_000, 24_000, 26_000]);
});

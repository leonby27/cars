import test from "node:test";
import assert from "node:assert/strict";
import { estimateLandedCost } from "../src/pricing.js";
import { selectSimilarCars, SIMILAR_CAR_BUDGET_TOLERANCE } from "../src/similar-cars.js";

const car = (overrides = {}) => ({
  id: "current",
  brand: "BYD",
  model: "Han",
  year: 2024,
  type: "Электромобиль",
  bodyType: "Седан",
  chinaPrice: 150000,
  ...overrides,
});

test("selects only another model with the same body type and a comparable budget", () => {
  const current = car();
  const currentPrice = estimateLandedCost(current).totalUsd;
  const withinBudget = car({ id: "within", brand: "Xiaomi", model: "SU7", chinaPrice: 155000 });
  const sameModel = car({ id: "same-model", chinaPrice: 152000 });
  const wrongBody = car({ id: "wrong-body", brand: "BYD", model: "Song Pro", bodyType: "SUV / кроссовер", chinaPrice: 151000 });
  const outsideBudget = car({ id: "outside-budget", brand: "NIO", model: "ET7", chinaPrice: 400000 });

  assert.ok(Math.abs(estimateLandedCost(withinBudget).totalUsd - currentPrice) / currentPrice <= SIMILAR_CAR_BUDGET_TOLERANCE);
  assert.deepEqual(selectSimilarCars(current, [sameModel, wrongBody, outsideBudget, withinBudget]).map(({ id }) => id), ["within"]);
});

test("orders matching models by landed-price proximity and then by year", () => {
  const current = car();
  const matches = [
    car({ id: "farther", brand: "NIO", model: "ET7", chinaPrice: 162000 }),
    car({ id: "newer-year", brand: "Xiaomi", model: "SU7", year: 2025, chinaPrice: 150000 }),
    car({ id: "same-year", brand: "Avatr", model: "12", chinaPrice: 150000 }),
  ];

  assert.deepEqual(selectSimilarCars(current, matches).map(({ id }) => id), ["same-year", "newer-year", "farther"]);
});

test("returns no recommendations when body type or price cannot be compared", () => {
  const unknownBody = car({ brand: "Unknown", model: "Mystery", bodyType: "", bodyStructure: "", description: "" });
  assert.deepEqual(selectSimilarCars(unknownBody, [car({ id: "candidate", brand: "NIO", model: "ET7" })]), []);
  assert.deepEqual(selectSimilarCars(car({ chinaPrice: 0 }), [car({ id: "candidate", brand: "NIO", model: "ET7" })]), []);
});

import test from "node:test";
import assert from "node:assert/strict";
import { matchesMinimumYear, minimumYear, sortCars } from "../src/car-filters.js";

test("extracts the lower year boundary", () => {
  assert.equal(minimumYear("от 2024"), 2024);
});

test("excludes older cars from a minimum-year filter", () => {
  assert.equal(matchesMinimumYear({ year: 2022 }, "от 2024"), false);
  assert.equal(matchesMinimumYear({ year: 2024 }, "от 2024"), true);
  assert.equal(matchesMinimumYear({ year: 2025 }, "от 2024"), true);
});

test("sorts catalog cars by price, mileage, listing date and model year", () => {
  const cars = [
    { id:"a", estimatedTotalUsd:30000, mileage:40000, sourceListedAt:"2026-01-01", year:2024, range:500 },
    { id:"b", estimatedTotalUsd:20000, mileage:50000, sourceListedAt:"2026-03-01", year:2023, electricRange:700 },
    { id:"c", estimatedTotalUsd:40000, mileage:10000, sourceListedAt:"2026-02-01", year:2025 },
  ];
  assert.deepEqual(sortCars(cars, "price_asc").map((car) => car.id), ["b", "a", "c"]);
  assert.deepEqual(sortCars(cars, "price_desc").map((car) => car.id), ["c", "a", "b"]);
  assert.deepEqual(sortCars(cars, "mileage_asc").map((car) => car.id), ["c", "a", "b"]);
  assert.deepEqual(sortCars(cars, "range_desc").map((car) => car.id), ["b", "a", "c"]);
  assert.deepEqual(sortCars(cars, "newest").map((car) => car.id), ["b", "c", "a"]);
  assert.deepEqual(sortCars(cars, "year_desc").map((car) => car.id), ["c", "a", "b"]);
  assert.deepEqual(sortCars(cars, "year_asc").map((car) => car.id), ["b", "a", "c"]);
  assert.deepEqual(cars.map((car) => car.id), ["a", "b", "c"]);
});

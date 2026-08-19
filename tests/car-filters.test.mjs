import test from "node:test";
import assert from "node:assert/strict";
import { matchesYearRange, sortCars } from "../src/car-filters.js";

test("keeps an open year range unfiltered", () => {
  assert.equal(matchesYearRange({ year: 2019 }, null, null), true);
  assert.equal(matchesYearRange({ year: 2019 }, 2024, null), false);
  assert.equal(matchesYearRange({ year: 2025 }, null, 2024), false);
});

test("includes both ends of a closed year range", () => {
  assert.equal(matchesYearRange({ year: 2021 }, 2022, 2024), false);
  assert.equal(matchesYearRange({ year: 2022 }, 2022, 2024), true);
  assert.equal(matchesYearRange({ year: 2023 }, 2022, 2024), true);
  assert.equal(matchesYearRange({ year: 2024 }, 2022, 2024), true);
  assert.equal(matchesYearRange({ year: 2025 }, 2022, 2024), false);
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

test("mixes the default order and repeats it for the same seed", () => {
  const cars = Array.from({ length: 40 }, (item, index) => ({
    id:String(index),
    brand:index % 2 ? "BYD" : "Zeekr",
    model:index % 2 ? "Song" : "001",
    bodyType:"SUV / кроссовер",
    chinaPrice:100000 + (index % 4) * 40000,
    year:2024,
    type:"Электромобиль",
  }));
  const first = sortCars(cars, "default", "seed-a").map((car) => car.id);
  assert.deepEqual(sortCars(cars, "default", "seed-a").map((car) => car.id), first);
  assert.notDeepEqual(sortCars(cars, "default", "seed-b").map((car) => car.id), first);
  assert.deepEqual([...first].sort(), cars.map((car) => car.id).sort());
  assert.deepEqual(cars.map((car) => car.id), Array.from({ length: 40 }, (item, index) => String(index)));
  const ordered = sortCars(cars, "default", "seed-a");
  const neighbours = ordered.filter((car, index) => index && car.model === ordered[index - 1].model);
  assert.equal(neighbours.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { matchesMinimumYear, minimumYear } from "../src/car-filters.js";

test("extracts the lower year boundary", () => {
  assert.equal(minimumYear("от 2024"), 2024);
});

test("excludes older cars from a minimum-year filter", () => {
  assert.equal(matchesMinimumYear({ year: 2022 }, "от 2024"), false);
  assert.equal(matchesMinimumYear({ year: 2024 }, "от 2024"), true);
  assert.equal(matchesMinimumYear({ year: 2025 }, "от 2024"), true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { compatibleCrossSourcePair, findCrossSourceDuplicates, normalizeCity } from "../scripts/lib/cross-source-dedupe.mjs";

const car = (id, source, overrides = {}) => ({
  id,
  source,
  status: "active",
  brand: "Tesla",
  model: "Model Y",
  modelYear: 2024,
  firstRegistration: "2024.06",
  mileageKm: 40_000,
  priceCny: source === "Guazi" ? 180_000 : 176_000,
  city: source === "Guazi" ? "Shanghai, China" : "shanghai",
  color: "Dark grey",
  powertrain: "Электромобиль",
  drivetrain: "Задний",
  batteryKwh: 60,
  electricRangeKm: 554,
  ...overrides,
});

test("normalizes the Guazi country suffix without changing the city", () => {
  assert.equal(normalizeCity(" Shanghai, China "), "shanghai");
  assert.equal(normalizeCity("SHANGHAI"), "shanghai");
});

test("finds a strict indirect Guazi to Che168 duplicate", () => {
  const matches = findCrossSourceDuplicates([car("guazi-1", "Guazi"), car("che168-1", "Che168")]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].duplicateId, "guazi-1");
  assert.equal(matches[0].canonicalId, "che168-1");
  assert.equal(matches[0].confidence, 98);
});

test("keeps an ambiguous Guazi card visible", () => {
  const matches = findCrossSourceDuplicates([
    car("guazi-1", "Guazi"),
    car("che168-1", "Che168"),
    car("che168-2", "Che168", { mileageKm: 40_100, priceCny: 178_000 }),
  ]);
  assert.deepEqual(matches, []);
});

test("keeps both Guazi cards visible when they point to one Che168 card", () => {
  const matches = findCrossSourceDuplicates([
    car("guazi-1", "Guazi"),
    car("guazi-2", "Guazi", { mileageKm: 40_100 }),
    car("che168-1", "Che168"),
  ]);
  assert.deepEqual(matches, []);
});

test("rejects a similar car when a decisive signal differs", () => {
  const guazi = car("guazi-1", "Guazi");
  assert.equal(compatibleCrossSourcePair(guazi, car("che168-1", "Che168", { city: "Beijing" })), false);
  assert.equal(compatibleCrossSourcePair(guazi, car("che168-2", "Che168", { mileageKm: 40_501 })), false);
  assert.equal(compatibleCrossSourcePair(guazi, car("che168-3", "Che168", { electricRangeKm: 600 })), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { repairVerifiedDrive, driveConflicts } from "../src/vehicle-spec-integrity.js";
import { buildChe168Car } from "../scripts/lib/che168-parser.mjs";
import { normalizeCar } from "../server/repository.mjs";

const car = {
  brand: "Lexus", model: "UX EV", rawModel: "2020 300e Pure Yue Edition",
  type: "Электромобиль", drive: "Задний", year: 2020, battery: 54.35,
  manufactureDate: "2022-03-01", technicalSpecs: { count: 3, groups: [{ name: "Данные", items: [
    { name: "Тип привода", value: "Задний привод" },
    { name: "Количество приводных двигателей", value: "Одноэлектродвигательный" },
    { name: "Компоновка двигателей", value: "Передний" },
  ] }] },
};

test("repairs both drive representations, preserves evidence and unrelated facts, is idempotent", () => {
  const snapshot = structuredClone(car);
  const fixed = repairVerifiedDrive(car);
  assert.equal(fixed.drive, "Передний");
  assert.equal(fixed.technicalSpecs.groups[0].items[0].value, "Передний привод");
  assert.equal(fixed.specCorrections[0].originalDrive, "Задний");
  assert.equal(fixed.specCorrections[0].originalSpecRows[0].value, "Задний привод");
  assert.equal(fixed.year, 2020);
  assert.equal(fixed.manufactureDate, "2022-03-01");
  assert.equal(fixed.battery, 54.35);
  assert.deepEqual(car, snapshot);
  assert.deepEqual(repairVerifiedDrive(fixed), fixed);
  assert.deepEqual(driveConflicts(fixed), []);
});

test("never applies model correction to hybrids, RZ, unknown UX trims or another brand", () => {
  for (const override of [{ type: "Гибрид" }, { model: "RZ" }, { rawModel: "2020 250h" }, { brand: "Toyota" }]) {
    const other = { ...car, ...override };
    assert.equal(repairVerifiedDrive(other), other);
  }
});

test("flags a single-motor BEV conflict but does not guess or change its drive", () => {
  const other = { ...car, brand: "Other" };
  assert.equal(driveConflicts(other)[0].reason, "single-motor-layout-conflict");
  assert.equal(other.drive, "Задний");
  assert.deepEqual(driveConflicts({ ...other, type: "Гибрид" }), []);
  assert.deepEqual(driveConflicts({ ...other, technicalSpecs: undefined }), []);
  const dual = structuredClone(other);
  dual.technicalSpecs.groups[0].items[1].value = "Два мотора";
  assert.deepEqual(driveConflicts(dual), []);
});

test("database reads and writes normalize UX 300e consistently", () => {
  const fixed = normalizeCar(car);
  assert.equal(fixed.drive, "Передний");
  assert.equal(fixed.technicalSpecs.groups[0].items[0].value, "Передний привод");
});

test("Che168 import corrects source RWD in English summary and detail before persistence", () => {
  const imported = buildChe168Car({ detail: {
    infoid: 59230029, brandname: "Lexus", seriesname: "Lexus UX Electric",
    specname: "2020 300e Pure Yue Edition", fuelname: "Pure Electric",
    drivingmode: "Rear-Wheel Drive (RWD)", mileage: "73000", price: "16200",
    catepiclist: [{ list: ["https://example.com/1.jpg", "https://example.com/2.jpg"] }],
  }, specGroups: [{ name: "Chassis", paramitems: [{ name: "Drive Type", value: "Rear-Wheel Drive (RWD)" }] }] });
  assert.equal(imported.drive, "Передний");
  assert.equal(imported.technicalSpecs.groups[0].items[0].value, "Front-Wheel Drive (FWD)");
  assert.deepEqual(imported.specWarnings, []);
});

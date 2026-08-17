import test from "node:test";
import assert from "node:assert/strict";
import { buildVehicleQuickInfo } from "../src/vehicle-quick-info.js";

test("builds a compact comma-separated vehicle summary from available facts", () => {
  assert.equal(
    buildVehicleQuickInfo({
      year:2025,
      mileage:11500,
      type:"Электромобиль",
      electricRange:650,
      combinedRange:1000,
      drive:"Полный",
      battery:94.5,
      horsepower:568,
    }).join(", "),
    "2025 г., пробег 11 500 км, электро, запас хода 650 км, 1 000 км, полный привод, батарея 94,5 кВт·ч, 568 сил",
  );
});

test("omits unavailable quick facts instead of inventing values", () => {
  assert.equal(
    buildVehicleQuickInfo({ year:2024, type:"Гибрид", range:220, bodyType:"SUV / кроссовер", drive:"Передний" }).join(", "),
    "2024 г., гибрид, запас хода 220 км, передний привод",
  );
});

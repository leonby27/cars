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

test("объём мотора идёт рядом с топливом у бензиновых и гибридов", () => {
  assert.equal(
    buildVehicleQuickInfo({ year:2023, mileage:62300, type:"ДВС", engine:"2.0T 184HP L4", drive:"Полный" }).join(", "),
    "2023 г., пробег 62 300 км, бензин 2.0 л, полный привод",
  );
  assert.equal(
    buildVehicleQuickInfo({ year:2024, type:"Гибрид", engine:"1.5T 144HP L3", drive:"Передний" }).join(", "),
    "2024 г., гибрид 1.5 л, передний привод",
  );
});

test("без объёма остаётся одно слово, у электромобиля объёма не бывает", () => {
  // Гибрид с генератором: источник пишет в строке мотора мощность, объёма там нет.
  assert.equal(
    buildVehicleQuickInfo({ year:2025, type:"Гибрид", engine:"Range Extender 160 Horsepower" }).join(", "),
    "2025 г., гибрид",
  );
  assert.equal(buildVehicleQuickInfo({ type:"ДВС" }).join(", "), "бензин");
  assert.equal(
    buildVehicleQuickInfo({ year:2025, type:"Электромобиль", engine:"2.0T 184HP L4", battery:94.5 }).join(", "),
    "2025 г., электро, батарея 94,5 кВт·ч",
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { deliveryBodyClass, deliveryModelSize, deliveryPrecisionPrompt, estimateDeliveryCip, isLargeDeliveryModel } from "../src/delivery-estimate.js";

test("CIP estimate uses the default eastern-China route when the location is unknown", () => {
  const estimate = estimateDeliveryCip();

  assert.equal(estimate.total, 3600);
  assert.equal(estimate.low, 3200);
  assert.equal(estimate.high, 3950);
  assert.equal(estimate.transitLabel, "север и восток Китая");
  assert.deepEqual(estimate.rows.map((row) => row.label), [
    "Документы и страхование",
    "Автовоз по Китаю до Хоргоса",
    "Хоргос — Минск",
  ]);
});

test("CIP estimate responds to the selected Chinese city", () => {
  const border = estimateDeliveryCip({ city: "wulumuqi" });
  const coast = estimateDeliveryCip({ city: "shanghai" });

  assert.equal(border.total, 3100);
  assert.equal(coast.total, 3700);
  assert.ok(coast.total > border.total);
});

test("large models receive the shared carrier surcharge", () => {
  assert.equal(isLargeDeliveryModel("Li Auto L9"), true);
  assert.equal(isLargeDeliveryModel("BYD Seagull"), false);

  const standard = estimateDeliveryCip({ model: "BYD Seagull" });
  const large = estimateDeliveryCip({ model: "Li Auto L9" });

  assert.equal(large.total - standard.total, 200);
  assert.equal(large.rows.at(-1).label, "Крупный кузов");
});

test("known dimensions, not only a model-name list, determine the carrier surcharge", () => {
  const compact = estimateDeliveryCip({ model: "Example", lengthMm: 4949, curbWeight: 2299 });
  const long = estimateDeliveryCip({ model: "Example", lengthMm: 4950 });
  const heavy = estimateDeliveryCip({ model: "Example", curbWeight: 2300 });

  assert.equal(compact.large, false);
  assert.equal(long.large, true);
  assert.equal(heavy.large, true);
  assert.equal(long.total - compact.total, 200);
});

test("catalog dimensions make Zeekr 8X delivery dearer than Zeekr X", () => {
  const zeekrX = deliveryModelSize([
    { dimensions:"4450*1836*1572", curbWeight:1860 },
    { dimensions:"4450*1836*1572", curbWeight:1885 },
  ]);
  const zeekr8X = deliveryModelSize([
    { dimensions:"5100*1998*1780", curbWeight:2790 },
    { dimensions:"5100*1998*1780", curbWeight:2790 },
  ]);
  const compact = estimateDeliveryCip({ model:"Zeekr X", ...zeekrX });
  const flagship = estimateDeliveryCip({ model:"Zeekr 8X", ...zeekr8X });

  assert.equal(compact.large, false);
  assert.equal(flagship.large, true);
  assert.equal(flagship.total - compact.total, 200);
  assert.equal(flagship.rows.at(-1).label, "Крупный кузов");
  assert.equal(deliveryBodyClass("Zeekr X", zeekrX), "Средний кузов");
  assert.equal(deliveryBodyClass("Zeekr 8X", zeekr8X), "Крупный кузов");
});

test("delivery precision prompt names only the choices that are still missing", () => {
  assert.equal(
    deliveryPrecisionPrompt(),
    "Для более точного расчёта выберите модель и местоположение машины.",
  );
  assert.equal(
    deliveryPrecisionPrompt({ modelSelected:true }),
    "Для более точного расчёта выберите местоположение машины.",
  );
  assert.equal(
    deliveryPrecisionPrompt({ locationSelected:true }),
    "Для более точного расчёта выберите модель машины.",
  );
  assert.equal(deliveryPrecisionPrompt({ modelSelected:true, locationSelected:true }), "");
});

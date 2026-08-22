import test from "node:test";
import assert from "node:assert/strict";
import { estimateLandedCost } from "../src/pricing.js";

test("keeps the landed estimate internally consistent", () => {
  const price = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль" }, { quotaOver:false });
  assert.ok(price.totalLow < price.totalUsd);
  assert.ok(price.totalUsd < price.totalHigh);
  assert.equal(price.customsNote, "Льгота 0% · оформление и сборы");
  assert.equal(price.customsAlert, null);
});

test("charges the 15% duty once the quota is gone", () => {
  const car = { chinaPrice:100000, year:2024, type:"Электромобиль" };
  const free = estimateLandedCost(car, { quotaOver:false });
  const dutied = estimateLandedCost(car, { quotaOver:true });
  assert.equal(dutied.customsUsd, Math.round((free.chinaUsd * 0.15 + free.customsUsd) / 50) * 50);
  assert.equal(dutied.customsNote, "Пошлина 15% · оформление и сборы");
  assert.equal(dutied.customsAlert, "Квоты закончились");
  assert.ok(dutied.totalUsd > free.totalUsd);
});

test("leaves combustion cars out of the quota story", () => {
  const car = { chinaPrice:100000, year:2024, type:"Гибрид", engine:"1.5L" };
  assert.equal(estimateLandedCost(car, { quotaOver:true }).customsAlert, null);
  assert.equal(
    estimateLandedCost(car, { quotaOver:true }).customsUsd,
    estimateLandedCost(car, { quotaOver:false }).customsUsd,
  );
});

test("includes engine-based customs for a PHEV", () => {
  const ev = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль" }, { quotaOver:false });
  const phev = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Гибрид", engine:"1.5L" });
  assert.ok(phev.customsUsd > ev.customsUsd);
  assert.match(phev.customsNote, /1,5 л/);
});

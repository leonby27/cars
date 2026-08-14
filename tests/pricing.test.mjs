import test from "node:test";
import assert from "node:assert/strict";
import { estimateLandedCost } from "../src/pricing.js";

test("keeps the landed estimate internally consistent", () => {
  const price = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль" });
  assert.ok(price.totalLow < price.totalUsd);
  assert.ok(price.totalUsd < price.totalHigh);
  assert.equal(price.customsNote, "Пошлина 0% по льготе; оформление и сборы");
});

test("includes engine-based customs for a PHEV", () => {
  const ev = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль" });
  const phev = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Гибрид", engine:"1.5L" });
  assert.ok(phev.customsUsd > ev.customsUsd);
  assert.match(phev.customsNote, /1,5 л/);
});

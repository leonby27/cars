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
  assert.equal(dutied.customsAlert, "Без квоты на льготный ввоз");
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

test("charges a series hybrid the 15% duty with 20% VAT on top", () => {
  const car = { chinaPrice:100000, year:2024, type:"Гибрид", sourceFuelType:"Range Extender" };
  const price = estimateLandedCost(car, { quotaOver:false });
  const duty = price.chinaUsd * 0.15;
  assert.equal(price.customsUsd, Math.round((duty + (price.chinaUsd + duty) * 0.2 + 350) / 50) * 50);
  assert.equal(price.customsNote, "Гибрид с генератором · пошлина 15% и НДС 20%");
  assert.equal(price.customsAlertTone, "warn");
  assert.match(price.customsAlert, /льготы нет с 2026/);
  assert.match(price.customsHint, /крутит генератор/);
  assert.equal(price.seriesHybrid, true);
});

test("keeps the series hybrid out of the quota switch", () => {
  const car = { chinaPrice:100000, year:2024, type:"Гибрид", sourceFuelType:"Range Extender" };
  assert.equal(
    estimateLandedCost(car, { quotaOver:true }).customsUsd,
    estimateLandedCost(car, { quotaOver:false }).customsUsd,
  );
});

test("spots a series hybrid by its single-speed gearbox when the fuel type is missing", () => {
  const marked = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Гибрид", sourceFuelType:"Range Extender" });
  const guessed = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Гибрид", transmission:"Electric vehicle single-speed transmission" });
  assert.equal(guessed.customsUsd, marked.customsUsd);
  assert.equal(guessed.seriesHybrid, true);
});

test("leaves the plug-in hybrid on the engine-size rate", () => {
  const phev = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Гибрид", sourceFuelType:"Plug-in Hybrid", transmission:"8-speed automatic", engine:"1.5T" });
  assert.equal(phev.seriesHybrid, false);
  assert.equal(phev.customsAlert, null);
  assert.equal(phev.customsAlertTone, null);
  assert.match(phev.customsNote, /1,5 л/);
});

test("adds import VAT to an electric car older than five years", () => {
  const fresh = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль", manufactureDate:"2024-03-01" }, { quotaOver:false });
  const old = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль", manufactureDate:"2019-03-01" }, { quotaOver:false });
  assert.equal(fresh.customsUsd, 350);
  assert.equal(old.customsUsd, Math.round((old.chinaUsd * 0.2 + 350) / 50) * 50);
  assert.equal(old.customsAlertTone, "warn");
  assert.match(old.customsNote, /старше 5 лет/);
  assert.match(old.customsHint, /пяти лет/);
});

test("counts the age from the manufacturing date, not the model year", () => {
  const byModelYear = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль" }, { quotaOver:false });
  const byPlate = estimateLandedCost({ chinaPrice:100000, year:2024, type:"Электромобиль", manufactureDate:"2020-01-01" }, { quotaOver:false });
  assert.equal(byModelYear.customsAlert, null);
  assert.match(byPlate.customsAlert, /Старше 5 лет/);
  assert.ok(byPlate.ageYears > 6 && byPlate.ageYears < 7);
});

test("uses the engine-size rate band instead of one flat rate", () => {
  const small = estimateLandedCost({ chinaPrice:100000, year:2022, type:"Гибрид", engine:"1.5T", manufactureDate:"2022-01-01" });
  const big = estimateLandedCost({ chinaPrice:100000, year:2022, type:"Гибрид", engine:"2.0T", manufactureDate:"2022-01-01" });
  // 1500 см³ по 1,7 € против 2000 см³ по 2,7 €: разница больше, чем пропорция объёмов.
  assert.ok(big.customsUsd > small.customsUsd * 1.9);
});

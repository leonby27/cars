import test from "node:test";
import assert from "node:assert/strict";
import { estimateLandedCost, PRICING } from "../src/pricing.js";
import { engineVolume } from "../src/engine-spec.js";

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
  // Пошлина считается от таможенной стоимости — цены плюс доставки до границы ЕАЭС.
  assert.ok(dutied.customsValueUsd > dutied.chinaUsd);
  assert.equal(dutied.customsUsd, Math.round((dutied.customsValueUsd * 0.15 + free.customsUsd) / 50) * 50);
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
  const duty = price.customsValueUsd * 0.15;
  assert.equal(price.customsUsd, Math.round((duty + (price.customsValueUsd + duty) * 0.2 + price.customsFeesUsd) / 50) * 50);
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
  assert.equal(fresh.customsUsd, PRICING.customsFeesUsd.upTo3Years);
  // Сборы у машины старше трёх лет выше: утилизационный сбор вдвое больше.
  assert.equal(old.customsFeesUsd, PRICING.customsFeesUsd.over3Years);
  assert.equal(old.customsUsd, Math.round((old.customsValueUsd * 0.2 + old.customsFeesUsd) / 50) * 50);
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

test("charges a petrol car by engine size and age, without the electric quota story", () => {
  const car = { chinaPrice:100000, usdPrice:20000, source:"Che168", type:"ДВС", engine:"2.0T 245HP L4", manufactureDate:"2021-03-01", year:2021 };
  const price = estimateLandedCost(car, { quotaOver:true });
  assert.equal(price.seriesHybrid, false);
  assert.match(price.customsNote, /Пошлина по объёму · 2 л/);
  assert.equal(price.customsAlert, null);
  // Ставка за см³ у машины старше пяти лет: 2000 см³ по 4,8 € плюс сборы.
  const eurUsd = PRICING.eurByn / PRICING.usdByn;
  assert.equal(price.customsUsd, Math.round((2000 * 4.8 * eurUsd + PRICING.customsFeesUsd.over3Years) / 50) * 50);
  // Подсказка про квоту и НДС относится к электромобилю и на бензиновой карточке
  // появляться не должна.
  assert.doesNotMatch(price.customsHint, /квота|НДС/);
  assert.match(price.customsHint, /больше пяти лет/);
});

test("reads a two-decimal engine size the same way the catalog filter does", () => {
  const base = { chinaPrice:100000, usdPrice:20000, source:"Che168", type:"ДВС", manufactureDate:"2022-06-01", year:2022 };
  // «1.33T» у Mercedes A, CLA, GLA и GLB прежний разбор читал как три литра.
  const small = estimateLandedCost({ ...base, engine:"1.33T 163HP L4" });
  const three = estimateLandedCost({ ...base, engine:"3.0T 340HP L6" });
  assert.equal(engineVolume({ engine:"1.33T 163HP L4" }), 1.33);
  assert.match(small.customsNote, /1,33 л/);
  assert.ok(small.customsUsd < three.customsUsd / 3);
  // «6.75T» Bentley прежний разбор читал как пять литров.
  const bentley = estimateLandedCost({ ...base, engine:"6.75T 537HP V8" });
  assert.match(bentley.customsNote, /6,75 л/);
  assert.ok(bentley.customsUsd > estimateLandedCost({ ...base, engine:"5.0T" }).customsUsd);
});

test("warns when the engine size is missing instead of quietly assuming 1.5 l", () => {
  const price = estimateLandedCost({ chinaPrice:100000, usdPrice:20000, source:"Che168", type:"ДВС", manufactureDate:"2022-06-01", year:2022 });
  assert.match(price.customsNote, /1,5 л \(оценка\)/);
  assert.match(price.customsAlert, /Объём двигателя не указан/);
  assert.equal(price.customsAlertTone, "warn");
});

test("keeps a petrol car out of the import VAT rule for electric cars", () => {
  const eurUsd = PRICING.eurByn / PRICING.usdByn;
  const price = estimateLandedCost({ chinaPrice:100000, usdPrice:20000, source:"Che168", type:"ДВС", engine:"1.5T", manufactureDate:"2019-03-01", year:2019 });
  // Единая ставка для физлиц уже включает налоги: НДС сверху не добавляется.
  assert.equal(price.customsUsd, Math.round((1500 * 3.2 * eurUsd + PRICING.customsFeesUsd.over3Years) / 50) * 50);
});

test("counts the age at the expected clearance date, not at today", () => {
  // Дата курса — 25.08.2026, машина приезжает через два месяца. Машина выпуска
  // октября 2021 года к оформлению ровно пятилетняя и проходит по выгодной ставке,
  // а машина сентября порог уже перешла — ставка вдвое выше. На сегодняшнюю дату
  // обе выглядели бы младше пяти лет, и цена сентябрьской была бы обещанием,
  // которого к оформлению уже не выполнить.
  const base = { chinaPrice:100000, usdPrice:20000, source:"Che168", type:"ДВС", engine:"2.0T", year:2021 };
  const beforeEdge = estimateLandedCost({ ...base, manufactureDate:"2021-10-01" });
  const pastEdge = estimateLandedCost({ ...base, manufactureDate:"2021-09-01" });
  assert.ok(beforeEdge.ageYears <= 5 && pastEdge.ageYears > 5);
  assert.ok(pastEdge.customsUsd > beforeEdge.customsUsd * 1.7);
});

test("counts delivery to the EAEU border into the customs value", () => {
  const car = { chinaPrice:100000, usdPrice:20000, source:"Che168", type:"Электромобиль", city:"guangzhou", year:2024 };
  const price = estimateLandedCost(car, { quotaOver:true });
  // Стоимость для процентов — цена плюс середина вилки этапа до Хоргоса.
  assert.equal(price.customsValueUsd, price.chinaUsd + (price.chinaLegLow + price.chinaLegHigh) / 2);
  // Ставка за кубический сантиметр от стоимости не зависит: у машины с двигателем
  // от трёх до пяти лет платёж одинаков при любой цене.
  const cheap = estimateLandedCost({ ...car, type:"ДВС", engine:"1.5T", usdPrice:10000, manufactureDate:"2022-06-01" });
  const dear = estimateLandedCost({ ...car, type:"ДВС", engine:"1.5T", usdPrice:40000, manufactureDate:"2022-06-01" });
  assert.equal(cheap.customsUsd, dear.customsUsd);
});

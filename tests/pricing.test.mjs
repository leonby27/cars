import test from "node:test";
import assert from "node:assert/strict";
import { customsPayment, estimateLandedCost, PRICING, CLEARANCE_MONTHS, usdToByn } from "../src/pricing.js";
import { engineVolume } from "../src/engine-spec.js";

test("rounds converted Belarusian-ruble prices to the nearest hundred", () => {
  assert.equal(usdToByn(123449 / PRICING.usdByn), 123400);
  assert.equal(usdToByn(123451 / PRICING.usdByn), 123500);
});

test("если подбор и сопровождение выключены, их нет ни в строке, ни в итоге", () => {
  const originalEnabled = PRICING.serviceFeeEnabled;
  PRICING.serviceFeeEnabled = false;
  try {
    const price = estimateLandedCost({ source:"Che168", usdPrice:10000, year:2024, type:"Электромобиль" }, { quotaOver:false });
    assert.equal(price.serviceUsd, 0);
    const otherCosts = price.chinaUsd + price.buyoutLow + price.chinaLegLow + price.intlLow + price.svhLow + price.customsLow;
    assert.equal(price.totalLow, Math.round(otherCosts / 50) * 50);
  } finally {
    PRICING.serviceFeeEnabled = originalEnabled;
  }
});

test("keeps the service fee at 2000 BYN when exchange rates change", () => {
  const originalRate = PRICING.usdByn;
  const originalEnabled = PRICING.serviceFeeEnabled;
  PRICING.serviceFeeEnabled = true;
  try {
    for (const [rate, expectedUsd] of [[3.026, 660], [3.1, 650], [2.8, 710], [2.5, 800]]) {
      PRICING.usdByn = rate;
      const price = estimateLandedCost({ source:"Che168", usdPrice:10000, year:2024, type:"Электромобиль" }, { quotaOver:false });
      assert.equal(PRICING.serviceByn, 2000);
      assert.equal(price.serviceUsd, expectedUsd);
      assert.equal(usdToByn(price.serviceUsd), 2000);
      const otherCosts = price.chinaUsd + price.buyoutLow + price.chinaLegLow + price.intlLow + price.svhLow + price.customsLow;
      assert.equal(price.totalLow, Math.round((otherCosts + expectedUsd) / 50) * 50);
    }
  } finally {
    PRICING.usdByn = originalRate;
    PRICING.serviceFeeEnabled = originalEnabled;
  }
});

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
  // Пошлина считается от таможенной стоимости, а это цена машины по документам
  // продавца: доставка в неё не входит (статья 267 Таможенного кодекса ЕАЭС).
  assert.equal(dutied.customsValueUsd, dutied.chinaUsd);
  assert.equal(dutied.customsUsd, Math.round((dutied.customsValueUsd * 0.15 + free.customsUsd) / 50) * 50);
  assert.equal(dutied.customsNote, "Пошлина 15% · оформление и сборы");
  assert.equal(dutied.customsAlert, "Без квоты на льготный ввоз");
  assert.ok(dutied.totalUsd > free.totalUsd);
});

test("includes the no-quota duty in the default displayed price", () => {
  const car = { chinaPrice:100000, year:2024, type:"Электромобиль" };
  assert.deepEqual(estimateLandedCost(car), estimateLandedCost(car, { quotaOver:true }));
  assert.ok(estimateLandedCost(car).totalUsd > estimateLandedCost(car, { quotaOver:false }).totalUsd);
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
  // Сборы считаются в рублях по курсу, поэтому в долларах это не круглое число:
  // в строке карточки оно, как и любая другая сумма, округлено до полусотни.
  assert.equal(fresh.customsUsd, Math.round(PRICING.customsFeesUsd.upTo3Years / 50) * 50);
  // Сборы у машины старше трёх лет выше: утилизационный сбор вдвое больше.
  assert.ok(Math.abs(old.customsFeesUsd - PRICING.customsFeesUsd.over3Years) < 1e-9);
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
  // Машина приезжает через два месяца после покупки, и возраст для пошлины считается
  // на день оформления. Даты берём не готовыми, а от нынешней даты курса: она
  // обновляется каждую ночь, и вписанные руками числа ломались бы каждый месяц.
  const [, rateMonth, rateYear] = PRICING.rateDate.split(".").map(Number);
  // На сколько месяцев раньше оформления выпущена машина, в виде «2021-10».
  const madeBefore = (months) => {
    const shift = rateMonth + CLEARANCE_MONTHS - months;
    const year = rateYear + Math.floor((shift - 1) / 12);
    const month = ((((shift - 1) % 12) + 12) % 12) + 1;
    return `${year}-${String(month).padStart(2, "0")}-01`;
  };
  const base = { chinaPrice:100000, usdPrice:20000, source:"Che168", type:"ДВС", engine:"2.0T" };
  // На месяц не дотянула до пяти лет — ставка выгодная; на месяц перешагнула — вдвое выше.
  const beforeEdge = estimateLandedCost({ ...base, manufactureDate: madeBefore(59) });
  const pastEdge = estimateLandedCost({ ...base, manufactureDate: madeBefore(61) });
  assert.ok(beforeEdge.ageYears <= 5, `машина младше пяти лет посчитана как ${beforeEdge.ageYears}`);
  assert.ok(pastEdge.ageYears > 5, `машина старше пяти лет посчитана как ${pastEdge.ageYears}`);
  assert.ok(pastEdge.customsUsd > beforeEdge.customsUsd * 1.7);
});

test("keeps delivery out of the customs value", () => {
  const car = { chinaPrice:100000, usdPrice:20000, source:"Che168", type:"Электромобиль", city:"guangzhou", year:2024 };
  const price = estimateLandedCost(car, { quotaOver:true });
  // Стоимость для процентов — только цена машины. Расходы на перевозку и страховку
  // в стоимость товара для личного пользования не включаются, поэтому плечо до
  // Хоргоса в ней не участвует, хотя в цене «под ключ» оно есть.
  assert.equal(price.customsValueUsd, price.chinaUsd);
  assert.ok(price.chinaLegLow > 0);
  // Ставка за кубический сантиметр от стоимости не зависит: у машины с двигателем
  // от трёх до пяти лет платёж одинаков при любой цене.
  const cheap = estimateLandedCost({ ...car, type:"ДВС", engine:"1.5T", usdPrice:10000, manufactureDate:"2022-06-01" });
  const dear = estimateLandedCost({ ...car, type:"ДВС", engine:"1.5T", usdPrice:40000, manufactureDate:"2022-06-01" });
  assert.equal(cheap.customsUsd, dear.customsUsd);
});

// ── Таможенный платёж отдельно от доставки ───────────────────────────────────
// Эту же функцию зовёт калькулятор на странице растаможки. Проверяем её на
// примерах, которые можно сверить с чужими калькуляторами и с решением ЕЭК.

const eurUsd = () => PRICING.eurByn / PRICING.usdByn;

test("считает пошлину по объёму для машины от трёх до пяти лет", () => {
  // 3,5 литра, четыре года: ставка 3,6 € за см³ → 12 600 €.
  const payment = customsPayment({ customsValueUsd: 28000, kind: "ice", engineCc: 3500, ageYears: 4 });
  assert.equal(Math.round(payment.dutyUsd / eurUsd()), 12600);
  assert.equal(payment.vatUsd, 0, "у бензиновой машины отдельного НДС нет");
  assert.equal(payment.basis, "volume-3-5");
});

test("у машины моложе трёх лет берёт большее из доли и ставки за объём", () => {
  // 2 литра, два года, 15 000 $: 48% от стоимости меньше, чем 3,5 € за см³.
  const payment = customsPayment({ customsValueUsd: 15000, kind: "ice", engineCc: 2000, ageYears: 2 });
  assert.equal(Math.round(payment.dutyUsd / eurUsd()), 7000);
  assert.equal(payment.basis, "value-or-volume");
});

test("ставка за объём у машины старше пяти лет примерно вдвое выше", () => {
  const young = customsPayment({ customsValueUsd: 20000, kind: "ice", engineCc: 2000, ageYears: 4 });
  const old = customsPayment({ customsValueUsd: 20000, kind: "ice", engineCc: 2000, ageYears: 6 });
  assert.ok(old.dutyUsd > young.dutyUsd * 1.7, "ставка старше пяти лет должна быть заметно выше");
  assert.equal(old.basis, "volume-over-5");
});

test("электромобилю по квоте пошлины нет, без квоты — 15%", () => {
  const withQuota = customsPayment({ customsValueUsd: 20000, kind: "ev", ageYears: 3, quotaOver: false });
  const without = customsPayment({ customsValueUsd: 20000, kind: "ev", ageYears: 3, quotaOver: true });
  assert.equal(withQuota.dutyUsd, 0);
  assert.equal(Math.round(without.dutyUsd), 3000);
  assert.equal(withQuota.vatUsd, 0, "машине моложе пяти лет НДС не начисляется");
});

test("электромобилю старше пяти лет добавляет НДС 20% даже по квоте", () => {
  const payment = customsPayment({ customsValueUsd: 20000, kind: "ev", ageYears: 6, quotaOver: false });
  assert.equal(payment.dutyUsd, 0);
  assert.equal(Math.round(payment.vatUsd), 4000);
});

test("гибриду с генератором считает 15% пошлины и НДС 20% сверху", () => {
  const payment = customsPayment({ customsValueUsd: 20000, kind: "erev", ageYears: 3 });
  assert.equal(Math.round(payment.dutyUsd), 3000);
  assert.equal(Math.round(payment.vatUsd), 4600);
  // Вместе это около 38% от стоимости машины — та цифра, что стоит в текстах.
  assert.ok(Math.abs((payment.dutyUsd + payment.vatUsd) / 20000 - 0.38) < 0.005);
});

test("сборы берутся в рублях по официальным ставкам и зависят от возраста", () => {
  const young = customsPayment({ customsValueUsd: 20000, kind: "ev", ageYears: 2, quotaOver: false });
  const exactlyThree = customsPayment({ customsValueUsd: 20000, kind: "ev", ageYears: 3, quotaOver: false });
  const old = customsPayment({ customsValueUsd: 20000, kind: "ev", ageYears: 4, quotaOver: false });
  assert.equal(Math.round(young.utilUsd * PRICING.usdByn * 100) / 100, PRICING.utilFeeByn.upTo3Years);
  assert.equal(Math.round(exactlyThree.utilUsd * PRICING.usdByn * 100) / 100, PRICING.utilFeeByn.upTo3Years, "ровно три года входят в младшую ставку");
  assert.equal(Math.round(old.utilUsd * PRICING.usdByn * 100) / 100, PRICING.utilFeeByn.over3Years);
  assert.equal(Math.round(young.clearanceUsd * PRICING.usdByn), PRICING.clearanceFeeByn);
});

test("ровно трёхлетней машине применяет ступень до трёх лет включительно", () => {
  const payment = customsPayment({ customsValueUsd: 20000, kind: "ice", engineCc: 1500, ageYears: 3 });
  assert.equal(payment.basis, "value-or-volume");
});

test("в цене под ключ таможенные платежи и сборы складываются ровно один раз", () => {
  for (const car of [
    { source:"Che168", usdPrice:20000, year:2024, type:"Электромобиль" },
    { source:"Che168", usdPrice:20000, year:2024, type:"Гибрид", sourceFuelType:"Range Extender" },
    { source:"Che168", usdPrice:20000, year:2022, type:"ДВС", engine:"1.5T", manufactureDate:"2022-06-01" },
  ]) {
    const price = estimateLandedCost(car, { quotaOver:true });
    const lowerComponents = price.chinaUsd + price.buyoutLow + price.chinaLegLow + price.intlLow
      + price.svhLow + price.customsLow + price.serviceUsd;
    assert.equal(price.totalLow, Math.round(lowerComponents / 50) * 50);
    assert.equal(price.customsFeesUsd, price.utilUsd + price.clearanceUsd);
    assert.match(price.customsIncludedText, /утильсбор/);
    assert.match(price.customsIncludedText, /Повторно в итог они не добавляются/);
  }
});

test("возмещение по указу № 140 снимает половину пошлины и налога, но не сборов", () => {
  const full = customsPayment({ customsValueUsd: 20000, kind: "erev", ageYears: 3 });
  const half = customsPayment({ customsValueUsd: 20000, kind: "erev", ageYears: 3, refund50: true });
  assert.equal(Math.round(half.refundUsd), Math.round((full.dutyUsd + full.vatUsd) / 2));
  assert.equal(half.utilUsd, full.utilUsd, "утилизационный сбор не возмещается");
  assert.equal(half.clearanceUsd, full.clearanceUsd, "таможенный сбор не возмещается");
});

test("итог в рублях складывается из строк, а не из округлённого долларового итога", () => {
  const payment = customsPayment({ customsValueUsd: 17300, kind: "ice", engineCc: 1600, ageYears: 4 });
  const sum = payment.dutyUsd + payment.vatUsd + payment.utilUsd + payment.clearanceUsd - payment.refundUsd;
  assert.equal(payment.totalExactUsd, sum);
  assert.equal(payment.totalUsd, Math.round(sum / 50) * 50);
});

test("страна ввоза на таможенный платёж не влияет", () => {
  // Тот же расчёт зовут и для машины из Китая, и для любой другой: в него не
  // передаётся ничего, что зависело бы от страны.
  const a = customsPayment({ customsValueUsd: 20000, kind: "ice", engineCc: 1500, ageYears: 4 });
  const b = customsPayment({ customsValueUsd: 20000, kind: "ice", engineCc: 1500, ageYears: 4 });
  assert.deepEqual(a, b);
});

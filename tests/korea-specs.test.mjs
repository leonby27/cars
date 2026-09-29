import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autodataSpecGroups, parseBrandModels, parseGenerationModifications, parseModelGenerations, parseModificationPage, parseYears, summarizeModification, translateAutodataValue } from "../scripts/lib/autodata-parser.mjs";
import { applyKoreaSpecs, matchKoreaSpec } from "../scripts/lib/korea-specs.mjs";
import { buildEncarCar } from "../scripts/lib/encar-parser.mjs";
import { enginePower, engineVolume, engineAspiration } from "../src/engine-spec.js";
import { estimateLandedCost } from "../src/pricing.js";

// Страницы auto-data.net от 29.09.2026 (без рекламы и скриптов).
const page = (name) => readFileSync(new URL(`./fixtures/autodata/${name}`, import.meta.url), "utf8");
const { samples } = JSON.parse(readFileSync(new URL("./fixtures/encar-samples.json", import.meta.url)));
const sample = (key) => samples.find((item) => item.key === key);
const usdPerKrw = 2.2349 / 1000 / 3.0276;
const encarCar = (key) => buildEncarCar(sample(key).detail, { id: sample(key).listItem.Id, usdPerKrw });

const modification = (file, meta) => {
  const sections = parseModificationPage(page(file));
  return { ...meta, summary: summarizeModification(sections), sections };
};
// Мини-справочник Hyundai из образцов: Grandeur GN7 с двумя модификациями и IONIQ 5.
const catalog = {
  Hyundai: {
    brand: "Hyundai",
    models: [
      {
        name: "Grandeur/Azera",
        generations: [
          { name: "Hyundai Grandeur/Azera VII (GN7)", from: 2022, to: null, codes: ["GN7"], modifications: [
            modification("mod-grandeur-25.html", { name: "2.5 GDi (198 Hp) Automatic", from: 2022, to: null }),
            modification("mod-grandeur-hybrid.html", { name: "1.6 T-GDi (230 Hp) Hybrid Automatic", from: 2022, to: null }),
            { name: "3.5 GDi V6 (300 Hp) AWD Automatic", from: 2022, to: null, summary: { powertrain: "ДВС", fuel: "Бензин", engineCc: 3470, horsepower: 300, drive: "Полный", lengthMm: 5035, widthMm: 1880, heightMm: 1460, curbWeight: 1700 }, sections: [] },
          ] },
          { name: "Hyundai Grandeur/Azera VI (IG, facelift 2019)", from: 2019, to: 2022, codes: ["IG"], modifications: [
            { name: "2.5 GDi (198 Hp) Automatic", from: 2019, to: 2022, summary: { powertrain: "ДВС", fuel: "Бензин", engineCc: 2497, horsepower: 198, drive: "Передний", lengthMm: 4990, widthMm: 1875, heightMm: 1470, curbWeight: 1600 }, sections: [] },
          ] },
        ],
      },
      { name: "IONIQ 5", generations: [{ name: "IONIQ 5 (facelift 2024)", from: 2024, to: null, codes: [], modifications: [
        modification("mod-ioniq5.html", { name: "XRT 84 kWh (320 Hp) Electric AWD", from: 2024, to: null }),
        { name: "Long Range 84 kWh (229 Hp) Electric RWD", from: 2024, to: null, summary: { powertrain: "Электромобиль", fuel: "Электричество", engineCc: null, horsepower: 229, drive: "Задний", battery: 84, electricRange: 485, lengthMm: 4655, widthMm: 1890, heightMm: 1605, curbWeight: 2015 }, sections: [] },
      ] }] },
    ],
  },
};

test("страницы справочника разбираются: модели, поколения с кодами и годами, модификации", () => {
  const models = parseBrandModels(page("brand-hyundai.html"));
  assert.ok(models.length > 60);
  assert.deepEqual(models.find((model) => model.name === "Grandeur/Azera"), { path: "/en/hyundai-grandeur-azera-model-1488", name: "Grandeur/Azera", from: 1986, to: null });
  const generations = parseModelGenerations(page("model-grandeur.html"));
  assert.equal(generations.length, 10);
  assert.deepEqual(generations[0], { path: "/en/hyundai-grandeur-azera-vii-gn7-generation-9647", name: "Hyundai Grandeur/Azera VII (GN7)", from: 2022, to: null, body: "Sedan", codes: ["GN7"] });
  assert.deepEqual([generations[1].from, generations[1].to, generations[1].codes], [2019, 2022, ["IG"]]);
  const modifications = parseGenerationModifications(page("generation-gn7.html"));
  assert.equal(modifications.length, 5);
  assert.deepEqual(modifications.find((item) => /198hp/.test(item.path)), { path: "/en/hyundai-grandeur-azera-vii-gn7-2.5-gdi-198hp-automatic-49677", name: "2.5 GDi (198 Hp) Automatic", from: 2022, to: null });
  assert.deepEqual(parseYears("2019 - 2022"), { from: 2019, to: 2022 });
  assert.deepEqual(parseYears("2022 - "), { from: 2022, to: null });
});

test("страница модификации: разделы, выжимка и перевод", () => {
  const petrol = summarizeModification(parseModificationPage(page("mod-grandeur-25.html")));
  assert.deepEqual([petrol.powertrain, petrol.fuel, petrol.horsepower, petrol.torqueNm, petrol.engineCc, petrol.drive, petrol.gears, petrol.lengthMm, petrol.widthMm, petrol.heightMm, petrol.curbWeight, petrol.seats, petrol.doors, petrol.tireSizeFront, petrol.tireRim],
    ["ДВС", "Бензин", 198, 248, 2497, "Передний", 8, 5035, 1880, 1460, 1620, 5, 4, "225/55 R18 98W", 18]);
  const hybrid = summarizeModification(parseModificationPage(page("mod-grandeur-hybrid.html")));
  assert.deepEqual([hybrid.powertrain, hybrid.mild, hybrid.horsepower, hybrid.engineCc], ["Гибрид", false, 230, 1598]);
  const ev = summarizeModification(parseModificationPage(page("mod-ioniq5.html")));
  assert.deepEqual([ev.powertrain, ev.horsepower, ev.torqueNm, ev.battery, ev.electricRange, ev.topSpeed, ev.drive], ["Электромобиль", 320, 605, 84, 417, 185, "Полный"]);
  const groups = autodataSpecGroups(parseModificationPage(page("mod-grandeur-25.html")));
  assert.deepEqual(groups.map((group) => group.name), ["Характеристики: Общие сведения", "Характеристики: Динамика и расход", "Характеристики: Двигатель", "Характеристики: Объёмы и масса", "Характеристики: Размеры", "Характеристики: Привод, тормоза, подвеска"]);
  const engine = Object.fromEntries(groups[2].items.map((item) => [item.name, item.value]));
  assert.equal(engine["Мощность двигателя"], "198 л.с. при 6100 об/мин");
  assert.equal(engine["Объём двигателя"], "2497 см³");
  assert.equal(engine["Наддув"], "Атмосферный");
  assert.ok(!groups.some((group) => group.items.some((item) => /Log in/.test(item.value))));
  assert.equal(translateAutodataValue("November, 2022"), "ноябрь 2022");
  assert.equal(translateAutodataValue("8 gears, automatic transmission"), "8-ступ. автомат");
});

test("склейка: код поколения, объём, топливо и привод находят модификацию", () => {
  const grandeur = encarCar("grandeur");
  assert.equal(grandeur.rawSeries, "그랜저 (GN7)");
  const match = matchKoreaSpec(grandeur, catalog);
  assert.equal(match.generation.codes[0], "GN7");
  assert.equal(match.modification.name, "2.5 GDi (198 Hp) Automatic");
  assert.equal(match.exact, true);
  const applied = applyKoreaSpecs(grandeur, catalog);
  assert.deepEqual([applied.horsepower, applied.torqueNm, applied.dimensions, applied.curbWeight, applied.doors, applied.tireRim, applied.engine], [198, 248, "5035x1880x1460", 1620, 4, 18, "2.5L 198HP"]);
  assert.equal(enginePower(applied), 198);
  assert.equal(engineVolume(applied), 2.5);
  assert.equal(engineAspiration(applied), "Атмосферный");
  assert.ok(applied.technicalSpecs.groups.some((group) => group.name === "Характеристики: Двигатель"));
  assert.equal(applied.technicalSpecs.groups[0].items[0].name, "Источник характеристик");
  assert.equal(applied.specSource.exact, true);
  // Пошлина от размеров не меняется, а «большая машина» определяется по длине ≥ 4 950 мм.
  assert.ok(estimateLandedCost(applied).totalUsd >= estimateLandedCost(grandeur).totalUsd);
  // Старое поколение по году: 2021 год без кода → IG facelift.
  const older = { ...grandeur, year: 2021, rawSeries: "그랜저", rawModelGroup: "그랜저" };
  assert.equal(matchKoreaSpec(older, catalog).generation.codes[0], "IG");
  // Электромобиль: слова комплектации («Long Range») выбирают модификацию, батарея и запас хода дописываются.
  const ioniq = encarCar("ioniq5");
  const evMatch = matchKoreaSpec({ ...ioniq, year: 2024 }, catalog);
  assert.equal(evMatch.modification.name, "Long Range 84 kWh (229 Hp) Electric RWD");
  const evApplied = applyKoreaSpecs({ ...ioniq, year: 2024 }, catalog);
  assert.deepEqual([evApplied.horsepower, evApplied.battery, evApplied.electricRange, evApplied.engine, evApplied.drive], [229, 84, 485, "229HP", "Задний"]);
  // Неизвестная модель или марка — запись без изменений.
  assert.equal(matchKoreaSpec({ ...grandeur, model: "Palisade" }, catalog), null);
  assert.equal(applyKoreaSpecs({ ...grandeur, brand: "Kia" }, catalog).horsepower, null);
});

test("несколько кандидатов с разной мощностью: общие цифры берём, мощность — нет", () => {
  const mini = structuredClone(catalog);
  const gn7 = mini.Hyundai.models[0].generations[0];
  gn7.modifications = [
    { name: "3.5 GDi V6 (300 Hp) Automatic", from: 2022, to: null, summary: { powertrain: "ДВС", fuel: "Бензин", engineCc: 3470, horsepower: 300, drive: "Передний", lengthMm: 5035, widthMm: 1880, heightMm: 1460, curbWeight: 1690 }, sections: [] },
    { name: "3.5 GDi V6 (280 Hp) Automatic", from: 2022, to: null, summary: { powertrain: "ДВС", fuel: "Бензин", engineCc: 3470, horsepower: 280, drive: "Передний", lengthMm: 5035, widthMm: 1880, heightMm: 1460, curbWeight: 1700 }, sections: [] },
  ];
  const car = { ...encarCar("grandeur"), engineCc: 3470, engine: "3.5L", rawModel: "3.5 Gasoline 2WD Exclusive", description: "3.5 Gasoline 2WD Exclusive" };
  const match = matchKoreaSpec(car, mini);
  assert.equal(match.exact, false);
  assert.equal(match.candidates.length, 2);
  const applied = applyKoreaSpecs(car, mini);
  assert.equal(applied.horsepower, null);
  assert.equal(applied.curbWeight, null);
  assert.equal(applied.dimensions, "5035x1880x1460");
  assert.equal(applied.engine, "3.5L");
});

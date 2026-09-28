import test from "node:test";
import assert from "node:assert/strict";
import { canonicalImportName } from "../config/import-policy.mjs";
import { guaziModelName, modelSpellingKey } from "../config/guazi-model-names.mjs";

const guazi = (brand, model, powertrain, car = {}) => canonicalImportName(brand, model, powertrain, { ...car, source: "Guazi" });

test("Guazi models land on the Che168 catalog spelling", () => {
  const cases = [
    ["Zeekr", "Zeekr 8X", "Гибрид", "Zeekr", "8X"],
    ["Zeekr", "001FR", "Электромобиль", "Zeekr", "001 FR"],
    ["Li Auto", "ONE", "Гибрид", "Li Auto", "Li ONE"],
    ["Li Auto", "Li Auto i6", "Электромобиль", "Li Auto", "i6"],
    ["Lynk & Co", "Lynk & Co 10 EM-P", "Гибрид", "Lynk & Co", "10 EM-P"],
    ["Lynk & Co", "07", "Гибрид", "Lynk & Co", "07 EM-P"],
    ["Geely", "Geome", "Электромобиль", "Geely", "EX2"],
    ["Geely", "E5", "Электромобиль", "Geely", "EX5"],
    ["Geely", "Emgrand X7 Sport", "ДВС", "Geely", "Boyue"],
    ["Geely", "Monjaro L", "ДВС", "Geely", "Monjaro"],
    ["Haval", "DARGO", "ДВС", "Haval", "Dargo"],
    ["Haval", "H Dog New Energy", "Гибрид", "Haval", "Dargo II PHEV"],
    ["Changan", "CS55PLUS", "ДВС", "Changan", "CS55 PLUS"],
    ["Changan", "CS55PLUS", "Гибрид", "Changan", "CS55 PLUS PHEV"],
    ["Voyah", "VOYAH Light L", "Гибрид", "Voyah", "Passion L"],
    ["Voyah", "Titan", "Гибрид", "Voyah", "Taishan"],
    ["Mazda", "Mazda 3 Axela", "ДВС", "Mazda", "Mazda3"],
    ["Toyota", "YARiS L  Zhi Xiang", "ДВС", "Toyota", "YARiS L Zhi Xiang"],
    ["Toyota", "BZ 3X", "Электромобиль", "Toyota", "bZ3X"],
    ["Volvo", "XC60 New Energy", "Гибрид", "Volvo", "XC60 PHEV"],
    ["AITO", "Zhijie V9", "Гибрид", "Luxeed", "V9"],
    ["Buick", "Buick Zijing E7", "Гибрид", "Buick", "Electra E7"],
  ];
  for (const [brand, model, powertrain, wantBrand, wantModel] of cases) {
    assert.deepEqual(guazi(brand, model, powertrain), { brand: wantBrand, model: wantModel }, `${brand} ${model}`);
  }
});

test("Buick Envision from Guazi splits by body size like Che168", () => {
  assert.equal(guazi("Buick", "Envision", "ДВС", { lengthMm: 4845, widthMm: 1883 }).model, "Envision Plus");
  assert.equal(guazi("Buick", "Envision", "ДВС", { lengthMm: 4641, widthMm: 1883 }).model, "Envision S");
  assert.equal(guazi("Buick", "Envision", "ДВС", { lengthMm: 4694, widthMm: 1839 }).model, "Envision");
  assert.equal(guazi("Buick", "Envision", "ДВС").model, "Envision");
});

test("Guazi renaming is stable when a stored name is read again", () => {
  for (const [brand, model, powertrain] of [["Zeekr", "8X", "Гибрид"], ["Geely", "EX2", "Электромобиль"], ["Haval", "Dargo", "ДВС"], ["Lynk & Co", "07 EM-P", "Гибрид"], ["Buick", "Envision Plus", "ДВС"], ["Voyah", "Passion", "Гибрид"]]) {
    assert.deepEqual(guazi(brand, model, powertrain), { brand, model });
  }
});

test("Guazi aliases do not touch Che168 records", () => {
  assert.deepEqual(canonicalImportName("Buick", "GT", "ДВС"), { brand: "Buick", model: "GT" });
  assert.deepEqual(canonicalImportName("Geely", "L6", "Гибрид"), { brand: "Geely", model: "L6" });
  assert.equal(guaziModelName("MINI", "MINI", "ДВС"), "MINI");
});

test("Che168 leftovers follow the names already chosen for Belarus", () => {
  assert.deepEqual(canonicalImportName("Haval", "Menglong", "ДВС"), { brand: "Haval", model: "Raptor" });
  assert.deepEqual(canonicalImportName("Hyundai", "Fista", "ДВС"), { brand: "Hyundai", model: "Lafesta" });
  assert.deepEqual(canonicalImportName("Jetour", "Dasheng i-DM", "Гибрид"), { brand: "Jetour", model: "Dashing i-DM" });
  assert.deepEqual(canonicalImportName("XPeng", "G01", "Гибрид"), { brand: "XPeng", model: "GX" });
});

test("spelling key ignores case, spaces and dashes", () => {
  assert.equal(modelSpellingKey("CS35PLUS"), modelSpellingKey("CS35 PLUS"));
  assert.equal(modelSpellingKey("Lafa5"), modelSpellingKey("Lafa 5"));
  assert.notEqual(modelSpellingKey("007"), modelSpellingKey("007GT"));
});

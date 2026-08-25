import test from "node:test";
import assert from "node:assert/strict";
import {
  ICE_IMPORT_MIN_YEAR,
  IMPORT_MIN_YEAR,
  IMPORT_BRAND_SLUGS,
  canonicalImportBrand,
  canonicalImportModel,
  importPolicyViolation,
  isAllowedImportBrand,
  isEligibleNewImport,
} from "../config/import-policy.mjs";
import { normalizeChe168Energy } from "../scripts/lib/che168-parser.mjs";

test("normalizes source brand variants used by the import policy", () => {
  assert.equal(canonicalImportBrand("Hima"), "HIMA");
  assert.equal(canonicalImportBrand("Xiaomi Auto"), "Xiaomi");
  assert.equal(canonicalImportBrand("Nio"), "NIO");
  assert.equal(canonicalImportBrand("Lync Co"), "Lynk & Co");
  assert.equal(canonicalImportBrand("ZEEKR"), "Zeekr");
  assert.equal(canonicalImportBrand("XPENG"), "XPeng");
});

test("treats the HIMA marques and Voyah Auto as their policy brands", () => {
  for (const marque of ["AITO Wenjie", "Wenjie", "Zhijie", "Xiangjie", "Zunjie", "Shangjie"]) {
    assert.equal(canonicalImportBrand(marque), "HIMA", marque);
    assert.equal(isAllowedImportBrand(marque), true, marque);
  }
  assert.equal(canonicalImportBrand("Voyah Auto"), "Voyah");
  assert.equal(isAllowedImportBrand("Voyah Auto"), true);
  // Only confirmed alliance marques are folded into HIMA; a similar-looking
  // source name is not evidence of membership.
  assert.equal(isAllowedImportBrand("Shijie"), false);
});

test("allows the Belarus import brands including Leapmotor", () => {
  for (const brand of ["BYD", "Leapmotor", "Tesla", "Mercedes-Benz", "Lynk & Co", "Mazda", "Toyota", "AION", "ORA", "Hongqi"]) {
    assert.equal(isAllowedImportBrand(brand), true, brand);
  }
  assert.equal(isAllowedImportBrand("Haima"), false);
  assert.equal(IMPORT_BRAND_SLUGS.includes("zeekr"), true);
  assert.equal(IMPORT_BRAND_SLUGS.includes("haima"), false);
});

test("accepts 2020+ electric and hybrid cars for future imports", () => {
  assert.equal(IMPORT_MIN_YEAR, 2020);
  assert.equal(isEligibleNewImport({ brand: "Leapmotor", year: 2020, type: "Электромобиль" }), true);
  assert.equal(isEligibleNewImport({ brand: "Li Auto", year: 2024, type: "Гибрид" }), true);
  assert.match(importPolicyViolation({ brand: "Leapmotor", year: 2019, type: "Электромобиль" }), /2020/);
  assert.match(importPolicyViolation({ brand: "Haima", year: 2025, type: "Электромобиль" }), /brand/);
});

test("keeps combustion cars out, including 48V mild hybrids", () => {
  assert.match(importPolicyViolation({ brand: "Toyota", year: 2024, type: "ДВС" }), /electric or hybrid/);
  // A mild hybrid reaches the policy already classified as ДВС by the parser,
  // so the word "hybrid" in the source label never buys it a place.
  assert.equal(normalizeChe168Energy({ fuelname: "Gasoline + 48V Mild Hybrid System" }, []), "ДВС");
  assert.equal(normalizeChe168Energy({ fuelname: "Plug-in Hybrid" }, []), "Гибрид");
  assert.equal(normalizeChe168Energy({ fuelname: "Range Extender" }, []), "Гибрид");
  assert.equal(normalizeChe168Energy({ fuelname: "Pure Electric" }, []), "Электромобиль");
});

test("starts the petrol import a year later than the electric one", () => {
  assert.equal(ICE_IMPORT_MIN_YEAR, 2021);
  // Машина 2020 года к оформлению уже старше пяти лет: ставка за кубический
  // сантиметр вдвое выше, и такую машину в Беларуси не купят.
  assert.match(importPolicyViolation({ brand: "BMW", year: 2020, type: "ДВС" }, { combustion: true }), /2021/);
  assert.equal(isEligibleNewImport({ brand: "BMW", year: 2021, type: "ДВС" }, { combustion: true }), true);
  // Электромобилям и гибридам граница не меняется.
  assert.equal(isEligibleNewImport({ brand: "BYD", year: 2020, type: "Электромобиль" }), true);
  assert.equal(isEligibleNewImport({ brand: "Li Auto", year: 2020, type: "Гибрид" }), true);
});

test("«(Import)» — не отдельная модель", () => {
  // Так источник помечает машины, привезённые в Китай целиком, а не собранные на
  // месте. Модель от этого не меняется, а без склейки одна и та же машина стоит
  // в каталоге двумя строками: у немецких марок так разъехалось больше тысячи
  // объявлений, и обзор модели собирал бы половину наличия.
  assert.equal(canonicalImportModel("Mercedes-Benz", "E-Class (Import)"), "E-Class");
  assert.equal(canonicalImportModel("Mercedes-Benz", "A-Class AMG (Import)"), "A-Class AMG");
  assert.equal(canonicalImportModel("BMW", "X5 (Import)"), "X5");
  assert.equal(canonicalImportModel("Audi", "A6 (Import)"), "A6");
  // Версию с розеткой пометка не съедает: у неё свой обзор и свой расчёт таможни.
  assert.equal(canonicalImportModel("BMW", "X5 New Energy(Imported)"), "X5 New Energy");
  assert.equal(canonicalImportModel("BMW", "5 Series New Energy"), "5 Series New Energy");
});

test("завод в названии модели отбрасывается", () => {
  // Один и тот же CC собирают два совместных предприятия, и источник приклеивает
  // к названию имя завода.
  assert.equal(canonicalImportModel("Volkswagen", "FAW-Volkswagen CC"), "CC");
  assert.equal(canonicalImportModel("Volkswagen", "SAIC-Volkswagen Lavida"), "Lavida");
  assert.equal(canonicalImportModel("Volkswagen", "Golf"), "Golf");
});

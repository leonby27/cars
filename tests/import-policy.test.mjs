import test from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_MIN_YEAR,
  IMPORT_BRAND_SLUGS,
  canonicalImportBrand,
  importPolicyViolation,
  isAllowedImportBrand,
  isEligibleNewImport,
} from "../config/import-policy.mjs";

test("normalizes source brand variants used by the import policy", () => {
  assert.equal(canonicalImportBrand("Hima"), "HIMA");
  assert.equal(canonicalImportBrand("Xiaomi Auto"), "Xiaomi");
  assert.equal(canonicalImportBrand("Nio"), "NIO");
  assert.equal(canonicalImportBrand("Lync Co"), "Lynk & Co");
  assert.equal(canonicalImportBrand("ZEEKR"), "Zeekr");
  assert.equal(canonicalImportBrand("XPENG"), "XPeng");
});

test("allows the Belarus import brands including Leapmotor", () => {
  for (const brand of ["BYD", "Leapmotor", "Tesla", "Mercedes-Benz", "Lynk & Co", "Mazda", "Toyota"]) {
    assert.equal(isAllowedImportBrand(brand), true, brand);
  }
  assert.equal(isAllowedImportBrand("Haima"), false);
  assert.equal(IMPORT_BRAND_SLUGS.includes("zeekr"), true);
  assert.equal(IMPORT_BRAND_SLUGS.includes("haima"), false);
});

test("accepts only 2020+ electric cars for future imports", () => {
  assert.equal(IMPORT_MIN_YEAR, 2020);
  assert.equal(isEligibleNewImport({ brand: "Leapmotor", year: 2020, type: "Электромобиль" }), true);
  assert.match(importPolicyViolation({ brand: "Leapmotor", year: 2019, type: "Электромобиль" }), /2020/);
  assert.match(importPolicyViolation({ brand: "Leapmotor", year: 2025, type: "Гибрид" }), /electric/);
  assert.match(importPolicyViolation({ brand: "Haima", year: 2025, type: "Электромобиль" }), /brand/);
});

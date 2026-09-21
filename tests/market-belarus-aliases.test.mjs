import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const market = JSON.parse(fs.readFileSync(path.join(root, "data", "market-belarus-detailed.json"), "utf8"));

test("рыночная статистика хранит региональные названия под одной моделью", () => {
  assert.equal(market.version, 3);
  assert.ok(market.brands.Geely.Monjaro);
  assert.ok(market.brands.Geely.Coolray);
  assert.ok(market.brands.Geely.Okavango);
  assert.ok(market.brands.Geely.EX5);
  assert.ok(market.brands.Honda["HR-V"]);
  assert.ok(market.brands.Deepal.S07);

  for (const [brand, model] of [
    ["Geely", "Xingyue L"],
    ["Geely", "Binyue"],
    ["Geely", "Haoyue"],
    ["Geely", "Galaxy E5"],
    ["Honda", "Vezel"],
    ["Deepal", "S07 (S7)"],
  ]) assert.equal(market.brands[brand]?.[model], undefined, `${brand} ${model}`);

  assert.deepEqual(market.brands.Geely.Monjaro[2024]["ДВС"].all, {
    count:21,
    min:28000,
    mean:30696,
    median:30990,
    max:33075,
  });
});

test("рыночная статистика унифицирует варианты написания марок", () => {
  for (const legacy of ["Aito", "Nio", "Xpeng", "Shenlan (Deepal)"]) {
    assert.equal(market.brands[legacy], undefined, legacy);
  }
  for (const brand of ["AITO", "NIO", "XPeng", "Deepal"]) assert.ok(market.brands[brand], brand);
});

test("выгрузка сохраняет аудит выполненных склеек", () => {
  const mergeCount = (sourceBrand, sourceModel, brand, model) => market.modelNameMerges
    .filter((row) => row.sourceBrand === sourceBrand && row.sourceModel === sourceModel && row.brand === brand && row.model === model)
    .reduce((total, row) => total + row.count, 0);
  assert.equal(mergeCount("Geely", "Xingyue L", "Geely", "Monjaro"), 136);
  assert.equal(mergeCount("Geely", "Binyue", "Geely", "Coolray"), 7);
  assert.equal(mergeCount("Geely", "Haoyue", "Geely", "Okavango"), 7);
  assert.equal(mergeCount("Geely", "Galaxy E5", "Geely", "EX5"), 14);
  assert.equal(mergeCount("Honda", "Vezel", "Honda", "HR-V"), 1);
});

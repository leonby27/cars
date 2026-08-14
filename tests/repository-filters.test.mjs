import test from "node:test";
import assert from "node:assert/strict";
import { buildCarFilters } from "../server/repository.mjs";

test("parameterizes all catalog filters", () => {
  const params = new URLSearchParams({ type:"Гибрид", brand:"Deepal", model:"S07", yearMin:"2024", mileageMax:"50000", landedMax:"40000" });
  const result = buildCarFilters(params);
  assert.deepEqual(result.values, ["Гибрид", "Deepal", "S07", 2024, 50000, 40000]);
  assert.match(result.where, /v\.model_year>=\$4/);
  assert.match(result.where, /l\.estimated_total_usd<=\$6/);
});

test("ignores selector defaults and invalid numbers", () => {
  const result = buildCarFilters(new URLSearchParams({ type:"Все", brand:"Все марки", yearMin:"nope" }));
  assert.deepEqual(result.values, []);
  assert.equal(result.where, "WHERE l.status='active'");
});

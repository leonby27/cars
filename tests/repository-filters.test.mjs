import test from "node:test";
import assert from "node:assert/strict";
import { buildCarFilters, buildCarOrder } from "../server/repository.mjs";

test("parameterizes all catalog filters", () => {
  const params = new URLSearchParams({ type:"Гибрид", brand:"Deepal", model:"S07", bodyType:"SUV / кроссовер", yearMin:"2024", mileageMax:"50000", landedMax:"40000" });
  const result = buildCarFilters(params);
  assert.deepEqual(result.values, ["Гибрид", "Deepal", "S07", "SUV / кроссовер", 2024, 50000, 40000]);
  assert.match(result.where, /v\.model_year>=\$5/);
  assert.match(result.where, /l\.estimated_total_usd<=\$7/);
});

test("ignores selector defaults and invalid numbers", () => {
  const result = buildCarFilters(new URLSearchParams({ type:"Все", brand:"Все марки", yearMin:"nope" }));
  assert.deepEqual(result.values, []);
  assert.equal(result.where, "WHERE l.status='active'");
});

test("uses only allowlisted catalog sort orders", () => {
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price" })), "l.estimated_total_usd ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price_asc" })), "l.estimated_total_usd ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price_desc" })), "l.estimated_total_usd DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"mileage_asc" })), "l.mileage_km ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"DROP TABLE listings" })), "l.last_checked_at DESC NULLS LAST, l.id");
});

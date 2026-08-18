import test from "node:test";
import assert from "node:assert/strict";
import { buildCarFilters, buildCarOrder, withoutDetailPayload } from "../server/repository.mjs";

test("parameterizes all catalog filters", () => {
  const params = new URLSearchParams({ type:"Гибрид", brand:"Deepal", model:"S07", bodyType:"SUV / кроссовер", drive:"Полный", ownersMax:"2", noClaims:"1", yearMin:"2024", mileageMax:"50000", landedMax:"40000" });
  const result = buildCarFilters(params);
  assert.deepEqual(result.values, ["Гибрид", "Deepal", "S07", "SUV / кроссовер", "Полный", 2, 2024, 50000, 40000]);
  assert.match(result.where, /v\.drivetrain=\$5/);
  assert.match(result.where, /l\.owners<=\$6/);
  assert.match(result.where, /0\\s\*次理赔/);
  assert.match(result.where, /v\.model_year>=\$7/);
  assert.match(result.where, /l\.estimated_total_usd<=\$9/);
});

test("ignores selector defaults and invalid numbers", () => {
  const result = buildCarFilters(new URLSearchParams({ type:"Все", brand:"Все марки", yearMin:"nope", conditionGrade:"DROP TABLE listings" }));
  assert.deepEqual(result.values, []);
  assert.equal(result.where, "WHERE l.status='active'");
});

test("filters by an allowlisted condition grade", () => {
  const result = buildCarFilters(new URLSearchParams({ conditionGrade:"A" }));
  assert.deepEqual(result.values, ["A"]);
  assert.match(result.where, /l\.condition_grade=\$1/);
});

test("uses only allowlisted catalog sort orders", () => {
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price" })), "l.estimated_total_usd ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price_asc" })), "l.estimated_total_usd ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"price_desc" })), "l.estimated_total_usd DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"mileage_asc" })), "l.mileage_km ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"range_desc" })), "COALESCE(v.electric_range_km, v.combined_range_km) DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"newest" })), "NULLIF(l.source_payload->>'sourceListedAt','')::timestamptz DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"year_desc" })), "v.model_year DESC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"year_asc" })), "v.model_year ASC NULLS LAST, l.id");
  assert.equal(buildCarOrder(new URLSearchParams({ sort:"DROP TABLE listings" })), "NULLIF(l.source_payload->>'sourceListedAt','')::timestamptz DESC NULLS LAST, l.id");
});

test("omits heavy technical specifications from catalog summaries", () => {
  const car = { id:"che168-1", title:"Audi Q4 e-tron 2025", technicalSpecs:{ count:65, groups:[{ name:"Body", items:[] }] } };
  assert.deepEqual(withoutDetailPayload(car), { id:"che168-1", title:"Audi Q4 e-tron 2025" });
  assert.equal(car.technicalSpecs.count, 65);
});

import test from "node:test";
import assert from "node:assert/strict";
import { canonicalImportModel, canonicalImportName } from "../config/import-policy.mjs";
import { buildChe168Car } from "../scripts/lib/che168-parser.mjs";
import { normalizeCar, upsertCar, buildCarFilters } from "../server/repository.mjs";
import { priceRating, clearPriceRatingCache } from "../server/price-rating.mjs";
import { modelPageForCar } from "../src/model-pages.js";

const civic = { id:"che168-59183299", brand:"Honda", model:"Civic", year:2023,
  source:"Che168", type:"ДВС", engine:"2.0T 300hp L4", chinaPrice:324100,
  rawSeries:"Civic (Import)", rawModel:"2023 2.0T 420TURBO TYPE R",
  description:"2023 2.0T 420TURBO TYPE R" };

test("Type R has a stable model identity across source spellings and stored listings", () => {
  for (const model of ["Civic Type R", "CIVIC TYPE-R", "Civic TypeR (Import)", "思域 TYPE R"]) {
    assert.equal(canonicalImportModel("Honda", model), "Civic Type R");
  }
  for (const fields of [civic, { ...civic, rawModel:undefined },
    { ...civic, model:"Civic (Import)", rawModel:"2023 2.0T TYPE‑R" }]) {
    const car = normalizeCar(fields);
    assert.equal(car.model, "Civic Type R");
    assert.equal(car.title, "Honda Civic Type R 2023");
    assert.equal(car.id, civic.id);
    assert.equal(car.chinaPrice, civic.chinaPrice);
    assert.deepEqual(normalizeCar(car), car);
    assert.equal(modelPageForCar(car), null, "must not show the ordinary Civic review");
  }
  assert.deepEqual(canonicalImportName("honda", "Civic", "ДВС", civic),
    { brand:"Honda", model:"Civic Type R" });
});

test("engine, import status and cosmetic seller comments do not make a Civic a Type R", () => {
  for (const fields of [
    { model:"Civic", engine:"2.0T 300hp L4" },
    { model:"Civic (Import)", rawModel:"2023 2.0 CVT" },
    { model:"Civic", rawModel:"2023 1.5T Sport", description:"Type R body kit" },
    { model:"Civic", rawModel:"2023 Type RS" },
    { brand:"Acura", model:"Integra", rawModel:"TYPE R" },
  ]) {
    const car = normalizeCar({ brand:"Honda", ...fields });
    assert.notEqual(car.model, "Civic Type R");
  }
});

test("Che168 import separates Type R before saving and refresh cannot merge it back", async () => {
  const detail = { infoid:59183299, brandname:"Honda", seriesname:"Civic (Import)",
    specname:civic.rawModel, price:"45330", mileage:"17000", fuelname:"Gasoline",
    catepiclist:[{ list:["https://img/1.jpg", "https://img/2.jpg"] }] };
  const car = buildChe168Car({ detail, specGroups:[] });
  assert.equal(car.model, "Civic Type R");
  assert.equal(car.title, "Honda Civic Type R 2023");
  const queries = [];
  const client = { query:async (sql, values) => { queries.push({ sql, values }); return { rows:[] }; } };
  // Simulate an older importer / refresh still providing the source's base model.
  const saved = await upsertCar({ ...car, model:"Civic" }, client);
  assert.equal(saved.model, "Civic Type R");
  assert.equal(queries.find((q) => q.sql.startsWith("INSERT INTO vehicles")).values[2], "Civic Type R");
  const listing = queries.find((q) => q.sql.startsWith("INSERT INTO listings"));
  assert.equal(listing.values[4], "Honda Civic Type R 2023");
  assert.equal(JSON.parse(listing.values[17]).model, "Civic Type R");
  assert.equal(buildChe168Car({ detail:{ ...detail, specname:"2023 2.0 CVT" }, specGroups:[] }).model, "Civic");
});

test("catalog filtering and price comparison use the separate model", async () => {
  const filters = buildCarFilters(new URLSearchParams({ brand:"Honda", model:"Civic Type R" }));
  assert.ok(filters.where.includes("v.model=ANY("));
  assert.deepEqual(filters.values[1], ["Civic Type R"]);
  clearPriceRatingCache();
  let selection;
  const db = { query:async (sql, values) => { selection = { sql, values }; return { rows:[] }; } };
  assert.equal(await priceRating(normalizeCar(civic), { db }), null);
  assert.deepEqual(selection.values, ["Honda", "Civic Type R"]);
  assert.ok(selection.sql.includes("v.model = $2"));
  clearPriceRatingCache();
});

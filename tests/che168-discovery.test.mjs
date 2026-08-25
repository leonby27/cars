import test from "node:test";
import assert from "node:assert/strict";
import { discoveryCandidate, listedYear, FUEL_TYPE_POWERTRAIN } from "../scripts/lib/che168-discovery.mjs";

const listItem = (extra = {}) => ({
  infoid: "70001",
  brandname: "BYD",
  seriesname: "Song Plus",
  specname: "2023 EV 605KM Flagship",
  carname: "BYD Song Plus 2023",
  regdate: "2023-04-01",
  price: "18000",
  ...extra,
});

const empty = new Set();

test("подбирает незнакомую машину из электрического фида", () => {
  const found = discoveryCandidate(listItem(), { fuelType: 7, knownIds: empty });
  assert.deepEqual(found, {
    externalId: "70001",
    brand: "BYD",
    year: 2023,
    carname: "BYD Song Plus 2023",
    fuelType: 7,
  });
});

test("машину, которая у нас уже есть, не предлагает", () => {
  const knownIds = new Set(["che168-70001"]);
  assert.equal(discoveryCandidate(listItem(), { fuelType: 7, knownIds }), null);
});

test("проданную машину не предлагает заново: её id остаётся в известных", () => {
  // Снятая с витрины машина иногда ещё мелькает в списках источника. Пополнение
  // читает все наши id, а не только активные, поэтому она не вернётся.
  const knownIds = new Set(["che168-70001"]);
  assert.equal(discoveryCandidate(listItem({ price: "17500" }), { fuelType: 7, knownIds }), null);
});

test("отбраковывает марку вне списка и машину старше границы", () => {
  assert.equal(discoveryCandidate(listItem({ brandname: "Roewe" }), { fuelType: 7, knownIds: empty }), null);
  const old = listItem({ specname: "2019 EV 400KM", carname: "BYD Song Plus 2019", regdate: "2019-06-01" });
  assert.equal(discoveryCandidate(old, { fuelType: 7, knownIds: empty }), null);
});

test("бензиновый список марок действует только в бензиновом фиде", () => {
  const porsche = listItem({ infoid: "70002", brandname: "Porsche", seriesname: "Macan", carname: "Porsche Macan 2022", specname: "2022 2.0T" });
  // В бензиновом фиде Porsche разрешён — он есть в списке марок для ДВС.
  assert.equal(discoveryCandidate(porsche, { fuelType: 1, knownIds: empty })?.brand, "Porsche");
  // В электрическом фиде та же марка не проходит: там свой, короткий список.
  assert.equal(discoveryCandidate(porsche, { fuelType: 7, knownIds: empty }), null);
});

test("вычеркнутые марки не проходят ни в одном фиде", () => {
  for (const brandname of ["Bentley", "Cadillac", "Lincoln", "Acura", "Alfa Romeo", "Citroën", "DS"]) {
    const item = listItem({ infoid: "70003", brandname, specname: "2023 2.0T", carname: `${brandname} 2023` });
    assert.equal(discoveryCandidate(item, { fuelType: 1, knownIds: empty }), null, `${brandname} в бензиновом фиде`);
    assert.equal(discoveryCandidate(item, { fuelType: 7, knownIds: empty }), null, `${brandname} в электрическом фиде`);
  }
});

test("машину дороже потолка не берём уже по цене из списка", () => {
  const pricey = listItem({ infoid: "70004", brandname: "Porsche", specname: "2023 4.0T", carname: "Porsche 911 2023", price: "150000" });
  assert.equal(discoveryCandidate(pricey, { fuelType: 1, knownIds: empty }), null);
  // Цена ниже потолка проходит: пошлину и доставку досчитает карточка.
  const affordable = listItem({ infoid: "70005", brandname: "Porsche", specname: "2023 2.0T", carname: "Porsche Macan 2023", price: "45000" });
  assert.equal(discoveryCandidate(affordable, { fuelType: 1, knownIds: empty })?.brand, "Porsche");
});

test("фид без нашего типа машин пропускается целиком", () => {
  // 2 — дизель, 3 — обычный гибрид: их мы не возим и не обходим.
  assert.equal(discoveryCandidate(listItem(), { fuelType: 2, knownIds: empty }), null);
  assert.equal(discoveryCandidate(listItem(), { fuelType: 3, knownIds: empty }), null);
  assert.deepEqual(Object.keys(FUEL_TYPE_POWERTRAIN).sort(), ["1", "5", "6", "7"]);
});

test("год берёт из названия комплектации, а без него — из даты учёта", () => {
  assert.equal(listedYear({ specname: "2022 EV 500KM", regdate: "2023-01-01" }), 2022);
  assert.equal(listedYear({ specname: "EV 500KM", regdate: "2023-01-01" }), 2023);
  assert.equal(listedYear({ specname: "", regdate: "" }), null);
});

test("карточка без номера объявления не становится кандидатом", () => {
  assert.equal(discoveryCandidate(listItem({ infoid: "" }), { fuelType: 7, knownIds: empty }), null);
  assert.equal(discoveryCandidate(null, { fuelType: 7, knownIds: empty }), null);
});

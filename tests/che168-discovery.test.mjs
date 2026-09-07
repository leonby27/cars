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

test("список марок общий для всех фидов, а бензиновый тип — нет", () => {
  // До 07.09.2026 список бензиновых марок действовал только в бензиновом фиде, и
  // у шестнадцати марок (Changan, Porsche, Volvo, Lexus и других) мы забирали
  // бензин, а их же электромобили и гибриды проходили мимо каталога.
  const porsche = listItem({ infoid: "70002", brandname: "Porsche", seriesname: "Macan", carname: "Porsche Macan 2022", specname: "2022 2.0T" });
  assert.equal(discoveryCandidate(porsche, { fuelType: 1, knownIds: empty })?.brand, "Porsche");
  assert.equal(discoveryCandidate(porsche, { fuelType: 7, knownIds: empty })?.brand, "Porsche");
  // Гибридный фид источника (3) тоже наш: «Hybrid» разбирается в тип «Гибрид».
  const lexus = listItem({ infoid: "70006", brandname: "Lexus", seriesname: "ES", carname: "Lexus ES 2022", specname: "2022 300h" });
  assert.equal(discoveryCandidate(lexus, { fuelType: 3, knownIds: empty })?.brand, "Lexus");
});

test("подмарка Changan Qiyuan заводится как Changan", () => {
  // A05/A06/A07 у источника лежат под отдельной маркой «Changan Qiyuan», и без неё
  // 476 машин не попадали в каталог вообще (проверка 07.09.2026). В Беларуси такой
  // марки не знают: на av.by это Changan с моделями «Qiyuan A05», «Qiyuan A07».
  const qiyuan = listItem({ infoid: "70008", brandname: "Changan Qiyuan", seriesname: "Changan Qiyuan A06", carname: "Changan Qiyuan A06 2025", specname: "2025 510Max" });
  assert.equal(discoveryCandidate(qiyuan, { fuelType: 7, knownIds: empty })?.brand, "Changan");
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
  // Остался только дизель (2): его мы не возим. Обычный гибрид (3) с 07.09.2026
  // наш — «Hybrid» разбирается в тип «Гибрид», который разрешён к ввозу.
  assert.equal(discoveryCandidate(listItem(), { fuelType: 2, knownIds: empty }), null);
  assert.deepEqual(Object.keys(FUEL_TYPE_POWERTRAIN).sort(), ["1", "3", "5", "6", "7"]);
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

test("без известного типа топлива карточка всё равно попадает в находки", () => {
  // Обход одним адресом на марку не знает типа топлива: его больше нет в адресе.
  // Раньше это отвергало все карточки подряд, и новые машины не находились совсем.
  const item = { infoid: "777001", brandname: "BYD", carname: "BYD Song L 2024", regdate: "2024-05", price: "18500" };
  const strict = discoveryCandidate(item, { fuelType: null, knownIds: new Set() });
  assert.equal(strict, null, "со строгой проверкой тип обязателен");
  const relaxed = discoveryCandidate(item, { fuelType: null, knownIds: new Set(), requirePowertrain: false });
  assert.equal(relaxed?.externalId, "777001");
  assert.equal(relaxed?.brand, "BYD");
  assert.equal(relaxed?.fuelType, null, "тип определит карточка при заведении");
  // Потолок цены работает и без типа: заведомо дорогую машину не берём.
  assert.equal(discoveryCandidate({ ...item, price: "150000" }, { fuelType: null, knownIds: new Set(), requirePowertrain: false }), null);
});

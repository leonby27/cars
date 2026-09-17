import test from "node:test";
import assert from "node:assert/strict";
import { buildChe168Car, decodeNextFlightScript, extractChe168DetailPayload, extractChe168ListPayload, normalizeChe168TechnicalSpecs, parseChe168ListJsonLd } from "../scripts/lib/che168-parser.mjs";

const detail = {
  infoid: 59376071,
  brandname: " BMW",
  seriesname: " BMW i3",
  specname: " 2025 eDrive 40 L Shadow Night Sport Package",
  carname: " BMW BMW i3 2025 eDrive 40 L Shadow Night Sport Package",
  regdate: "2024.11",
  mileage: "4500",
  price: "27220",
  fuelname: "Pure Electric",
  drivingmode: "Rear Engine, Rear-Wheel Drive",
  level: "Mid-size car",
  setcount: "5",
  structuredoor: "4",
  structure: "Sedan",
  color: "Black",
  catepiclist: [{ list:["https://img/1.jpg", "https://img/2.jpg"] }],
};
const specs = [{ name:"Battery & Charging", paramitems:[
  { name:"Battery Energy (kWh)", value:"79.05", sublist:[] },
  { name:"CLTC Pure Electric Range (km)", value:"592", sublist:[] },
  { name:"Battery Type", value:"--", sublist:[{ subvalue:"Ternary Lithium Battery" }] },
  { name:"Unavailable", value:"--", sublist:[] },
] }];

test("decodes Next flight payloads and extracts Che168 detail data", () => {
  const encoded = `self.__next_f.push([1,${JSON.stringify(`20:{"ssrCarDetail":${JSON.stringify(detail)},"ssrSpecParam":${JSON.stringify(specs)}}`)}])`;
  assert.match(decodeNextFlightScript(encoded), /ssrCarDetail/);
  assert.deepEqual(extractChe168DetailPayload([encoded]), { detail, specGroups:specs });
});

test("reads an older listing's NEDC range but prefers CLTC when both are given", () => {
  const nedcSpecs = [{ name:"Battery & Charging", paramitems:[
    { name:"Battery Energy (kWh)", value:"60.0", sublist:[] },
    { name:"NEDC Pure Electric Range (km)", value:"468", sublist:[] },
    { name:"Measured range (km)", value:"390", sublist:[] },
  ] }];
  assert.equal(buildChe168Car({ detail, specGroups:nedcSpecs }).electricRange, 468);
  const bothSpecs = [{ name:"Battery & Charging", paramitems:[
    { name:"NEDC Pure Electric Range (km)", value:"468", sublist:[] },
    { name:"CLTC Pure Electric Range (km)", value:"510", sublist:[] },
  ] }];
  assert.equal(buildChe168Car({ detail, specGroups:bothSpecs }).electricRange, 510);
});

test("builds a policy-ready Che168 EV with original gallery and specifications", () => {
  const car = buildChe168Car({ detail, specGroups:specs }, { importedAt:"2026-08-18T00:00:00.000Z" });
  assert.equal(car.id, "che168-59376071");
  assert.equal(car.brand, "BMW");
  assert.equal(car.model, "i3");
  assert.equal(car.year, 2025);
  assert.equal(car.type, "Электромобиль");
  assert.equal(car.drive, "Задний");
  assert.equal(car.battery, 79.05);
  assert.equal(car.electricRange, 592);
  assert.equal(car.images.length, 2);
  assert.equal(car.technicalSpecs.count, 3);
  assert.deepEqual(car.technicalSpecs.groups[0].items[2], { name:"Battery Type", value:"Ternary Lithium Battery" });
});

test("keeps all populated Che168 specification groups without duplicate rows", () => {
  const normalized = normalizeChe168TechnicalSpecs([
    ...specs,
    { name:"Chassis & Steering", paramitems:[
      { name:"Drive Type", value:"Rear-Wheel Drive", sublist:[] },
      { name:"Drive Type", value:"Rear-Wheel Drive", sublist:[] },
    ] },
  ]);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.sourceLocale, "en");
  assert.equal(normalized.count, 4);
  assert.deepEqual(normalized.groups.map((group) => group.name), ["Battery & Charging", "Chassis & Steering"]);
});

test("extracts acceleration, best torque and tire size for catalog filters", () => {
  const filterSpecs = [...specs, { name:"Basic Specifications", paramitems:[
    { name:"Official 0-100km/h acceleration (s)", value:"5.1", sublist:[] },
    { name:"Max Torque (N·m)", value:"430", sublist:[] },
    { name:"Total Motor Torque (N·m)", value:"563", sublist:[] },
  ] }, { name:"Wheels & Brakes", paramitems:[
    { name:"Front Tire Specification", value:"255/50 R20", sublist:[] },
  ] }];
  const car = buildChe168Car({ detail, specGroups:filterSpecs });
  assert.equal(car.acceleration, 5.1);
  assert.equal(car.torqueNm, 563);
  assert.equal(car.tireSizeFront, "255/50 R20");
  assert.equal(car.tireRim, 20);
  const bare = buildChe168Car({ detail, specGroups:specs });
  assert.equal(bare.acceleration, null);
  assert.equal(bare.torqueNm, null);
  assert.equal(bare.tireSizeFront, null);
  assert.equal(bare.tireRim, null);
});

test("rejects hybrids and incomplete galleries through normalized parser output", () => {
  const hybrid = buildChe168Car({ detail:{ ...detail, fuelname:"Plug-in Hybrid" }, specGroups:specs });
  const incomplete = buildChe168Car({ detail:{ ...detail, catepiclist:[{ list:["https://img/1.jpg"] }] }, specGroups:specs });
  assert.equal(hybrid.type, "Гибрид");
  assert.equal(incomplete, null);
});

test("parses Che168 ItemList discovery JSON-LD", () => {
  const item = { "@type":"Car", name:" BMW BMW i3 2025", url:"https://global.che168.com/en/detail/59376071" };
  const json = JSON.stringify({ "@type":"ItemList", itemListElement:[{ item }] });
  assert.deepEqual(parseChe168ListJsonLd(json), [item]);
});

test("extracts the current paginated Che168 server list instead of stale JSON-LD", () => {
  const pageCars = [{ infoid:59372727, carname:" Volkswagen Volkswagen ID.3 2023 Upgraded Pure Intelligence Edition" }];
  const decoded = `20:{"ssrCars":${JSON.stringify(pageCars)},"ssrTotalCount":1033,"ssrPageCount":44,"ssrPageIndex":5}`;
  const encoded = `self.__next_f.push([1,${JSON.stringify(decoded)}])`;
  assert.deepEqual(extractChe168ListPayload([encoded]), {
    items:pageCars,
    totalCount:1033,
    pageCount:44,
    pageIndex:5,
  });
  assert.deepEqual(extractChe168ListPayload([`page prefix ${encoded} page suffix`]), {
    items:pageCars,
    totalCount:1033,
    pageCount:44,
    pageIndex:5,
  });
});

// Источник отдаёт снимки пачками по разделам — кузов снаружи, салон, багажник, —
// а каталог хранит их одним списком. Пока деление терялось, соцсети брали «третий
// кадр» наугад и показывали в ленте руль вместо машины: у одного объявления снаружи
// семь снимков, у другого всего два.
test("запоминает, сколько первых снимков — кузов снаружи", () => {
  const groups = (...counts) => counts.map((count, group) => ({
    list:Array.from({ length:count }, (_, index) => `https://img/g${group}-${index}.jpg`),
  }));
  const built = (catepiclist) => buildChe168Car({ detail:{ ...detail, catepiclist }, specGroups:specs });

  assert.equal(built(groups(4, 9, 2)).exteriorPhotos, 4);
  assert.equal(built(groups(2, 11)).exteriorPhotos, 2);
  // Разделов нет вовсе — снаружи весь список.
  assert.equal(built(groups(6)).exteriorPhotos, 6);
});

test("раздел с кузовом узнаётся по названию, если источник его прислал", () => {
  const car = buildChe168Car({
    detail:{ ...detail, catepiclist:[
      { catename:"外观", list:["https://img/a.jpg", "https://img/b.jpg", "https://img/c.jpg"] },
      { catename:"内饰", list:["https://img/d.jpg"] },
    ] },
    specGroups:specs,
  });
  assert.equal(car.exteriorPhotos, 3);
});

// Повторы источник шлёт часто: один и тот же кадр стоит и в общем списке, и в
// разделе. Число обязано считаться после отсева, иначе оно заедет в салон.
test("повторяющиеся снимки не раздувают число кадров снаружи", () => {
  const car = buildChe168Car({
    detail:{ ...detail, catepiclist:[
      { list:["https://img/1400x0_c42_autohomecar__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA111.jpg", "https://img/600x0_c42_autohomecar__AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA111.jpg"] },
      { list:["https://img/salon.jpg", "https://img/salon2.jpg"] },
    ] },
    specGroups:specs,
  });
  assert.equal(car.images.length, 3);
  assert.equal(car.exteriorPhotos, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ENCAR_MANUFACTURERS, buildEncarCar, encarBodyType, encarCandidate, encarCity, encarDrive, encarFuel, encarHistory,
  encarListQuery, encarListUrl, encarModelGroups, encarPhotos,
} from "../scripts/lib/encar-parser.mjs";
import { EncarClient, EncarGeoBlockedError } from "../scripts/lib/encar-client.mjs";
import { importPolicyViolation, isAllowedImportBrand } from "../config/import-policy.mjs";
import { koreanModelName } from "../config/korean-model-names.mjs";
import { estimateLandedCost, sourceUsdRate } from "../src/pricing.js";
import { fuelType, engineVolume } from "../src/engine-spec.js";
import { listingNumber } from "../src/listing-id.js";
import { normalizeCar, upsertCar } from "../server/repository.mjs";

// Живые ответы площадки от 29.09.2026 (телефоны, номера, текст продавца убраны).
const { samples, facets } = JSON.parse(readFileSync(new URL("./fixtures/encar-samples.json", import.meta.url)));
const sample = (key) => samples.find((item) => item.key === key);
const importedAt = "2026-09-29T00:00:00.000Z";
const usdPerKrw = 2.2349 / 1000 / 3.0276; // курс НБРБ 28.09.2026
const build = (key, extra = {}) => {
  const item = sample(key);
  return buildEncarCar(item.detail, { id: item.listItem.Id, record: item.record, inspection: item.inspection, importedAt, usdPerKrw, ...extra });
};

test("карточки всех типов двигателя разбираются в запись по договору IMPORTER.md", () => {
  const expected = [
    // key, brand, model, year, type, fuel word, engine, cc, drive, body, colour, city
    ["grandeur", "Hyundai", "Grandeur", 2023, "ДВС", "Бензин", "2.5L", 2497, "Передний", "Седан", "Black", "익산"],
    ["santafe_diesel", "Hyundai", "Santa Fe", 2021, "ДВС", "Дизель", "2.2L", 2151, "Передний", "SUV / кроссовер", "White", "부산"],
    ["niro_hybrid", "Kia", "Niro", 2022, "Гибрид", "", "1.6L", 1580, "Не указан", "SUV / кроссовер", "White", "서울"],
    ["ioniq5", "Hyundai", "IONIQ 5", 2022, "Электромобиль", "", null, null, "Не указан", "SUV / кроссовер", "Dark Gray", "서울"],
    ["bmw5", "BMW", "5 Series", 2022, "ДВС", "Бензин", "2.0L", 1998, "Не указан", "Седан", "Silver", "서울"],
    ["tesla", "Tesla", "Model 3", 2024, "Электромобиль", "", null, null, "Полный", "Седан", "Blue", "수원"],
    ["torres", "KGM", "Torres", 2024, "ДВС", "Бензин", "1.5L", 1497, "Передний", "SUV / кроссовер", "White", "용인"],
    ["benz_e", "Mercedes-Benz", "E-Class", 2022, "ДВС", "Дизель", "1.9L", 1950, "Полный", "Седан", "Black", "수원"],
  ];
  for (const [key, brand, model, year, type, fuel, engine, cc, drive, body, colour, city] of expected) {
    const car = build(key);
    assert.ok(car, key);
    assert.deepEqual([car.brand, car.model, car.year, car.type, fuelType(car), car.engine, car.engineCc, car.drive, car.bodyType, car.bodyColor, car.city],
      [brand, model, year, type, fuel, engine, cc, drive, body, colour, city], key);
    assert.equal(car.source, "Encar");
    assert.equal(car.origin, "korea");
    assert.equal(car.id, `encar-${sample(key).listItem.Id}`);
    assert.equal(car.externalId, sample(key).listItem.Id);
    assert.equal(listingNumber(car.id), `kr-${car.externalId}`);
    assert.equal(car.sourceCurrency, "KRW");
    assert.equal(car.sourcePrice, sample(key).detail.advertisement.price * 10_000);
    assert.equal(car.chinaPrice, car.sourcePrice);
    assert.equal(car.usdPrice, Math.round(car.sourcePrice * usdPerKrw));
    assert.equal(car.sourceUrl, `https://fem.encar.com/cars/detail/${car.externalId}`);
    assert.match(car.firstRegistration, /^\d{4}-\d{2}$/);
    assert.equal(car.manufactureDate, car.firstRegistration);
    assert.ok(car.images.length >= 2 && car.images.every((url) => url.startsWith("https://ci.encar.com/carpicture")), key);
    assert.equal(car.image, car.images[0]);
    assert.match(car.sourceListedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
    assert.equal(car.originalLanguage, "ko");
    assert.equal(importPolicyViolation(car), null, key);
    // Нет телефона, госномера и текста продавца.
    assert.equal(car.vehicleNo, undefined);
    assert.equal(car.contact, undefined);
  }
});

test("газ, лизинг и снятые машины не заводятся", () => {
  assert.equal(build("sonata_lpg"), null);
  assert.equal(encarFuel("LPG(일반인 구입)"), null);
  assert.equal(encarFuel("수소"), null);
  assert.equal(encarFuel("가솔린+LPG"), null);
  assert.deepEqual(encarFuel("디젤"), { type: "ДВС", fuel: "Diesel" });
  const sold = structuredClone(sample("grandeur"));
  sold.detail.advertisement.status = "SOLD";
  assert.equal(buildEncarCar(sold.detail, { id: sold.listItem.Id, usdPerKrw }), null);
  const lease = structuredClone(sample("grandeur"));
  lease.detail.advertisement.leaseRentInfo = { type: "LEASE" };
  assert.equal(buildEncarCar(lease.detail, { id: lease.listItem.Id, usdPerKrw }), null);
  const truck = structuredClone(sample("grandeur"));
  truck.detail.spec.bodyName = "화물차";
  assert.equal(buildEncarCar(truck.detail, { id: truck.listItem.Id, usdPerKrw }), null);
  const fewPhotos = structuredClone(sample("grandeur"));
  fewPhotos.detail.photos = fewPhotos.detail.photos.slice(0, 1);
  assert.equal(buildEncarCar(fewPhotos.detail, { id: fewPhotos.listItem.Id, usdPerKrw }), null);
  assert.throws(() => buildEncarCar(sample("grandeur").detail, { id: "1" }), /usdPerKrw/);
  assert.equal(buildEncarCar(null, { usdPerKrw }), null);
});

test("дата выставления — корейское время, снимки кузова идут первыми", () => {
  const car = build("grandeur");
  assert.equal(sample("grandeur").detail.manage.firstAdvertisedDateTime, "2026-09-03T14:07:47");
  assert.equal(car.sourceListedAt, "2026-09-03T05:07:47.000Z");
  const photos = encarPhotos(sample("santafe_diesel").detail);
  const outer = sample("santafe_diesel").detail.photos.filter((photo) => photo.type === "OUTER").length;
  assert.ok(photos.slice(0, outer).every((url, index) => sample("santafe_diesel").detail.photos.find((photo) => url.endsWith(photo.path)).type === "OUTER"), "кузов первыми");
  assert.equal(car.exteriorPhotos, sample("grandeur").detail.photos.filter((photo) => photo.type === "OUTER").length);
});

test("страховая история и осмотр — в короткие поля", () => {
  const santafe = build("santafe_diesel");
  assert.equal(santafe.claims, "Страховых случаев: 7 (по своей вине 4, по чужой 3)");
  assert.equal(santafe.claimsCount, 7);
  assert.equal(santafe.owners, 2);
  assert.equal(santafe.transfers, 1);
  assert.equal(santafe.incident, "Encar: осмотр: без ДТП, мелкий ремонт, владельцев 2");
  const bmw = build("bmw5");
  assert.equal(bmw.claims, "Без страховых случаев");
  assert.equal(bmw.claimsCount, 0);
  const empty = encarHistory(null, null);
  assert.equal(empty.claims, null);
  assert.equal(empty.owners, null);
  assert.equal(empty.incident, "Отчёт источника может быть неполным");
  const crashed = encarHistory({ accidentCnt: 1, myAccidentCnt: 1, otherAccidentCnt: 0, ownerChangeCnt: 0, totalLossCnt: 1 }, { master: { accdient: true, simpleRepair: false, detail: { waterlog: true } } });
  assert.equal(crashed.incident, "Encar: осмотр: было ДТП, затопление, списание по страховке, владельцев 1");
  assert.equal(crashed.totalLoss, true);
});

test("пошлина корейской машины считается по точному объёму и цене в вонах", () => {
  const car = normalizeCar(build("benz_e"));
  const estimate = estimateLandedCost(car);
  // 1 950 см³ остаются в ступени до 2 300, а не округляются к «1.9L» → 1 900.
  assert.equal(engineVolume(car), 1.9);
  assert.equal(estimate.customsNote, "Пошлина по объёму · 1,95 л");
  assert.ok(estimate.totalUsd > car.usdPrice && estimate.totalUsd < 60_000, String(estimate.totalUsd));
  const ev = normalizeCar(build("tesla"));
  const evEstimate = estimateLandedCost(ev);
  assert.ok(evEstimate.totalUsd > ev.usdPrice, "электромобиль: расчёт от цены в долларах");
  assert.equal(sourceUsdRate("KRW") > 0, true);
});

test("имена моделей склеиваются с каталогом Che168", () => {
  for (const [brand, name, expected] of [
    ["BMW", "5시리즈 (G30)", "5 Series"], ["BMW", "5-Series", "5 Series"], ["BMW", "X5M", "X5 M"],
    ["Mercedes-Benz", "E-클래스", "E-Class"], ["Mercedes-Benz", "GLC-클래스", "GLC"], ["Mercedes-Benz", "GLC-Class", "GLC"],
    ["Hyundai", "Santafe", "Santa Fe"], ["Hyundai", "더 뉴 싼타페", "Santa Fe"], ["Hyundai", "Ioniq5", "IONIQ 5"], ["Hyundai", "그랜저 (GN7)", "Grandeur"],
    ["Kia", "디 올 뉴 니로", "Niro"], ["Kia", "모닝", "Picanto"], ["MINI", "쿠퍼", "MINI"], ["Porsche", "카이엔", "Cayenne"],
    ["Volkswagen", "CC", "Passat CC"], ["Tesla", "모델 Y", "Model Y"], ["Land Rover", "레인지로버 이보크", "Range Rover Evoque"],
    ["BYD", "아토 3", "Yuan PLUS"], ["Audi", "Q4 e-트론", "Q4 e-tron"], ["Genesis", "GV80", "GV80"],
  ]) assert.equal(koreanModelName(brand, name), expected, `${brand} ${name}`);
});

test("марки площадки — только из правил ввоза, Genesis и KGM едут из Кореи", () => {
  for (const brand of Object.keys(ENCAR_MANUFACTURERS)) assert.equal(isAllowedImportBrand(brand, "korea"), true, brand);
  assert.equal(ENCAR_MANUFACTURERS.Chevrolet, undefined);
  assert.equal(ENCAR_MANUFACTURERS.Renault, undefined);
  assert.equal(ENCAR_MANUFACTURERS.Jaguar, undefined);
  assert.equal(isAllowedImportBrand("Genesis", "china"), false);
  assert.equal(build("torres").brand, "KGM");
});

test("привод, кузов и город читаются из имени комплектации и адреса", () => {
  assert.equal(encarDrive("Hyundai", "2.5 Gasoline 2WD"), "Передний");
  assert.equal(encarDrive("Genesis", "3.5 T-GDI 2WD"), "Задний");
  assert.equal(encarDrive("Hyundai", "디젤 2.2 4WD"), "Полный");
  assert.equal(encarDrive("Mercedes-Benz", "E220d 4MATIC Exclusive"), "Полный");
  assert.equal(encarDrive("Tesla", "Long Range AWD"), "Полный");
  assert.equal(encarDrive("BMW", "520i Luxury"), "");
  assert.equal(encarBodyType("그랜저", "대형차"), "Седан");
  assert.equal(encarBodyType("카니발", "RV"), "Минивэн");
  assert.equal(encarBodyType("모닝", "경차"), "Хэтчбек");
  assert.equal(encarBodyType("쏘렌토", "SUV"), "SUV / кроссовер");
  assert.equal(encarBodyType("911", "스포츠카"), "Купе");
  assert.equal(encarCity("부산 사하구"), "부산");
  assert.equal(encarCity("경기 수원시 권선구 권선로 308-5"), "수원");
  assert.equal(encarCity("전북 익산시"), "익산");
  assert.equal(encarCity(""), "");
});

test("фильтр списка, адреса и кандидаты из строки списка", () => {
  assert.equal(encarListQuery({ manufacturer: "현대", modelGroup: "그랜저", yearFrom: 2020, yearTo: 2027, priceMin: 700, priceMax: 13000 }),
    "(And.Hidden.N._.Manufacturer.현대._.ModelGroup.그랜저._.Year.range(202000..202712)._.Price.range(700..13000)._.SellType.일반.)");
  assert.equal(encarListQuery({ manufacturer: "BMW", fuel: "전기", sellType: null }), "(And.Hidden.N._.Manufacturer.BMW._.FuelType.전기.)");
  assert.match(encarListUrl("(And.Hidden.N.)", 500, 500), /count=true&q=\(And\.Hidden\.N\.\)&sr=%7CModifiedDate%7C500%7C500$/);
  assert.match(encarListUrl("(And.Hidden.N.)", 0, 1, { facets: true }), /inav=%7CMetadata%7CSort/);
  const candidate = encarCandidate(sample("grandeur").listItem);
  assert.deepEqual([candidate.externalId, candidate.year, candidate.type, candidate.priceMan, candidate.manufacturer], ["42664100", 2023, "ДВС", 3050, "현대"]);
  assert.equal(encarCandidate(sample("sonata_lpg").listItem).skip, "fuel");
  assert.equal(encarCandidate(sample("lease").listItem).skip, "sellType");
  assert.equal(encarCandidate({ Id: "1", FuelType: "가솔린", FormYear: "2019" }).skip, "year");
  assert.equal(encarCandidate({}), null);
  assert.deepEqual(encarModelGroups(facets).slice(0, 3).map((group) => group.name), ["그랜저", "싼타페", "아반떼"]);
});

test("клиент: 404 на списке — закрытая сеть, 404 на карточке — снятая машина, повторы на 429", async () => {
  const responses = [];
  const fetcher = async (url) => {
    const next = responses.shift() || { status: 200, body: "{}" };
    return { status: next.status, text: async () => next.body };
  };
  const client = new EncarClient({ fetcher, pace: 0 });
  responses.push({ status: 404, body: "<html>has_been_cr_blocked</html>" });
  await assert.rejects(client.list("(And.Hidden.N.)"), EncarGeoBlockedError);
  responses.push({ status: 404, body: "" });
  const gone = await client.vehicle("30000001");
  assert.equal(gone.status, 404);
  assert.equal(gone.detail, null);
  const detail = sample("grandeur").detail;
  responses.push({ status: 429, body: "" }, { status: 200, body: JSON.stringify(detail) }, { status: 200, body: JSON.stringify(sample("grandeur").record) }, { status: 500, body: "" }, { status: 200, body: JSON.stringify(sample("grandeur").inspection) });
  const fetched = await client.car(sample("grandeur").listItem.Id, { usdPerKrw, importedAt });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.car.model, "Grandeur");
  assert.equal(fetched.car.owners, 2);
  assert.equal(client.throttled, 2);
});

test("обход срезов: марка → модельная группа → год, глубже 10 000 делится по годам", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(decodeURIComponent(url));
    const decoded = decodeURIComponent(url);
    if (decoded.includes("inav=")) return { status: 200, text: async () => JSON.stringify(facets) };
    const [, offset] = decoded.match(/\|ModifiedDate\|(\d+)\|/) || [];
    const big = decoded.includes("ModelGroup.그랜저") && !/Year\.range\((\d{4})00\.\.\1(12)\)/.test(decoded);
    const total = big ? 12_000 : 3;
    const rows = Number(offset) >= total ? [] : Array.from({ length: Math.min(500, total - Number(offset)) }, (_, index) => ({ Id: `${offset}-${index}-${decoded.length}`, FuelType: "가솔린", FormYear: "2023", Price: 3000, SellType: "일반", Manufacturer: "현대", Model: "그랜저" }));
    return { status: 200, text: async () => JSON.stringify({ Count: total, SearchResults: rows }) };
  };
  const client = new EncarClient({ fetcher, pace: 0 });
  const seen = [];
  const stats = await client.walk({ brands: ["Hyundai"], yearFrom: 2020, yearTo: 2021, priceMin: 700, priceMax: 13000, onItem: (candidate) => seen.push(candidate.externalId) });
  assert.ok(calls[0].includes("Manufacturer.현대") && calls[0].includes("inav="), "сначала модельные группы");
  assert.ok(calls.some((url) => url.includes("ModelGroup.그랜저._.Year.range(202000..202012)")), "срез Grandeur поделён по годам");
  assert.ok(calls.some((url) => url.includes("ModelGroup.싼타페._.Year.range(202000..202112)")), "остальные срезы целиком");
  assert.ok(stats.slices >= 12 && stats.candidates === seen.length && seen.length > 0);
});

test("запись в базу не теряет вон, курс и историю", async () => {
  const car = build("santafe_diesel");
  const queries = [];
  const client = { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [] }; } };
  const saved = await upsertCar(car, client);
  const listing = queries.find((query) => query.sql.startsWith("INSERT INTO listings"));
  assert.equal(listing.values[1], "Encar");
  assert.equal(listing.values[2], car.externalId);
  assert.equal(listing.values[8], car.sourcePrice, "price_cny хранит воны");
  assert.equal(listing.values[10], 2, "owners");
  assert.equal(listing.values[14], car.claims);
  const stored = JSON.parse(listing.values[17]);
  assert.equal(stored.sourceCurrency, "KRW");
  assert.equal(stored.usdPrice, car.usdPrice);
  assert.equal(stored.claimsCount, 7);
  assert.equal(stored.sourceListedAt, car.sourceListedAt);
  const vehicle = queries.find((query) => query.sql.startsWith("INSERT INTO vehicles"));
  assert.equal(vehicle.values[1], "Hyundai");
  assert.equal(vehicle.values[2], "Santa Fe");
  assert.equal(vehicle.values[4], "ДВС");
  const specs = JSON.parse(vehicle.values[9]);
  assert.equal(specs.fuelType, "Дизель");
  assert.equal(specs.engineVolume, 2.2);
  assert.equal(specs.gearbox, "Автомат");
  assert.equal(specs.bodyType, "SUV / кроссовер");
  assert.deepEqual(queries.find((query) => query.sql.startsWith("INSERT INTO listing_media")).values[1], saved.images);
});

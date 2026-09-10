import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildChe168Car, deriveChe168SpecFields, extractChe168DetailPayload } from "../scripts/lib/che168-parser.mjs";
import { translateTechnicalSpecs, translateSpecValue } from "../src/spec-translations.js";
import { normalizeDrive } from "../src/drive-types.js";
import { engineVolume, enginePower, gearboxType } from "../src/engine-spec.js";
import { upsertCar } from "../server/repository.mjs";

const { payloads } = JSON.parse(readFileSync(new URL("./fixtures/che168-english-specs.json", import.meta.url)));
const russianError = JSON.parse(readFileSync(new URL("./fixtures/che168-russian-drive-error.json", import.meta.url)));
const importedAt = "2026-09-10T12:00:00.000Z";
const options = { importedAt, expectedLocale: "en" };
const expected = [
  [59396664, "ДВС", "Передний", 181, null, null, null, 1350, 1.5, "Робот"],
  [59665828, "ДВС", "Передний", 181, null, null, null, 1340, 1.5, "Робот"],
  [59847455, "Электромобиль", "Задний", 275, 55, 468, null, null, null, ""],
  [59712007, "Электромобиль", "Полный", 325, 76.4, 638, null, 2100, null, ""],
  [59829088, "Гибрид", "Передний", 218, 18.4, 115, null, 1810, 1.5, "Автомат"],
  [59378308, "Гибрид", "Полный", 619, 34.46, 180, 1300, 2280, 1.5, "Автомат"],
  [59857006, "Гибрид", "Полный", 517, 52, 320, 1454, 2670, null, ""],
  [58228037, "ДВС", "Передний", 194, null, null, null, 1526, 1.5, "Вариатор"],
  [58497574, "ДВС", "Задний", 184, null, null, null, null, 1.5, "Автомат"],
];

test("real English responses retain drivetrain, engine, battery and range across powertrains", () => {
  for (const [id, type, drive, horsepower, battery, electricRange, combinedRange, curbWeight, volume, gearbox] of expected) {
    const payload = payloads.find(({ detail }) => detail.infoid === id);
    // Exercise the same Flight extraction used by the network importers.
    const flight = `20:${JSON.stringify({ ssrCarDetail: payload.detail, ssrSpecParam: payload.specGroups })}`;
    const parsed = extractChe168DetailPayload([`[1,${JSON.stringify(flight)}])`]);
    const car = buildChe168Car(parsed, options);
    assert.ok(car, String(id));
    assert.deepEqual([car.type, car.drive, car.horsepower, car.battery, car.electricRange, car.combinedRange, car.curbWeight, engineVolume(car), gearboxType(car)],
      [type, drive, horsepower, battery, electricRange, combinedRange, curbWeight, volume, gearbox], String(id));
    assert.equal(car.originalLanguage, "en");
    assert.equal(car.technicalSpecs.sourceLocale, "en");
    assert.equal(car.sourcePriceUsd, Number(payload.detail.price));
    assert.equal(car.mileage, Number(payload.detail.mileage));
    assert.equal(car.firstRegistration, payload.detail.regdate);
    assert.equal(car.manufactureDate, payload.detail.producedate || payload.detail.manufacturedate || null);
    const driveRow = car.technicalSpecs.groups.flatMap(g => g.items).find(i => i.name === "Drive Type");
    assert.equal(normalizeDrive(driveRow.value), drive, String(id));
  }
});

test("source RU FWD mistranslation is rejected by new importers but legacy sheets remain readable", () => {
  assert.equal(russianError.detail.drivingmode, "Задний привод");
  assert.throws(() => buildChe168Car(russianError, options), { code: "CHE168_LOCALE_MISMATCH" });
  const legacy = buildChe168Car(russianError, { importedAt });
  assert.equal(legacy.technicalSpecs.sourceLocale, "ru");
  const mixed = structuredClone(payloads[0]);
  mixed.detail.drivingmode = "Задний привод";
  assert.throws(() => buildChe168Car(mixed, options), { code: "CHE168_LOCALE_MISMATCH" });
  // Missing/deleted pages and malformed galleries must never become new cars.
  assert.equal(buildChe168Car(null, options), null);
  assert.equal(buildChe168Car({ ...payloads[0], detail: { ...payloads[0].detail, catepiclist: [] } }, options), null);
});

test("all populated source rows survive import and Russian rendering without changing numerical values", () => {
  const properNames = new Set(["Model Name", "Manufacturer", "Engine model", "Valvetrain", "Engine Special Technology",
    "Front Motor Model", "Rear Motor Model", "Front Motor Brand", "Rear Motor Brand", "Battery cell brand", "Battery Special Technology", "Body structure"]);
  for (const payload of payloads) {
    const car = buildChe168Car(payload, options);
    const before = structuredClone(car);
    const raw = payload.specGroups.flatMap(g => g.paramitems).map(i => ({ name: i.name,
      value: i.value && i.value !== "--" ? i.value : i.sublist?.find(s => s.subvalue)?.subvalue,
    })).filter(i => i.value);
    assert.deepEqual(car.technicalSpecs.groups.flatMap(g => g.items), raw);
    const translated = translateTechnicalSpecs(car.technicalSpecs);
    assert.equal(translated.flatMap(g => g.items).length, raw.length);
    translated.forEach((g, groupIndex) => {
      assert.match(g.name, /[А-Яа-я]/, g.name);
      g.items.forEach((item, index) => {
        const source = car.technicalSpecs.groups[groupIndex].items[index];
        assert.match(item.name, /[А-Яа-я]/, source.name);
        if (/^[\d\s.,*/+\-–x×%:]+$/.test(source.value)) assert.equal(item.value, source.value);
        if (!properNames.has(source.name) && /[a-z]{3}/i.test(source.value)) {
          assert.match(item.value, /[А-Яа-я]/, `${payload.detail.infoid}: ${source.name}: ${source.value}`);
        }
      });
    });
    assert.deepEqual(car, before, "rendering must not translate stored parser/price inputs");
  }
});

test("English import reaches storage without losing gallery, price, registration or original specs", async () => {
  for (const payload of payloads) {
    const car = buildChe168Car(payload, options);
    const queries = [];
    const client = { query: async (sql, values) => { queries.push({ sql, values }); return { rows: [] }; } };
    const saved = await upsertCar(car, client);
    const listing = queries.find(q => q.sql.startsWith("INSERT INTO listings"));
    const stored = JSON.parse(listing.values[17]);
    const vehicle = queries.find(q => q.sql.startsWith("INSERT INTO vehicles"));
    assert.equal(vehicle.values[5], car.drive);
    assert.equal(vehicle.values[6], car.battery);
    assert.equal(vehicle.values[7], car.electricRange);
    assert.equal(vehicle.values[8], car.combinedRange);
    assert.equal(JSON.parse(vehicle.values[9]).engineVolume, engineVolume(car));
    assert.equal(JSON.parse(vehicle.values[9]).enginePower, enginePower(car));
    assert.deepEqual(stored.technicalSpecs, car.technicalSpecs);
    assert.equal(stored.chinaPrice, car.chinaPrice);
    assert.equal(stored.firstRegistration, car.firstRegistration);
    assert.deepEqual(saved.images, car.images);
    assert.deepEqual(queries.find(q => q.sql.startsWith("INSERT INTO listing_media")).values[1], car.images);
  }
});

test("missing summary fields use populated specs; WLTC and system power keep their meanings", () => {
  const payload = structuredClone(payloads.find(p => p.detail.infoid === 59378308));
  payload.detail.drivingmode = "--";
  payload.detail.curbweight = "-";
  payload.detail.gearbox = "--";
  payload.detail.dimension = "";
  const car = buildChe168Car(payload, options);
  assert.equal(car.drive, "Полный");
  assert.equal(car.curbWeight, 2280);
  assert.equal(car.dimensions, "5010*1940*1800");
  assert.equal(gearboxType(car), "Автомат");
  const rows = [
    { name: "WLTC Pure Electric Range (km)", value: "--" },
    { name: "WLTC Pure Electric Range (km)", value: "93" },
    { name: "NEDC Pure Electric Range (km)", value: "100" },
    { name: "Maximum horsepower (Ps)", value: "156" },
    { name: "Total Electric Motor Horsepower (Ps)", value: "462" },
    { name: "System Combined Power (Ps)", value: "619" },
  ];
  assert.equal(deriveChe168SpecFields(rows).electricRange, 93);
  assert.equal(deriveChe168SpecFields(rows).horsepower, 619);
  assert.equal(deriveChe168SpecFields([...rows].reverse()).horsepower, 619);
});

test("Russian translation handles source variants while preserving unknown codes and qualifications", () => {
  assert.equal(translateSpecValue(" gasoline "), "Бензин");
  assert.equal(translateSpecValue("Wet Dual-Clutch Transmission (DCT)"), "Роботизированная с мокрыми сцеплениями (DCT)");
  assert.equal(translateSpecValue("3-gear DHT"), "3-ступ. DHT");
  assert.equal(translateSpecValue("9-speed automatic transmission"), "9-ступ. АКПП");
  assert.equal(translateSpecValue("Non-full size"), "Докатка");
  assert.equal(translateSpecValue("3 years with unlimited mileage"), "3 года, без ограничения пробега");
  assert.equal(translateSpecValue("8 years or 160,000 kilometers"), "8 лет или 160 000 км");
  assert.equal(translateSpecValue("Two-Wheel Drive"), "Привод на одну ось");
  assert.equal(translateSpecValue("BHE15-EFZ"), "BHE15-EFZ");
  assert.equal(translateSpecValue("255/50 R20"), "255/50 R20");
  assert.equal(translateSpecValue("GT-Line EAWD", "Model Name"), "GT-Line EAWD");
  assert.equal(translateSpecValue("Tesla China", "Manufacturer"), "Tesla (Китай)");
  assert.equal(translateSpecValue("Kia (Imported)", "Manufacturer"), "Kia (импорт)");
  assert.equal(translateSpecValue("2023 Platinum Edition", "Model Name"), "2023 комплектация Platinum");
  assert.equal(translateSpecValue("Unknown New Technology"), "Unknown New Technology");
  assert.equal(translateSpecValue("8 years for eligible owners only"), "8 years for eligible owners only");
});

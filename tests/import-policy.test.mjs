import test from "node:test";
import assert from "node:assert/strict";
import {
  ICE_IMPORT_MIN_YEAR,
  IMPORT_MIN_YEAR,
  IMPORT_BRAND_SLUGS,
  canonicalImportBrand,
  canonicalImportModel,
  canonicalImportName,
  importPolicyViolation,
  isAllowedImportBrand,
  isEligibleNewImport,
  sourceBrandOf,
  uniquePhotos,
} from "../config/import-policy.mjs";
import { normalizeChe168Energy } from "../scripts/lib/che168-parser.mjs";

test("normalizes source brand variants used by the import policy", () => {
  assert.equal(canonicalImportBrand("Hima"), "AITO");
  assert.equal(canonicalImportBrand("Xiaomi Auto"), "Xiaomi");
  assert.equal(canonicalImportBrand("Nio"), "NIO");
  assert.equal(canonicalImportBrand("Lync Co"), "Lynk & Co");
  assert.equal(canonicalImportBrand("ZEEKR"), "Zeekr");
  assert.equal(canonicalImportBrand("XPENG"), "XPeng");
  assert.equal(canonicalImportBrand("Geely Galaxy"), "Geely");
  assert.equal(IMPORT_BRAND_SLUGS.includes("geely-galaxy"), true);
});

test("марки альянса Huawei разъезжаются по своим маркам, а не в общую HIMA", () => {
  // Раньше все пять сваливались в «HIMA» — имя альянса, которого не знает ни один
  // покупатель. В Беларуси их ищут по отдельности, на av.by есть марка Aito.
  const expected = new Map([
    ["AITO Wenjie", "AITO"],
    ["Wenjie", "AITO"],
    ["Hima", "AITO"],
    ["Zhijie", "Luxeed"],
    ["Xiangjie", "Stelato"],
    ["Zunjie", "Maextro"],
    ["Shangjie", "Shangjie"],
  ]);
  for (const [marque, brand] of expected) {
    assert.equal(canonicalImportBrand(marque), brand, marque);
    assert.equal(isAllowedImportBrand(marque), true, marque);
  }
  assert.equal(canonicalImportBrand("Voyah Auto"), "Voyah");
  assert.equal(isAllowedImportBrand("Voyah Auto"), true);
  // Only confirmed alliance marques are folded in; a similar-looking source name
  // is not evidence of membership.
  assert.equal(isAllowedImportBrand("Shijie"), false);
});

test("модель альянса Huawei уезжает в свою марку вместе с именем", () => {
  const cases = [
    [["HIMA", "M9"], ["AITO", "M9"]],
    [["Wenjie", "问界M7"], ["AITO", "M7"]],
    [["HIMA", "Luxeed R7"], ["Luxeed", "R7"]],
    [["Zhijie", "Zhijie S7"], ["Luxeed", "S7"]],
    [["Xiangjie", "Enjoy World S9"], ["Stelato", "S9"]],
    [["Shangjie", "Shangjie SUV"], ["Shangjie", "H5"]],
    [["Zunjie", "Zunjie MPV"], ["Maextro", "MPV"]],
    // Уже переименованная машина второй раз не переезжает.
    [["Luxeed", "R7"], ["Luxeed", "R7"]],
    [["AITO", "M9"], ["AITO", "M9"]],
  ];
  for (const [[brand, model], [wantBrand, wantModel]] of cases) {
    assert.deepEqual(canonicalImportName(brand, model), { brand: wantBrand, model: wantModel }, `${brand} ${model}`);
  }
});

test("китайское название модели меняется на беларуское", () => {
  const cases = [
    [["Geely", "Xing Rui"], ["Geely", "Preface"]],
    [["Geely", "Binyue"], ["Geely", "Coolray"]],
    [["Geely", "Xingyue L"], ["Geely", "Monjaro"]],
    [["Haval", "Big Dog"], ["Haval", "Dargo"]],
    [["Jetour", "Traveler"], ["Jetour", "T2"]],
    [["Great Wall", "Pao"], ["Great Wall", "Poer"]],
    [["Voyah", "Dreamer"], ["Voyah", "Dream"]],
    [["Chery", "Tiggo 5x"], ["Chery", "Tiggo 4 Pro"]],
    [["Honda", "Haoying"], ["Honda", "Breeze"]],
    [["Mazda", "Atenza"], ["Mazda", "Mazda6"]],
    // 银河E5 продают как Geely EX5 — без приставки Galaxy, поэтому меняется и марка.
    [["Geely Galaxy", "Galaxy E5"], ["Geely", "EX5"]],
    [["Geely Galaxy", "Starry Wish"], ["Geely", "EX2"]],
    [["Geely Galaxy", "Galaxy L7"], ["Geely", "Galaxy L7"]],
    // Сергей оставил эти под китайскими именами: 26.08.2026.
    [["Volkswagen", "Sagitar"], ["Volkswagen", "Sagitar"]],
    [["Volkswagen", "Magotan"], ["Volkswagen", "Magotan"]],
    [["Volkswagen", "Tiguan L"], ["Volkswagen", "Tiguan L"]],
    [["Hyundai", "Beijing Hyundai ix25"], ["Hyundai", "ix25"]],
    // Удлинённые китайские версии сохраняют букву L.
    [["Audi", "A6L New Energy"], ["Audi", "A6L PHEV"]],
    [["Jaguar", "XEL"], ["Jaguar", "XEL"]],
    // Экспортное имя беларуским не считается: на av.by все BYD под китайскими именами.
    [["BYD", "Yuan PLUS"], ["BYD", "Yuan PLUS"]],
    [["BYD", "Seagull"], ["BYD", "Seagull"]],
    [["Ford", "Escape"], ["Ford", "Escape"]],
    [["Kia", "K3"], ["Kia", "K3"]],
  ];
  for (const [[brand, model], [wantBrand, wantModel]] of cases) {
    assert.deepEqual(canonicalImportName(brand, model), { brand: wantBrand, model: wantModel }, `${brand} ${model}`);
  }
});

test("«New Energy» превращается в PHEV, а электромобиль — в EV", () => {
  // Китайское «新能源» покрывает и гибрид, и электромобиль. Где под именем едут только
  // гибриды — PHEV; где только электромобили — EV: назвать электромобиль гибридом
  // на карточке было бы неправдой.
  assert.deepEqual(canonicalImportName("BMW", "5 Series New Energy"), { brand: "BMW", model: "5 Series PHEV" });
  assert.deepEqual(canonicalImportName("Mercedes-Benz", "E-Class New Energy"), { brand: "Mercedes-Benz", model: "E-Class PHEV" });
  assert.deepEqual(canonicalImportName("Mercedes-Benz", "G-Class New Energy"), { brand: "Mercedes-Benz", model: "G-Class EV" });
  assert.deepEqual(canonicalImportName("Volkswagen", "Tharu New Energy"), { brand: "Volkswagen", model: "Tharu EV" });
  // У BYD своё слово для гибрида с розеткой, и оно уже стоит у половины моделей.
  assert.deepEqual(canonicalImportName("BYD", "Song Pro New Energy"), { brand: "BYD", model: "Song Pro DM-i" });
  // А здесь под одним китайским именем едут и гибриды, и электромобили: имя зависит
  // от типа двигателя, потому что рядом в каталоге стоит бензиновый Tang.
  assert.deepEqual(canonicalImportName("BYD", "Tang New Energy", "Гибрид"), { brand: "BYD", model: "Tang DM-i" });
  assert.deepEqual(canonicalImportName("BYD", "Tang New Energy", "Электромобиль"), { brand: "BYD", model: "Tang EV" });
  assert.deepEqual(canonicalImportName("BYD", "Tang", "Гибрид"), { brand: "BYD", model: "Tang DM-i" });
  assert.deepEqual(canonicalImportName("BYD", "Tang", "ДВС"), { brand: "BYD", model: "Tang" });
  assert.deepEqual(canonicalImportName("BYD", "Seal 06 New Energy", "Электромобиль"), { brand: "BYD", model: "Seal 06 EV" });
});

test("allows the Belarus import brands including Leapmotor", () => {
  for (const brand of ["BYD", "Leapmotor", "Tesla", "Mercedes-Benz", "Lynk & Co", "Mazda", "Toyota", "AION", "ORA", "Hongqi"]) {
    assert.equal(isAllowedImportBrand(brand), true, brand);
  }
  assert.equal(isAllowedImportBrand("Haima"), false);
  assert.equal(IMPORT_BRAND_SLUGS.includes("zeekr"), true);
  assert.equal(IMPORT_BRAND_SLUGS.includes("haima"), false);
});

test("accepts 2020+ electric and hybrid cars for future imports", () => {
  assert.equal(IMPORT_MIN_YEAR, 2020);
  assert.equal(isEligibleNewImport({ brand: "Leapmotor", year: 2020, type: "Электромобиль" }), true);
  assert.equal(isEligibleNewImport({ brand: "Li Auto", year: 2024, type: "Гибрид" }), true);
  assert.match(importPolicyViolation({ brand: "Leapmotor", year: 2019, type: "Электромобиль" }), /2020/);
  assert.match(importPolicyViolation({ brand: "Haima", year: 2025, type: "Электромобиль" }), /brand/);
});

test("тип двигателя разбирается, но во ввозе не ограничивает", () => {
  // До 07.09.2026 бензиновая машина проходила только на «бензиновом прогоне».
  // Теперь тип — свойство машины: он решает расчёт растаможки и фильтр в каталоге,
  // а не право попасть в каталог. Отвергается только неразобранный тип.
  assert.equal(importPolicyViolation({ brand: "Toyota", year: 2024, type: "ДВС" }), null);
  assert.match(importPolicyViolation({ brand: "Toyota", year: 2024, type: "" }), /powertrain/);
  // A mild hybrid reaches the policy already classified as ДВС by the parser,
  // so the word "hybrid" in the source label never buys it a place.
  assert.equal(normalizeChe168Energy({ fuelname: "Gasoline + 48V Mild Hybrid System" }, []), "ДВС");
  assert.equal(normalizeChe168Energy({ fuelname: "Plug-in Hybrid" }, []), "Гибрид");
  assert.equal(normalizeChe168Energy({ fuelname: "Range Extender" }, []), "Гибрид");
  assert.equal(normalizeChe168Energy({ fuelname: "Pure Electric" }, []), "Электромобиль");
});

test("starts the petrol import at the same year as the electric one", () => {
  assert.equal(ICE_IMPORT_MIN_YEAR, 2020);
  // Машина 2020 года к оформлению старше пяти лет и приезжает дороже машины
  // 2021 года, но расчёт на карточке показывает это честно — возим и такие.
  assert.equal(isEligibleNewImport({ brand: "BMW", year: 2020, type: "ДВС" }), true);
  assert.match(importPolicyViolation({ brand: "BMW", year: 2019, type: "ДВС" }), /2020/);
  // Электромобилям и гибридам граница не меняется.
  assert.equal(isEligibleNewImport({ brand: "BYD", year: 2020, type: "Электромобиль" }), true);
  assert.equal(isEligibleNewImport({ brand: "Li Auto", year: 2020, type: "Гибрид" }), true);
});

test("экспортные марки Chery уезжают в свои марки, но ищутся в списках Chery", () => {
  // 探索06 и 欧萌达 — модели Chery в Китае, но в Беларуси их знают только как
  // Jaecoo J7 и Omoda C5: на av.by есть обе марки. Источник присылает их под Chery.
  assert.deepEqual(canonicalImportName("Chery", "Tansuo 06", "ДВС"), { brand: "Jaecoo", model: "J7" });
  assert.deepEqual(canonicalImportName("Chery", "Explore 06 C-DM", "Гибрид"), { brand: "Jaecoo", model: "J7 C-DM" });
  assert.deepEqual(canonicalImportName("Chery", "Omoda", "ДВС"), { brand: "Omoda", model: "C5" });
  // Уже переименованная машина второй раз не переезжает.
  assert.deepEqual(canonicalImportName("Jaecoo", "J7", "ДВС"), { brand: "Jaecoo", model: "J7" });
  assert.equal(isAllowedImportBrand("Jaecoo"), true);
  assert.equal(isAllowedImportBrand("Omoda"), true);
  // Главное: у источника таких марок нет. Актуализация обходит его по ЕГО маркам,
  // и без этой подмены машина под именем Jaecoo не попала бы ни в один обход —
  // цена не обновлялась бы, а проданную мы бы не заметили.
  assert.equal(sourceBrandOf("Jaecoo"), "Chery");
  assert.equal(sourceBrandOf("Omoda"), "Chery");
  assert.equal(sourceBrandOf("BYD"), "BYD");
});

test("«(Import)» — не отдельная модель", () => {
  // Так источник помечает машины, привезённые в Китай целиком, а не собранные на
  // месте. Модель от этого не меняется, а без склейки одна и та же машина стоит
  // в каталоге двумя строками: у немецких марок так разъехалось больше тысячи
  // объявлений, и обзор модели собирал бы половину наличия.
  assert.equal(canonicalImportModel("Mercedes-Benz", "E-Class (Import)"), "E-Class");
  assert.equal(canonicalImportModel("Mercedes-Benz", "A-Class AMG (Import)"), "A-Class AMG");
  assert.equal(canonicalImportModel("BMW", "X5 (Import)"), "X5");
  assert.equal(canonicalImportModel("Audi", "A6 (Import)"), "A6");
  // Версию с розеткой пометка не съедает: у неё свой обзор и свой расчёт таможни.
  // Имя при этом сразу становится беларуским — «New Energy» меняется на PHEV.
  assert.equal(canonicalImportModel("BMW", "X5 New Energy(Imported)"), "X5 PHEV");
  assert.equal(canonicalImportModel("BMW", "5 Series New Energy"), "5 Series PHEV");
});

test("завод в названии модели отбрасывается", () => {
  // Один и тот же CC собирают два совместных предприятия, и источник приклеивает
  // к названию имя завода.
  // Заодно имя становится беларуским: на av.by эта машина стоит как Passat CC.
  assert.equal(canonicalImportModel("Volkswagen", "FAW-Volkswagen CC"), "Passat CC");
  assert.equal(canonicalImportModel("Volkswagen", "SAIC-Volkswagen Lavida"), "Lavida");
  assert.equal(canonicalImportModel("Volkswagen", "Golf"), "Golf");
});

test("одна фотография под двумя именами не показывается дважды", () => {
  const photo = (folder, name) => `https://erscglobal2.autoimg.cn/escimg/auto/g33/${folder}/85/5A/1400x0_c42_autohomecar__${name}.jpg.webp`;
  // Настоящая пара из объявления: совпадают только знаки с 17-го по 27-й — в них
  // хранилище кодирует размер и содержимое кадра. Файлы совпали байт в байт.
  const first = photo("M06", "ChxpVmpRxNeAHZbfAAKM7acuCqc337");
  const copy = photo("M03", "ChxpVmpRxNeADjILAAKM7acuCqc181");
  const other = photo("M07", "Chto52nDRGCACT85AAO6OxC_i20103");
  assert.deepEqual(uniquePhotos([first, copy, other]), [first, other]);
  // Разные снимки остаются оба, порядок не меняется.
  assert.deepEqual(uniquePhotos([other, first]), [other, first]);
  // Снимок не из хранилища Che168 сравнивается целым адресом.
  assert.deepEqual(uniquePhotos(["/photo/a.jpg", "/photo/a.jpg", "/photo/b.jpg"]), ["/photo/a.jpg", "/photo/b.jpg"]);
  // Пустые значения и отсутствующий список не роняют галерею.
  assert.deepEqual(uniquePhotos(null), []);
  assert.deepEqual(uniquePhotos([null, first, undefined]), [first]);
});

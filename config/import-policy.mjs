export const IMPORT_MIN_YEAR = 2020;

// Бензиновым машинам граница та же, что и остальным. У машины 2020 года к моменту
// оформления пройден пятилетний порог и ставка за кубический сантиметр вдвое выше,
// поэтому приезжает она дороже машины 2021 года — но расчёт на карточке эту разницу
// показывает честно, и выбор остаётся за покупателем (решение Сергея 25.08.2026).
// Константа отдельная: если бензиновую границу опять поведут вверх, менять здесь.
export const ICE_IMPORT_MIN_YEAR = 2020;

// Нижняя граница года по типу машины: бензиновой — своя, остальным — общая.
export const importMinYear = (type) => (type === "ДВС" ? ICE_IMPORT_MIN_YEAR : IMPORT_MIN_YEAR);

// Electric and hybrid both belong in the catalog; a plain combustion car does
// not. A mild-hybrid petrol car reads as "Gasoline + 48V Mild Hybrid System" at
// the source and must not slip in on the word "hybrid" alone — the parser
// classifies it as `ДВС`, which this list excludes.
export const IMPORTABLE_POWERTRAINS = Object.freeze(["Электромобиль", "Гибрид"]);

// Бензиновый ввоз — отдельный список марок и отдельное разрешение. Каталог
// источника на 181 448 бензиновых машин наполовину состоит из марок, которых в
// Беларуси нет вообще (GAC Trumpchi, Roewe, Baojun, подбренды Dongfeng): такую
// машину здесь не узнают и не купят. В список попали марки, у которых на av.by
// есть хотя бы 20 живых объявлений, — то есть те, что тут реально ездят.
export const ICE_IMPORT_BRANDS = Object.freeze([
  "Volkswagen", "Mercedes-Benz", "BMW", "Audi", "Toyota", "Honda", "Buick", "Porsche",
  "Geely", "Nissan", "Land Rover", "Ford", "Haval", "Changan", "Hyundai",
  "Mazda", "Chevrolet", "Chery", "Volvo", "Lexus", "Kia", "MINI", "Škoda", "MG",
  "Peugeot", "Jaguar", "Jeep", "Jetour", "BYD", "Maserati",
  "Infiniti", "Mitsubishi", "Subaru", "Suzuki", "smart", "Great Wall",
  "Renault", "Chrysler", "GMC", "Fiat",
]);

// Марки, вычеркнутые Сергеем 25.08.2026 после просмотра каталога: американский
// премиум и штучные европейцы, которых в Беларуси не спрашивают. Держим списком,
// а не просто убираем из перечня выше: имена сюда попадают из живых данных
// источника, и без явного запрета марка вернулась бы при следующей правке
// списка. Заведённые машины этих марок из базы удалены.
export const EXCLUDED_BRANDS = Object.freeze([
  "Acura", "Alfa Romeo", "Bentley", "Cadillac", "Citroën", "DS", "Lincoln",
]);

// Потолок итоговой цены. Считается по стоимости «под ключ» в Беларуси, а не по
// цене в Китае: покупателя интересует она. Машину дороже этого у нас не заказывают,
// а карточка занимает место в каталоге, в выдаче и в ночном обходе.
export const MAX_LANDED_USD = 100_000;

// Sources retired from the catalog. Their existing listings stay in the
// database as `unavailable` so orders that already reference them keep
// resolving, but nothing re-imports or re-activates them: `upsertCar` forces
// `status='active'` on conflict, so one accidental run would put the whole
// source back into the catalog. Set `IMPORT_ALLOW_DISABLED_SOURCE=1` to
// override for a deliberate one-off run.
export const DISABLED_IMPORT_SOURCES = Object.freeze(["Guazi"]);

export function isDisabledImportSource(source) {
  return DISABLED_IMPORT_SOURCES.includes(String(source || "").trim());
}

export function assertImportSourceEnabled(source) {
  if (!isDisabledImportSource(source)) return;
  if (process.env.IMPORT_ALLOW_DISABLED_SOURCE === "1") {
    console.warn(`[policy] ${source} is retired; continuing because IMPORT_ALLOW_DISABLED_SOURCE=1`);
    return;
  }
  throw new Error(`${source} is retired from the catalog (config/import-policy.mjs). Re-run with IMPORT_ALLOW_DISABLED_SOURCE=1 if this is intentional.`);
}

// The core brand set. The home page's "Популярные марки" block shows the allowed
// brands minus the ones hidden from the showcase, so the two are not the same
// list: hiding a brand there never stops its import.
export const HOMEPAGE_POPULAR_BRANDS = Object.freeze([
  "BYD",
  "Zeekr",
  "Li Auto",
  "Voyah",
  "Deepal",
  "Geely Galaxy",
  "Dongfeng",
  "Avatr",
  "HIMA",
  "Xiaomi",
  "XPeng",
  "NIO",
  "Denza",
  "BMW",
  "Volkswagen",
  "Audi",
]);

export const EXTRA_IMPORT_BRANDS = Object.freeze([
  "Leapmotor",
  "Tesla",
  "Mercedes-Benz",
  "Lynk & Co",
  "Mazda",
  "Toyota",
  "AION",
  "ORA",
  "Hongqi",
]);

export const IMPORT_BRANDS = Object.freeze([
  ...HOMEPAGE_POPULAR_BRANDS,
  ...EXTRA_IMPORT_BRANDS,
]);

export const IMPORT_BRAND_BY_SLUG = Object.freeze({
  byd: "BYD",
  zeekr: "Zeekr",
  "li-auto": "Li Auto",
  voyah: "Voyah",
  deepal: "Deepal",
  "geely-galaxy": "Geely Galaxy",
  dongfeng: "Dongfeng",
  avatr: "Avatr",
  hima: "HIMA",
  "xiaomi-auto": "Xiaomi",
  xpeng: "XPeng",
  nio: "NIO",
  denza: "Denza",
  bmw: "BMW",
  volkswagen: "Volkswagen",
  audi: "Audi",
  leapmotor: "Leapmotor",
  tesla: "Tesla",
  "mercedes-benz": "Mercedes-Benz",
  "lynk-co": "Lynk & Co",
  mazda: "Mazda",
  toyota: "Toyota",
  aion: "AION",
  ora: "ORA",
  hongqi: "Hongqi",
});

export const IMPORT_BRAND_SLUGS = Object.freeze(Object.keys(IMPORT_BRAND_BY_SLUG));

const BRAND_ALIASES = new Map([
  ["hima", "HIMA"],
  ["aito", "HIMA"],
  // HIMA reaches a source catalogue as its individual marques rather than as
  // the alliance name: Wenjie/AITO, Zhijie, Xiangjie, Zunjie, and Shangjie.
  ["aito wenjie", "HIMA"],
  ["wenjie", "HIMA"],
  ["zhijie", "HIMA"],
  ["xiangjie", "HIMA"],
  ["zunjie", "HIMA"],
  ["shangjie", "HIMA"],
  ["voyah", "Voyah"],
  ["voyah auto", "Voyah"],
  ["xiaomi auto", "Xiaomi"],
  ["xiaomi", "Xiaomi"],
  ["nio", "NIO"],
  ["lynk co", "Lynk & Co"],
  ["lynk & co", "Lynk & Co"],
  ["lync co", "Lynk & Co"],
  ["lync & co", "Lynk & Co"],
  ["mercedes benz", "Mercedes-Benz"],
  ["mercedes-benz", "Mercedes-Benz"],
]);
const allowedBrands = new Set(IMPORT_BRANDS);
const allowedIceBrands = new Set(ICE_IMPORT_BRANDS);
const excludedBrands = new Set(EXCLUDED_BRANDS);
const allowedBrandByLower = new Map([...IMPORT_BRANDS, ...ICE_IMPORT_BRANDS].map((brand) => [brand.toLocaleLowerCase("en-US"), brand]));

export function canonicalImportBrand(value) {
  const brand = String(value || "").trim();
  const normalized = brand.toLocaleLowerCase("en-US");
  return BRAND_ALIASES.get(normalized) || allowedBrandByLower.get(normalized) || brand;
}

// The source's English series names are inconsistent: the same car arrives both
// translated ("Seal") and transliterated ("Hai Bao"), sometimes with a factory
// or sub-brand prefix glued on. Without a canonical form the model filter shows
// one car as two entries, so every name passes through this dictionary — on
// import and on read alike. New source spellings land here as they show up.
const MODEL_PREFIX_STRIPS = new Map([
  ["Deepal", ["Deep Blue", "DeepBlue", "Shenlan", "深蓝"]],
  // Один и тот же CC собирают два совместных предприятия, и источник приклеивает
  // к названию завод: «FAW-Volkswagen CC». Для покупателя это просто CC.
  ["Volkswagen", ["FAW-Volkswagen", "FAW Volkswagen", "SAIC-Volkswagen", "SAIC Volkswagen", "Shanghai Volkswagen"]],
]);

// Пометка «(Import)» у источника значит, что машину привезли в Китай целиком, а не
// собрали на месте. Модель от этого не меняется: «Mercedes-Benz E-Class (Import)» —
// тот же E-Class, только с обычной колёсной базой вместо удлинённой китайской.
// Без склейки одна модель стоит в каталоге двумя строками, фильтр показывает её
// дважды, а обзор собирает половину машин: у Mercedes-Benz, BMW и Audi так
// разъехалось больше тысячи объявлений.
const IMPORT_SUFFIX = /\s*\((?:import|imported)\)\s*$/i;

const MODEL_ALIASES = new Map([
  // BMW splits its M performance trims into separate series; the catalog files
  // them under the base model. XM and i8 have no base model and stay as is.
  ["bmw|m5 new energy", "5 Series New Energy"],
  ["bmw|m760le", "7 Series New Energy"],
  ["bmw|i4 m50", "i4"],
  ["bmw|i5 m60", "i5"],
  ["bmw|i7 m70l", "i7"],
  ["bmw|ix m60", "iX"],
  ["bmw|x5 new energy(imported)", "X5 New Energy"],
  // Hai Bao / Hai Shi are transliterations of Seal / Sealion.
  ["byd|hai bao 05 dm-i", "Seal 05 DM-i"],
  ["byd|hai shi 05 ev", "Sealion 05 EV"],
  ["byd|hai shi 07 dm-i", "Sealion 07 DM-i"],
  ["voyah|taisan", "Taishan"],
  ["voyah|taishan 8", "Taishan"],
  ["hongqi|tian gong 08", "Tiangong 08"],
  // One car built by two joint ventures; GAC later renamed its run "BoZhi 4X".
  ["toyota|faw toyota bz4x", "bZ4X"],
  ["toyota|gac toyota bz4x", "bZ4X"],
  ["toyota|bozhi 4x", "bZ4X"],
  ["toyota|bozhi 3x", "bZ3X"],
  ["toyota|bozhi 7", "bZ7"],
  // "Unique" and "Yuzhong" are the translation and transliteration of the same
  // Chinese family name; VW's export name for it is ID. UNYX.
  ["volkswagen|unique 06", "ID. UNYX 06"],
  ["volkswagen|yuzhong 07", "ID. UNYX 07"],
  ["volkswagen|yuzhong 08", "ID. UNYX 08"],
  // "Li ONE" keeps its prefix — that is the model's actual name.
  ["li auto|li l8", "L8"],
  ["li auto|li xiang l9", "L9"],
  ["li auto|li i8", "i8"],
  ["aion|trumpchi ge3", "GE3"],
  ["dongfeng|zhengzhou nissan z9 ge phev", "Nissan Z9 GE PHEV"],
]);

export function canonicalImportModel(brandValue, modelValue) {
  const brand = canonicalImportBrand(brandValue);
  let model = String(modelValue || "").trim();
  for (const prefix of MODEL_PREFIX_STRIPS.get(brand) || []) {
    const lower = model.toLocaleLowerCase("en-US");
    const prefixLower = prefix.toLocaleLowerCase("en-US");
    if (lower === prefixLower) continue;
    if (lower.startsWith(prefixLower)) {
      const rest = model.slice(prefix.length).trim();
      if (rest) model = rest;
    }
  }
  const withoutImport = model.replace(IMPORT_SUFFIX, "").trim();
  if (withoutImport) model = withoutImport;
  return MODEL_ALIASES.get(`${brand.toLocaleLowerCase("en-US")}|${model.toLocaleLowerCase("en-US")}`) || model;
}

export function isAllowedImportBrand(value, { combustion = false } = {}) {
  const brand = canonicalImportBrand(value);
  if (excludedBrands.has(brand)) return false;
  return allowedBrands.has(brand) || (combustion && allowedIceBrands.has(brand));
}

// Цена «под ключ» выше потолка — отказ. Значение приходит из расчёта (`totalUsd`),
// поэтому проверка живёт отдельной функцией: там, где расчёта ещё нет (слой списка
// у источника), потолок применяют к цене в Китае с запасом.
export function isAbovePriceCeiling(landedUsd) {
  const value = Number(landedUsd);
  return Number.isFinite(value) && value > MAX_LANDED_USD;
}

// `combustion` включает бензиновый ввоз: свой список марок и тип «ДВС». Без него
// правила остаются прежними — электромобиль или гибрид из основного списка, и
// ночной импорт электромобилей не начинает тянуть бензин сам собой.
export function importPolicyViolation(car, { combustion = false } = {}) {
  if (!isAllowedImportBrand(car?.brand, { combustion })) return "brand is outside the Belarus import list";
  const minYear = importMinYear(car?.type);
  if (!Number.isFinite(Number(car?.year)) || Number(car.year) < minYear) return `model year is below ${minYear}`;
  const powertrains = combustion ? [...IMPORTABLE_POWERTRAINS, "ДВС"] : IMPORTABLE_POWERTRAINS;
  if (!powertrains.includes(car?.type)) return combustion ? "unknown powertrain" : "new imports must be electric or hybrid";
  return null;
}

export function isEligibleNewImport(car, options) {
  return importPolicyViolation(car, options) === null;
}

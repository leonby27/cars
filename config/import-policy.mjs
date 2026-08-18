export const IMPORT_MIN_YEAR = 2020;

// Electric and hybrid both belong in the catalog; a plain combustion car does
// not. A mild-hybrid petrol car reads as "Gasoline + 48V Mild Hybrid System" at
// the source and must not slip in on the word "hybrid" alone — the parser
// classifies it as `ДВС`, which this list excludes.
export const IMPORTABLE_POWERTRAINS = Object.freeze(["Электромобиль", "Гибрид"]);

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
const allowedBrandByLower = new Map(IMPORT_BRANDS.map((brand) => [brand.toLocaleLowerCase("en-US"), brand]));

export function canonicalImportBrand(value) {
  const brand = String(value || "").trim();
  const normalized = brand.toLocaleLowerCase("en-US");
  return BRAND_ALIASES.get(normalized) || allowedBrandByLower.get(normalized) || brand;
}

export function isAllowedImportBrand(value) {
  return allowedBrands.has(canonicalImportBrand(value));
}

export function importPolicyViolation(car) {
  if (!isAllowedImportBrand(car?.brand)) return "brand is outside the Belarus import list";
  if (!Number.isFinite(Number(car?.year)) || Number(car.year) < IMPORT_MIN_YEAR) return `model year is below ${IMPORT_MIN_YEAR}`;
  if (!IMPORTABLE_POWERTRAINS.includes(car?.type)) return "new imports must be electric or hybrid";
  return null;
}

export function isEligibleNewImport(car) {
  return importPolicyViolation(car) === null;
}

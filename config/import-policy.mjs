export const IMPORT_MIN_YEAR = 2023;

// This list mirrors the "Популярные марки" block on the home page.
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
]);

export const IMPORT_BRANDS = Object.freeze([
  ...HOMEPAGE_POPULAR_BRANDS,
  ...EXTRA_IMPORT_BRANDS,
]);

const BRAND_ALIASES = new Map([
  ["hima", "HIMA"],
  ["aito", "HIMA"],
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

export function canonicalImportBrand(value) {
  const brand = String(value || "").trim();
  return BRAND_ALIASES.get(brand.toLocaleLowerCase("en-US")) || brand;
}

export function isAllowedImportBrand(value) {
  return allowedBrands.has(canonicalImportBrand(value));
}

export function importPolicyViolation(car) {
  if (!isAllowedImportBrand(car?.brand)) return "brand is outside the Belarus import list";
  if (!Number.isFinite(Number(car?.year)) || Number(car.year) < IMPORT_MIN_YEAR) return `model year is below ${IMPORT_MIN_YEAR}`;
  if (car?.type !== "Электромобиль") return "new imports must be electric";
  return null;
}

export function isEligibleNewImport(car) {
  return importPolicyViolation(car) === null;
}

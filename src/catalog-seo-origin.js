import { CHINA_CATALOG_BRANDS } from "./china-brands.js";
import { originFromParam } from "./origin.js";

const chinaBrands = new Set(CHINA_CATALOG_BRANDS.map((brand) => brand.toLowerCase()));

// Направление для метатегов определяется маркой, а не текущими остатками.
// Явно выбранная страна имеет приоритет. Фильтры каталога здесь не меняются.
export const catalogSeoOrigin = (brand, origin = null) => originFromParam(origin)
  || (chinaBrands.has(String(brand || "").trim().toLowerCase()) ? "china" : null);

export const catalogSeoWording = (text, brand, origin = null) => {
  if (text == null) return text;
  const source = String(text);
  if (catalogSeoOrigin(brand, origin) !== "china") return source;
  return source
    .replace(/Китая\s+и\s+Кореи/g, "Китая")
    .replace(/Китае\s+и\s+Корее/g, "Китае")
    .replace(/([Кк])итайские\s+и\s+корейские/g, "$1итайские")
    .replace(/([Кк])итайских\s+и\s+корейских/g, "$1итайских");
};

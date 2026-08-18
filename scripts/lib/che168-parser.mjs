import { canonicalImportBrand } from "../../config/import-policy.mjs";
import { normalizeDrive } from "./guazi-parser.mjs";

const numeric = (value) => {
  const match = String(value ?? "").replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

function balancedJson(text, marker, open, close) {
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return null;
  const start = text.indexOf(open, markerIndex + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === open) depth += 1;
    else if (char === close && --depth === 0) return text.slice(start, index + 1);
  }
  return null;
}

export function decodeNextFlightScript(script) {
  const text = String(script || "");
  const start = text.indexOf("[1,");
  const end = text.lastIndexOf("])");
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(text.slice(start + 3, end)); }
  catch { return null; }
}

export function parseChe168ListJsonLd(script) {
  try {
    const payload = JSON.parse(String(script || ""));
    if (payload?.["@type"] !== "ItemList") return [];
    return (payload.itemListElement || []).map((entry) => entry?.item).filter((item) => item?.url);
  } catch {
    return [];
  }
}

export function extractChe168ListPayload(scripts) {
  for (const script of scripts || []) {
    const text = String(script || "");
    const marker = ["ssrCars", "ssrCarList"].find((name) => text.includes(name));
    if (!marker) continue;
    let decoded = decodeNextFlightScript(text);
    if (!decoded?.includes(`"${marker}":`)) {
      const markerIndex = text.indexOf(marker);
      const start = text.lastIndexOf("self.__next_f.push([1,", markerIndex);
      const end = text.indexOf("])", markerIndex);
      decoded = start >= 0 && end >= 0 ? decodeNextFlightScript(text.slice(start, end + 2)) : null;
    }
    if (!decoded?.includes(`"${marker}":`)) continue;
    const json = balancedJson(decoded, `"${marker}":`, "[", "]");
    if (!json) continue;
    try {
      const items = JSON.parse(json);
      const value = (name) => Number(decoded.match(new RegExp(`"${name}":(\\d+)`))?.[1]) || null;
      return {
        items: Array.isArray(items) ? items : [],
        totalCount: value("ssrTotalCount"),
        pageCount: value("ssrPageCount"),
        pageIndex: value("ssrPageIndex"),
      };
    } catch {}
  }
  return null;
}

export function extractChe168DetailPayload(scripts) {
  let detail = null;
  let specGroups = [];
  for (const script of scripts || []) {
    const decoded = decodeNextFlightScript(script);
    if (!decoded) continue;
    if (!detail && decoded.includes('"ssrCarDetail":')) {
      const json = balancedJson(decoded, '"ssrCarDetail":', "{", "}");
      if (json) {
        try { detail = JSON.parse(json); } catch {}
      }
    }
    if (!specGroups.length && decoded.includes('"ssrSpecParam":')) {
      const json = balancedJson(decoded, '"ssrSpecParam":', "[", "]");
      if (json) {
        try { specGroups = JSON.parse(json); } catch {}
      }
    }
  }
  return detail ? { detail, specGroups } : null;
}

function flattenedSpecs(groups) {
  return (groups || []).flatMap((group) => (group.paramitems || []).map((item) => ({ ...item, group:group.name })));
}

function actualSpecValue(item) {
  const direct = String(item?.value || "").trim();
  if (direct && direct !== "--") return direct;
  return String(item?.sublist?.find((entry) => entry?.subvalue)?.subvalue || "").trim() || null;
}

export function normalizeChe168TechnicalSpecs(groups) {
  const normalizedGroups = [];
  let count = 0;
  for (const group of groups || []) {
    const seen = new Set();
    const items = [];
    for (const item of group?.paramitems || []) {
      const name = String(item?.name || "").trim();
      const value = actualSpecValue(item);
      if (!name || !value) continue;
      const key = `${name}\u0000${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ name, value });
    }
    if (!items.length) continue;
    normalizedGroups.push({ name:String(group?.name || "Other").trim() || "Other", items });
    count += items.length;
  }
  return {
    schemaVersion: 1,
    sourceLocale: "en",
    count,
    groups: normalizedGroups,
  };
}

function specValue(specs, patterns) {
  const item = specs.find((candidate) => patterns.some((pattern) => pattern.test(candidate.name || "")));
  return actualSpecValue(item);
}

const SOURCE_BRAND_PREFIXES = new Map([
  ["Zeekr", ["ZEEKR", "Zeekr"]],
  ["Xiaomi", ["Xiaomi Auto", "Xiaomi"]],
  ["HIMA", ["AITO", "HIMA"]],
  ["NIO", ["NIO", "Nio"]],
  ["XPeng", ["XPENG", "XPeng"]],
  ["Lynk & Co", ["LYNK&CO", "Lynk & Co", "Lynk Co"]],
]);

function cleanModel(value, brand) {
  let model = String(value || "").trim();
  const prefixes = [...(SOURCE_BRAND_PREFIXES.get(brand) || []), brand]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    model = model.replace(new RegExp(`^${escaped}\\s+`, "i"), "").trim();
  }
  return model;
}

function normalizeChe168Energy(detail, specs) {
  const energy = [detail.fuelname, specValue(specs, [/^Energy Type$/i]), detail.carname, detail.specname].filter(Boolean).join(" ");
  if (/PHEV|plug[- ]in|range extender|hybrid|DM-[ip]|增程|混动/i.test(energy)) return "Гибрид";
  if (/Pure Electric|Battery Electric|BEV/i.test(energy)) return "Электромобиль";
  return "ДВС";
}

export function buildChe168Car(payload, { importedAt = new Date().toISOString(), usdToCny = 7.15 } = {}) {
  const detail = payload?.detail;
  if (!detail?.infoid) return null;
  const specs = flattenedSpecs(payload.specGroups);
  const brand = canonicalImportBrand(detail.brandname);
  const model = cleanModel(detail.seriesname, brand);
  const year = numeric(String(detail.specname || "").match(/\b(20\d{2})\b/)?.[1]
    || String(detail.carname || "").match(/\b(20\d{2})\b/)?.[1]);
  const sourcePriceUsd = numeric(detail.price);
  const mileage = numeric(detail.mileage);
  const images = [...new Set((detail.catepiclist || []).flatMap((category) => category.list || []).filter(Boolean))];
  const type = normalizeChe168Energy(detail, specs);
  if (!brand || !model || !year || !sourcePriceUsd || mileage === null || images.length < 2) return null;

  const battery = numeric(specValue(specs, [/^Battery Energy \(kWh\)$/i, /^Battery Capacity/i]));
  const electricRange = numeric(specValue(specs, [/^CLTC Pure Electric Range/i, /^Pure Electric Range/i]));
  const horsepower = numeric(specValue(specs, [/^Total Electric Motor Horsepower/i, /^Electric Motor \(Ps\)$/i]));
  const sourceUrl = `https://global.che168.com/en/detail/${detail.infoid}`;
  const chinaPrice = Math.round((sourcePriceUsd * usdToCny) / 100) * 100;
  const driveRaw = detail.drivingmode || specValue(specs, [/^Drive Type$/i]);
  const batteryType = specValue(specs, [/^Battery Type$/i]);
  const batteryBrand = specValue(specs, [/^Battery cell brand$/i, /^Battery Brand$/i]);
  const bodyStructure = detail.structure || specValue(specs, [/^Body structure$/i]);
  const technicalSpecs = normalizeChe168TechnicalSpecs(payload.specGroups);

  return {
    id: `che168-${detail.infoid}`,
    externalId: String(detail.infoid),
    source: "Che168",
    sourceUrl,
    sourceMarket: "Che168 Global",
    priceBasis: "Vehicle Price",
    sourcePriceUsd,
    brand,
    model,
    rawBrand: String(detail.brandname || "").trim(),
    rawSeries: String(detail.seriesname || "").trim(),
    rawModel: String(detail.specname || "").trim(),
    year,
    firstRegistration: detail.regdate || null,
    manufactureDate: detail.producedate || detail.manufacturedate || null,
    mileage,
    chinaPrice,
    usdPrice: sourcePriceUsd,
    city: detail.cname || "Китай",
    owners: null,
    transfers: null,
    conditionGrade: null,
    incident: "Отчёт источника может быть неполным",
    description: String(detail.remark || detail.specname || detail.carname || "").trim(),
    title: `${brand} ${model} ${year}`,
    type,
    sourceFuelType: detail.fuelname || null,
    drive: normalizeDrive(driveRaw),
    battery,
    batteryType,
    batteryBrand,
    electricRange,
    range: electricRange,
    horsepower,
    transmission: detail.gearbox || null,
    bodyColor: detail.color || null,
    vehicleClass: detail.level || null,
    bodyStructure,
    seats: numeric(detail.setcount || specValue(specs, [/^Seating capacity$/i])),
    doors: numeric(detail.structuredoor || specValue(specs, [/^Number of doors$/i])),
    dimensions: detail.dimension || null,
    curbWeight: numeric(detail.curbweight),
    technicalSpecs,
    image: images[0],
    images,
    reportCompleteness: "incomplete",
    reportUrl: detail.report_url || null,
    certificationStatus: detail.certification_status ?? null,
    maskedVin: detail.vincode || null,
    status: "Объявление активно",
    statusTone: "green",
    importedAt,
    checkedAt: importedAt,
    sourceId: `CH-${detail.infoid}`,
    originalLanguage: "en",
    priceHistory: [{ at:importedAt, priceCny:chinaPrice }],
  };
}

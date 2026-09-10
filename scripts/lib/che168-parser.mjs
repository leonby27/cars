import { repairVerifiedDrive, driveConflicts } from "../../src/vehicle-spec-integrity.js";
import { canonicalImportBrand, canonicalImportModel } from "../../config/import-policy.mjs";
import { normalizeDrive } from "./guazi-parser.mjs";

const numeric = (value) => {
  // Запятая значит разное на разных версиях сайта источника: по-английски она
  // отделяет тысячи («1,234»), по-русски — дробную часть («73,6»). Отличаем по
  // числу цифр после неё: одна-две — дробь, ровно три — разряд тысяч. Пока
  // запятая просто выбрасывалась, батарея на 73,6 кВт·ч записывалась как 736.
  const text = String(value ?? "").replace(/(\d),(\d{1,2})(?!\d)/, "$1.$2").replaceAll(",", "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
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
  // Determine language from actual labels: legacy RU sheets must remain
  // distinguishable from EN details required for new imports since 2026-09-10.
  const cyrillic = normalizedGroups.some((group) => group.items.some((item) => /[А-Яа-яЁё]/.test(item.name)));
  return {
    schemaVersion: 1,
    sourceLocale: cyrillic ? "ru" : "en",
    count,
    groups: normalizedGroups,
  };
}

function specValue(specs, patterns) {
  // Duplicate parameters can appear in several groups. A placeholder in the
  // summary must not hide a populated row in the engine/battery section.
  for (const item of specs) {
    if (!patterns.some((pattern) => pattern.test(item.name || ""))) continue;
    const value = actualSpecValue(item);
    if (value && !/^[-—–]+$/.test(value)) return value;
  }
  return null;
}

// Характеристики машины лежат в карточке строками «название — значение», и назван
// каждая строка на языке той версии сайта, откуда карточка взята. С 31.08.2026
// сборщик ходил по русской версии (с 10.09 детали снова EN), а искали
// мы по-английски — и у 6 202 машин остались пустыми батарея, запас хода, разгон,
// момент, шины и объём двигателя. Объём вдобавок нужен расчёту пошлины: без него
// растаможку считали по «полтора литра по умолчанию». Поэтому каждое название
// ищется на обоих языках, и разбор вынесен сюда — им же чинятся уже заведённые
// машины (`npm run db:respec`), у которых исходные строки сохранены в записи.
//
// Русские названия взяты из наших же записей, поэтому написаны буква в букву —
// включая «(л,с,)» с запятыми вместо точек и строчные буквы в начале строки.
export function deriveChe168SpecFields(specs) {
  // Ёмкость источник обычно даёт в киловатт-часах, но у части карточек (AION Y и
  // соседи) она указана в ватт-часах: «63983» вместо «64». Больше трёхсот киловатт-
  // часов не бывает даже у грузовиков, поэтому такое число — просто другие единицы.
  const batteryRaw = numeric(specValue(specs, [
    /^Battery Energy \(kWh\)$/i, /^Battery Capacity/i,
    /^Энергия батареи/i, /^[ЁЕ]мкость батареи/i,
  ]));
  const battery = batteryRaw !== null && batteryRaw > 300 ? Math.round(batteryRaw / 100) / 10 : batteryRaw;
  // Машины, зарегистрированные до появления китайского стандарта CLTC, показывают
  // запас хода по NEDC, поэтому стандарты перебираются по убыванию точности —
  // и никогда не смешиваются с собственным замером продавца.
  const electricRange = [
    [/^CLTC Pure Electric Range/i, /^запас хода на электротяге по CLTC/i],
    [/^WLTC Pure Electric Range/i, /^WLTP Pure Electric Range/i, /^Запас хода на электротяге по WLTC/i],
    [/^NEDC Pure Electric Range/i, /^Запас хода на электротяге по NEDC/i],
    [/^Pure Electric Range/i, /^Запас хода на электротяге/i],
  ].reduce((found, patterns) => found ?? numeric(specValue(specs, patterns)), null);
  // Prefer published system power, then electric motors, then the combustion
  // engine. Never add engine and motor ratings or depend on source row order.
  const horsepower = [
    [/^System Combined Power \(Ps\)$/i, /^Совокупная мощность системы \(л[.,]с[.,]\)/i],
    [/^Total Electric Motor Horsepower/i, /^Electric Motor \(Ps\)$/i,
      /^Суммарная мощность электродвигателей \(л[.,]с[.,]\)/i, /^Электродвигатель \(л[.,]с[.,]\)/i],
    [/^Maximum horsepower \(Ps\)$/i, /^максимальная мощность \(л[.,]с[.,]\)/i],
  ].reduce((found, patterns) => found ?? numeric(specValue(specs, patterns)), null);
  const combinedRange = [
    [/^CLTC Combined Range/i, /^Общий запас хода.*CLTC/i],
    [/^WLTC Combined Range/i, /^Общий запас хода.*WLTC/i],
    [/^NEDC Combined Range/i, /^Общий запас хода.*NEDC/i],
  ].reduce((found, patterns) => found ?? numeric(specValue(specs, patterns)), null);
  const acceleration = numeric(specValue(specs, [
    /^Official 0-100km\/h acceleration/i, /^Measured 0-100km\/h acceleration/i,
    /^Официальное ускорение 0-100/i, /^Фактическое ускорение 0-100/i,
  ]));
  // Момент у гибридов и электричек разложен по нескольким строкам (ДВС, моторы,
  // суммарный); в карточку идёт наибольший — он и описывает машину целиком.
  const torqueValues = specs
    .filter((item) => /^(Max Torque|Total Motor Torque|System Combined Torque) \(N·m\)$/i.test(item.name || "")
      || /^(Максимальный крутящий момент|Суммарный крутящий момент электродвигателя|Совокупный крутящий момент системы) \(Н·м\)$/i.test(item.name || ""))
    .map((item) => numeric(actualSpecValue(item)))
    .filter((value) => value !== null);
  const tireSizeFront = specValue(specs, [/^Front Tire Specification$/i, /^спецификация передней шины$/i]);
  // В характеристиках объём стоит строкой вида «1.5T 156HP L4» (по-русски —
  // «2.0L 178 л.с. L4»); у машины с генератором вместо объёма написана мощность,
  // и такую строку расчёт пошлины за объём не примет.
  const engine = specValue(specs, [/^Engine$/i, /^Двигатель$/i]);
  return {
    battery,
    electricRange,
    combinedRange,
    horsepower,
    acceleration,
    torqueNm: torqueValues.length ? Math.max(...torqueValues) : null,
    tireSizeFront,
    tireRim: numeric(String(tireSizeFront || "").match(/R\s*(\d{2})/i)?.[1]),
    engine,
    driveRaw: specValue(specs, [/^Drive Type$/i, /^Тип привода$/i]),
    batteryType: specValue(specs, [/^Battery Type$/i, /^Тип батареи$/i]),
    batteryBrand: specValue(specs, [/^Battery cell brand$/i, /^Battery Brand$/i, /^Марка ячеек батареи$/i]),
    bodyStructure: specValue(specs, [/^Body structure$/i, /^Тип кузова$/i, /^Структура кузова$/i]),
    seats: numeric(specValue(specs, [/^Seating capacity$/i, /^Количество мест/i])),
    doors: numeric(specValue(specs, [/^Number of doors$/i, /^Количество дверей/i])),
    curbWeight: numeric(specValue(specs, [/^Curb weight \(kg\)$/i, /^Снаряж[её]нная масса/i])),
    dimensions: specValue(specs, [/^Length\*Width\*Height \(mm\)$/i, /^Длина.*Ширина.*Высота/i]),
    transmission: specValue(specs, [/^Abbreviation$/i, /^Сокращ[её]нное название$/i, /^Краткое название$/i]),
  };
}

// Те же характеристики, но из уже сохранённой в записи выжимки: там строки лежат
// готовыми парами «название — значение», а не так, как их отдал источник.
export function specsFromTechnicalSpecs(technicalSpecs) {
  return (technicalSpecs?.groups || []).flatMap((group) => (group?.items || []).map((item) => ({ ...item, group: group.name })));
}

const SOURCE_BRAND_PREFIXES = new Map([
  ["Zeekr", ["ZEEKR", "Zeekr"]],
  ["Xiaomi", ["Xiaomi Auto", "Xiaomi"]],
  // Приставка подмарки в названии модели: у альянса Huawei источник приклеивает
  // к модели имя марки, а иногда прежнее общее имя альянса.
  ["AITO", ["AITO Wenjie", "Wenjie", "AITO", "HIMA", "问界"]],
  ["Luxeed", ["Luxeed", "Zhijie", "智界"]],
  ["Stelato", ["Enjoy World", "Stelato", "Xiangjie", "享界"]],
  ["Shangjie", ["Shangjie", "尚界"]],
  ["Maextro", ["Maextro", "Zunjie", "尊界"]],
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
  return canonicalImportModel(brand, model);
}

export function normalizeChe168Energy(detail, specs) {
  // Слова берём и по-английски, и по-русски: с 31.08.2026 сборщик ходил по русской
  // версии источника, и там «Электромобиль», «Продлённый запас хода», «Тип топлива»
  // вместо Pure Electric, Range Extender, Energy Type. Пока условия были только
  // английскими, 1 547 электромобилей и гибридов записались как бензиновые — а от
  // типа зависит пошлина, то есть цена под ключ на карточке.
  const energy = [
    detail.fuelname,
    specValue(specs, [/^Energy Type$/i, /^Тип топлива$/i, /^Тип энергии$/i]),
    detail.carname,
    detail.specname,
  ]
    .filter(Boolean)
    .join(" ");
  // Мягкий гибрид (48 В) — это бензиновая машина, которую нельзя зарядить, а
  // источник всё равно пишет «Бензин+48V мягкая гибридная система». Если ловить
  // просто «гибрид», она уедет к подключаемым, поэтому отсекаем её первой.
  if (/mild hybrid|48V|MHEV|轻混|мягк\w* гибрид/i.test(energy)) return "ДВС";
  if (/PHEV|plug[- ]in|range extender|hybrid|DM-[ip]|增程|混动|гибрид\w*|подключаем\w*|продлённый запас хода|продленный запас хода|увеличенным запасом хода|электропривод/i.test(energy)) return "Гибрид";
  if (/Pure Electric|Battery Electric|BEV|электромобил\w*|чист\w* электро|электрическ\w*/i.test(energy)) return "Электромобиль";
  return "ДВС";
}

export function buildChe168Car(payload, { importedAt = new Date().toISOString(), usdToCny = 7.15, expectedLocale } = {}) {
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

  const {
    battery, electricRange, combinedRange, horsepower, batteryType, batteryBrand, acceleration,
    torqueNm, tireSizeFront, tireRim, engine, driveRaw: driveFromSpecs,
    bodyStructure: structureFromSpecs, seats: seatsFromSpecs, doors: doorsFromSpecs,
    curbWeight: weightFromSpecs, dimensions: dimensionsFromSpecs, transmission: transmissionFromSpecs,
  } = deriveChe168SpecFields(specs);
  const sourceUrl = `https://global.che168.com/en/detail/${detail.infoid}`;
  const chinaPrice = Math.round((sourcePriceUsd * usdToCny) / 100) * 100;
  const driveRaw = normalizeDrive(detail.drivingmode) !== "Не указан" ? detail.drivingmode : driveFromSpecs;
  const bodyStructure = detail.structure || structureFromSpecs;
  const technicalSpecs = normalizeChe168TechnicalSpecs(payload.specGroups);
  // Old stored RU sheets remain readable, but every network importer explicitly
  // requests EN and must reject an accidental localized response before writing.
  if (expectedLocale === "en" && (technicalSpecs.sourceLocale !== "en"
    || /[А-Яа-яЁё]/.test([detail.drivingmode, detail.fuelname, detail.gearbox].join(" ")))) {
    const error = new Error(`Che168 ${detail.infoid}: expected English specifications; localized response rejected`);
    error.code = "CHE168_LOCALE_MISMATCH";
    throw error;
  }

  const car = repairVerifiedDrive({
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
    combinedRange,
    range: electricRange,
    horsepower,
    engine,
    transmission: detail.gearbox && !/^[-—–]+$/.test(detail.gearbox.trim()) ? detail.gearbox : transmissionFromSpecs,
    bodyColor: detail.color || null,
    vehicleClass: detail.level || null,
    bodyStructure,
    acceleration,
    torqueNm,
    tireSizeFront,
    tireRim,
    seats: numeric(detail.setcount) ?? seatsFromSpecs,
    doors: numeric(detail.structuredoor) ?? doorsFromSpecs,
    dimensions: detail.dimension && !/^[-—–]+$/.test(detail.dimension.trim()) ? detail.dimension : dimensionsFromSpecs,
    curbWeight: numeric(detail.curbweight) ?? weightFromSpecs,
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
    originalLanguage: technicalSpecs.sourceLocale,
    priceHistory: [{ at:importedAt, priceCny:chinaPrice }],
  });
  return { ...car, specWarnings: driveConflicts(car) };
}

// Характеристики корейской машины из справочника (config/korea-specs/*.json).
//
// Площадка Encar даёт объём мотора, топливо, коробку и имя комплектации, но не
// мощность, разгон, размеры, массу и батарею. Справочник auto-data.net (обход —
// scripts/build-korea-specs.mjs) хранит их по модели → поколению → комплектации.
// Здесь — склейка: по марке, модели, коду поколения или году, объёму, топливу,
// приводу и словам комплектации находится модификация, и её цифры дописываются
// в запись машины. Найти не удалось или кандидатов несколько с разной мощностью —
// мощность не пишем: лучше пусто, чем чужая цифра. Размеры и масса у таких
// кандидатов обычно одинаковы, их берём, когда совпадают.
import fs from "node:fs/promises";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { autodataSpecGroups } from "./autodata-parser.mjs";

// Файлы справочника сжаты: строки характеристик повторяются от модификации к
// модификации, и в сжатом виде марка весит сотни килобайт вместо мегабайт — так
// справочник спокойно живёт в репозитории.
export const koreaSpecsSlug = (brand) => String(brand).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const koreaSpecsFile = (dir, brand) => path.join(dir, `${koreaSpecsSlug(brand)}.json.gz`);
export const writeKoreaSpecs = (file, data) => fs.writeFile(file, gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 }));
export async function readKoreaSpecs(file) {
  const raw = await fs.readFile(file);
  return JSON.parse(file.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8"));
}

/** Справочник целиком: { [марка]: { models: [...] } }. Папки нет — пустой справочник. */
export async function loadKoreaSpecs(dir) {
  const catalog = {};
  let files = [];
  try { files = await fs.readdir(dir); } catch { return catalog; }
  for (const file of files) {
    if (!/\.json(\.gz)?$/.test(file)) continue;
    try {
      const data = await readKoreaSpecs(path.join(dir, file));
      if (data?.brand && Array.isArray(data.models)) catalog[data.brand] = data;
    } catch {}
  }
  return catalog;
}

const norm = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
// Имя модели у нас и у справочника расходится не только написанием: у нас «MINI» — это
// хэтчбек Cooper, у справочника «Hatch»; наши суффиксы двигателя («Sealion 07 EV»)
// справочник не пишет; двойные имена («Grandeur/Azera», «Carnival/Sedona») делятся.
const MODEL_ALIASES = new Map([
  ["mini|mini", ["hatch"]],
  ["byd|sealion07ev", ["sealion07", "sealion7"]],
  ["byd|yuanplus", ["atto3"]],
  ["kia|carnival", ["carnival", "sedona"]],
  ["hyundai|grandstarex", ["h1", "starex"]],
]);
const modelMatches = (catalogName, brand, ours) => {
  const wanted = norm(ours);
  if (!wanted) return false;
  const wantedForms = new Set([wanted, norm(String(ours).replace(/\s+(EV|PHEV|DM-i|Hybrid)$/i, ""))]);
  for (const alias of MODEL_ALIASES.get(`${norm(brand)}|${wanted}`) || []) wantedForms.add(alias);
  const names = [norm(catalogName), ...String(catalogName).split("/").map(norm)];
  return names.some((name) => wantedForms.has(name));
};

// Коды поколений в имени модели у площадки: «그랜저 (GN7)», «5시리즈 (G30)», «E-클래스 W213»,
// «더 뉴 그랜저 IG», «싼타페 TM». Берём все латинские токены из 1–4 знаков с большой буквы
// и сверяем их с кодами поколений справочника — случайное слово совпадёт только с
// настоящим кодом.
const seriesCodes = (car) => {
  const text = `${car.rawSeries || ""} ${car.rawModelGroup || ""}`;
  const codes = new Set();
  for (const match of text.matchAll(/\(([A-Za-z]{1,3}\d{0,3}[A-Za-z]?)\)/g)) codes.add(match[1].toUpperCase());
  for (const match of text.matchAll(/(?:^|[\s(])([A-Z]{1,3}\d{0,3}[A-Z]?)(?=$|[\s)])/g)) codes.add(match[1].toUpperCase());
  return codes;
};

// Слова комплектации, по которым модификации различаются: «520i», «E220d», «Long Range»,
// «AWD», «Performance», «2.5», «1.6», «B6», «110 P300».
const gradeTokens = (car) => {
  const text = `${car.rawModel || ""} ${car.description || ""}`;
  const tokens = new Set();
  for (const match of text.matchAll(/\b([A-Za-z]{0,3}\s?\d{3}\s?[a-z]{0,2})\b/g)) tokens.add(norm(match[1]));
  // Короткие индексы моторов: Volvo B5/B6/T8, Audi 45 TFSI (число отдельно не берём).
  for (const match of text.matchAll(/\b([A-Z]\d{1,2})\b/g)) tokens.add(norm(match[1]));
  for (const match of text.matchAll(/\b(\d\.\d)\b/g)) tokens.add(norm(match[1]));
  for (const word of ["long range", "standard range", "performance", "plaid", "awd", "4matic", "xdrive", "quattro", "n line", "gt-line", "amg", "m sport", "allspace", "coupe", "cabriolet", "convertible", "touring", "avant", "allroad", "sportback", "gran coupe"]) if (text.toLowerCase().includes(word)) tokens.add(norm(word));
  tokens.delete("");
  return tokens;
};

// Слова кузова в имени поколения справочника («Avant», «Touring», «Allspace», «110»…):
// без подсказки от площадки такое поколение уступает обычному седану или хэтчбеку.
const BODY_WORDS = /\b(avant|allroad|touring|estate|wagon|coupe|coup[eé]|cabrio|cabriolet|convertible|roadster|spyder|long|allspace|sportback|gran coupe|shooting brake|hard top|van|pickup|130|90 |sedan long|l sedan)\b/i;
// Корейские подсказки площадки → слова справочника.
const KOREAN_BODY_HINTS = [[/올스페이스/, "allspace"], [/왜건|투어링|아반트|에스테이트/, "touring|avant|estate|wagon"], [/쿠페/, "coupe"], [/카브리올레|컨버터블|로드스터/, "cabrio|convertible|roadster"], [/롱|\bL\b/, "long"], [/스포트백/, "sportback"]];
const bodyHints = (car) => {
  const text = `${car.rawSeries || ""} ${car.rawModelGroup || ""} ${car.rawModel || ""}`;
  return KOREAN_BODY_HINTS.filter(([pattern]) => pattern.test(text)).map(([, words]) => new RegExp(`\\b(${words})\\b`, "i"));
};

const overlaps = (item, year) => (item.from === null || item.from <= year + 1) && (item.to === null || item.to >= year - 1);
const contains = (item, year) => (item.from === null || item.from <= year) && (item.to === null || item.to >= year);

// Коды поколения из имени справочника: «5 Series Sedan (G30 LCI, facelift 2020)» → G30,
// «Grandeur/Azera VI (IG, facelift 2019)» → IG. Считаются здесь, а не при обходе: так
// уже скачанный справочник не надо перекачивать ради нового правила.
const generationCodes = (generation) => {
  const codes = new Set((generation.codes || []).map((code) => String(code).toUpperCase()));
  for (const group of String(generation.name || "").matchAll(/\(([^)]+)\)/g)) {
    for (const token of group[1].matchAll(/\b([A-Z]{1,3}\d{1,3}[A-Z]?|[A-Z]{2,4})\b/g)) {
      if (!/^(LCI|MK|GEN)$/.test(token[1])) codes.add(token[1]);
    }
  }
  return codes;
};

/**
 * Модификация справочника для машины. Возвращает { model, generation, modification,
 * candidates, exact } или null. `exact` — кандидат один (или все с одной мощностью).
 *
 * Поколения не выбираются заранее одно: у площадки год модельный, а у справочника
 * поколения и рестайлинги накладываются друг на друга по годам, к тому же кузова
 * (седан, универсал, удлинённый) — отдельные поколения. Поэтому кандидаты собираются
 * из всех подходящих поколений, а очки получают за код поколения, год, слова
 * комплектации, привод, число мест и «обычный» кузов.
 */
export function matchKoreaSpec(car, catalog) {
  const brand = catalog?.[car?.brand];
  if (!brand || !car?.model) return null;
  // Одна модель может лежать в справочнике дважды (KGM и SsangYong — две марки у
  // справочника, одна у площадки): поколения складываются вместе.
  const models = brand.models.filter((item) => modelMatches(item.name, car.brand, car.model));
  if (!models.length) return null;
  const model = { ...models[0], generations: models.flatMap((item) => item.generations || []) };
  const year = Number(car.year) || 0;
  const codes = seriesCodes(car);
  const coded = model.generations.filter((generation) => [...generationCodes(generation)].some((code) => codes.has(code)));
  const generations = coded.length ? coded : model.generations.filter((generation) => overlaps(generation, year));
  if (!generations.length) return null;
  // Самое позднее поколение из начавшихся не позже года машины — предпочтительное.
  const preferred = [...generations].sort((a, b) => (b.from || 0) - (a.from || 0)).find((item) => (item.from || 0) <= year) || generations.at(-1);
  const tokens = gradeTokens(car);
  const hints = bodyHints(car);
  const fuel = car.sourceFuelType || "";
  const wantDiesel = /diesel/i.test(fuel);
  const wantPetrol = /gasoline|petrol/i.test(fuel);
  const pool = generations.flatMap((generation) => (generation.modifications || []).map((modification) => ({ generation, modification })));
  const seatCounts = new Set(pool.map(({ modification }) => Number(modification.summary?.seats) || 0).filter(Boolean));
  const candidates = pool
    .filter(({ modification }) => overlaps(modification, year))
    .filter(({ modification: { summary } }) => {
      if (!summary) return false;
      if (car.type === "Электромобиль") return summary.powertrain === "Электромобиль";
      if (car.type === "Гибрид") {
        if (summary.powertrain !== "Гибрид" || summary.mild) return false;
      } else if (!(summary.powertrain === "ДВС" || (summary.powertrain === "Гибрид" && summary.mild))) {
        // Бензин с мягким 48-вольтовым гибридом у площадки идёт как бензин.
        return false;
      }
      if (summary.fuel === "Газ") return false;
      if (wantDiesel && summary.fuel !== "Дизель") return false;
      if (wantPetrol && summary.fuel === "Дизель") return false;
      // Объём — главный признак и у гибридов: 2.4 и 1.6 Grandeur Hybrid — разные поколения.
      if (Number(car.engineCc) && Number(summary.engineCc) && Math.abs(Number(car.engineCc) - Number(summary.engineCc)) > 60) return false;
      return true;
    })
    .filter(({ modification: { summary } }) => !(car.drive && car.drive !== "Не указан" && summary.drive && summary.drive !== car.drive))
    // Число мест решает только у больших машин (Carnival на 7 и на 9 мест — разные
    // модификации) и только там, где справочник различает модификации по местам;
    // «6-7 мест» у справочника читается как 6, поэтому разница в одно место — не разница.
    .filter(({ modification: { summary } }) => !(Number(car.seats) >= 7 && seatCounts.size > 1 && Number(summary.seats) && Math.abs(Number(car.seats) - Number(summary.seats)) > 1))
    .map(({ generation, modification }) => {
      const name = norm(modification.name);
      const generationName = String(generation.name || "");
      let score = 0;
      for (const token of tokens) if (token.length >= 2 && (name.includes(token) || norm(generationName).includes(token))) score += 2;
      if (car.drive && car.drive !== "Не указан" && modification.summary.drive === car.drive) score += 1;
      if (Number(car.seats) && Math.abs(Number(modification.summary.seats) - Number(car.seats)) <= 1 && Number(modification.summary.seats)) score += 1;
      if (generation === preferred) score += 1;
      if (BODY_WORDS.test(generationName) && !hints.some((hint) => hint.test(generationName))) score -= 2;
      if (hints.some((hint) => hint.test(generationName))) score += 2;
      return { generation, modification, score };
    })
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;
  let top = candidates.filter((item) => item.score === candidates[0].score);
  // Несколько равных — оставляем те, чьи годы выпуска накрывают год машины строго
  // (E 220d 194 л.с. 2020–2021 против E 220d 200 л.с. 2022–2023 для машины 2022 года).
  if (top.length > 1) {
    const strict = top.filter((item) => contains(item.modification, year));
    if (strict.length) top = strict;
  }
  const powers = new Set(top.map((item) => item.modification.summary.horsepower));
  return { model, generation: top[0].generation, modification: top[0].modification, candidates: top.map((item) => item.modification), exact: top.length === 1 || powers.size === 1 };
}

// Значение, одинаковое у всех кандидатов, иначе null.
const agreed = (candidates, key) => {
  const values = new Set(candidates.map((item) => item.summary?.[key] ?? null));
  return values.size === 1 ? [...values][0] : null;
};

/** Запись машины с дописанными характеристиками из справочника (новый объект). */
export function applyKoreaSpecs(car, catalog) {
  const match = matchKoreaSpec(car, catalog);
  if (!match) return car;
  const { modification, candidates, exact } = match;
  const summary = modification.summary;
  const pick = (key) => (exact ? summary[key] ?? null : agreed(candidates, key));
  const next = { ...car };
  const horsepower = pick("horsepower");
  const set = (key, value) => { if ((next[key] === null || next[key] === undefined || next[key] === "" || next[key] === "Не указан") && value !== null && value !== undefined) next[key] = value; };
  set("horsepower", horsepower);
  set("torqueNm", pick("torqueNm"));
  set("acceleration", pick("acceleration"));
  set("curbWeight", pick("curbWeight"));
  set("doors", pick("doors"));
  set("seats", pick("seats"));
  set("tireSizeFront", pick("tireSizeFront"));
  set("tireRim", pick("tireRim"));
  set("topSpeed", pick("topSpeed"));
  set("wheelbaseMm", pick("wheelbaseMm"));
  const length = pick("lengthMm");
  const width = pick("widthMm");
  const height = pick("heightMm");
  if (length && width && height) set("dimensions", `${length}x${width}x${height}`);
  if (car.type === "Электромобиль" || car.type === "Гибрид") {
    set("battery", pick("battery"));
    const range = pick("electricRange");
    set("electricRange", range);
    set("range", range);
  }
  set("drive", pick("drive"));
  if (!next.transmission && summary.gears && summary.gearbox) next.transmission = `${summary.gears}-speed ${summary.gearbox.toLowerCase()}`;
  // Мощность — в строку мотора: по ней работают фильтр и плашка мощности (src/engine-spec.js).
  if (horsepower && next.engineCc && !/HP/i.test(String(next.engine || ""))) {
    const turbo = /turbo/i.test(String(summary.aspiration || ""));
    next.engine = `${(next.engineCc / 1000).toFixed(1)}${turbo ? "T" : "L"} ${horsepower}HP`;
  } else if (horsepower && !next.engineCc && car.type === "Электромобиль" && !next.engine) {
    next.engine = `${horsepower}HP`;
  }
  const groups = autodataSpecGroups(modification.sections || []);
  if (groups.length) {
    groups[0] = { ...groups[0], items: [{ name: "Источник характеристик", value: exact ? "справочник модели и комплектации, не документы машины" : "справочник модели; комплектация определена приблизительно" }, ...groups[0].items] };
    const existing = next.technicalSpecs?.groups?.filter((group) => !group.name.startsWith("Характеристики:")) || [];
    const all = [...groups, ...existing];
    next.technicalSpecs = { sourceLocale: "ru", count: all.reduce((total, group) => total + group.items.length, 0), groups: all };
  }
  next.specSource = { name: "auto-data.net", model: match.model.name, generation: match.generation.name, modification: modification.name, exact };
  return next;
}

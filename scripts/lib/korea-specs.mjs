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
import { autodataSpecGroups } from "./autodata-parser.mjs";

export const koreaSpecsSlug = (brand) => String(brand).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const koreaSpecsFile = (dir, brand) => path.join(dir, `${koreaSpecsSlug(brand)}.json`);

/** Справочник целиком: { [марка]: { models: [...] } }. Папки нет — пустой справочник. */
export async function loadKoreaSpecs(dir) {
  const catalog = {};
  let files = [];
  try { files = await fs.readdir(dir); } catch { return catalog; }
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const data = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
      if (data?.brand && Array.isArray(data.models)) catalog[data.brand] = data;
    } catch {}
  }
  return catalog;
}

const norm = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
// Имя модели справочника может быть двойным («Grandeur/Azera», «Carnival/Sedona»).
const modelMatches = (catalogName, ours) => {
  const wanted = norm(ours);
  if (!wanted) return false;
  return String(catalogName).split("/").some((part) => norm(part) === wanted) || norm(catalogName) === wanted;
};

// Коды поколений в имени модели у площадки: «그랜저 (GN7)», «5시리즈 (G30)», «E-클래스 W213».
const seriesCodes = (car) => {
  const text = `${car.rawSeries || ""} ${car.rawModelGroup || ""}`;
  const codes = new Set();
  for (const match of text.matchAll(/\(([A-Za-z]{1,3}\d{1,3}[A-Za-z]?)\)/g)) codes.add(match[1].toUpperCase());
  for (const match of text.matchAll(/\b([A-Z]{1,2}\d{2,3}[A-Za-z]?)\b/g)) codes.add(match[1].toUpperCase());
  return codes;
};

// Слова комплектации, по которым модификации различаются: «520i», «E220d», «Long Range»,
// «AWD», «Performance», «2.5», «1.6», «N Line».
const gradeTokens = (car) => {
  const text = `${car.rawModel || ""} ${car.description || ""}`;
  const tokens = new Set();
  for (const match of text.matchAll(/\b([A-Za-z]{0,3}\s?\d{3}\s?[a-z]{0,2})\b/g)) tokens.add(norm(match[1]));
  for (const match of text.matchAll(/\b(\d\.\d)\b/g)) tokens.add(norm(match[1]));
  for (const word of ["long range", "standard range", "performance", "plaid", "awd", "4matic", "xdrive", "quattro", "n line", "gt-line", "amg", "m sport"]) if (text.toLowerCase().includes(word)) tokens.add(norm(word));
  tokens.delete("");
  return tokens;
};

const overlaps = (item, year) => (item.from === null || item.from <= year + 1) && (item.to === null || item.to >= year - 1);

/**
 * Модификация справочника для машины. Возвращает { model, generation, modification,
 * candidates, exact } или null. `exact` — кандидат один (или все с одной мощностью).
 */
export function matchKoreaSpec(car, catalog) {
  const brand = catalog?.[car?.brand];
  if (!brand || !car?.model) return null;
  const model = brand.models.find((item) => modelMatches(item.name, car.model));
  if (!model) return null;
  const year = Number(car.year) || 0;
  const codes = seriesCodes(car);
  let generations = model.generations.filter((generation) => generation.codes?.some((code) => codes.has(String(code).toUpperCase())));
  if (!generations.length) generations = model.generations.filter((generation) => overlaps(generation, year));
  if (!generations.length) return null;
  // Несколько поколений по году (рестайлинг) — берём самое позднее из начавшихся до года машины.
  generations.sort((a, b) => (b.from || 0) - (a.from || 0));
  const generation = generations.find((item) => (item.from || 0) <= year) || generations.at(-1);
  const tokens = gradeTokens(car);
  const fuel = car.sourceFuelType || "";
  const wantDiesel = /diesel/i.test(fuel);
  const wantPetrol = /gasoline|petrol/i.test(fuel);
  const candidates = generation.modifications
    .filter((modification) => overlaps(modification, year))
    .filter(({ summary }) => {
      if (!summary) return false;
      if (car.type === "Электромобиль") return summary.powertrain === "Электромобиль";
      if (car.type === "Гибрид") return summary.powertrain === "Гибрид" && !summary.mild;
      // Бензин с мягким 48-вольтовым гибридом у площадки идёт как бензин.
      if (!(summary.powertrain === "ДВС" || (summary.powertrain === "Гибрид" && summary.mild))) return false;
      if (summary.fuel === "Газ") return false;
      if (wantDiesel && summary.fuel !== "Дизель") return false;
      if (wantPetrol && summary.fuel === "Дизель") return false;
      if (Number(car.engineCc) && Number(summary.engineCc) && Math.abs(Number(car.engineCc) - Number(summary.engineCc)) > 60) return false;
      return true;
    })
    .filter(({ summary }) => !(car.drive && car.drive !== "Не указан" && summary.drive && summary.drive !== car.drive))
    .map((modification) => {
      const name = norm(modification.name);
      let score = 0;
      for (const token of tokens) if (token.length >= 3 && name.includes(token)) score += 2;
      if (car.drive && car.drive !== "Не указан" && modification.summary.drive === car.drive) score += 1;
      return { modification, score };
    })
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;
  const top = candidates.filter((item) => item.score === candidates[0].score);
  const powers = new Set(top.map((item) => item.modification.summary.horsepower));
  return { model, generation, modification: top[0].modification, candidates: top.map((item) => item.modification), exact: top.length === 1 || powers.size === 1 };
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

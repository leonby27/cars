// Справочник характеристик для корейских машин: обход auto-data.net по маркам.
//
// Площадка Encar не публикует мощность, разгон, размеры и батарею, поэтому они
// берутся из справочника по модели → поколению → комплектации (разбор —
// scripts/lib/autodata-parser.mjs, склейка с машиной — scripts/lib/korea-specs.mjs).
// Результат — по файлу на марку в config/korea-specs/<марка>.json; повторный запуск
// дочитывает только новые модификации, уже разобранные страницы не запрашивает.
//
// Берутся только поколения и модификации, выпускавшиеся в 2019 году или позже
// (`--since`): машины моложе 2020 года мы не возим. Темп бережный — одна страница
// в секунду с небольшим: справочник чужой, а объём разовый.
//
//   node scripts/build-korea-specs.mjs --brands=Hyundai,Kia
//   node scripts/build-korea-specs.mjs                      все марки Encar
//   node scripts/build-korea-specs.mjs --brands=BMW --since=2020 --pace=1500
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUTODATA_BASE, AUTODATA_BRANDS, parseBrandModels, parseGenerationModifications, parseModelGenerations, parseModificationPage, summarizeModification } from "./lib/autodata-parser.mjs";
import { koreaSpecsFile, koreaSpecsSlug, readKoreaSpecs, writeKoreaSpecs } from "./lib/korea-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const since = Number(args.get("since") || 2019);
const pace = Number(args.get("pace") || 1200);
const outDir = path.resolve(ROOT, args.get("out") || "config/korea-specs");
const brandFilter = args.get("brands")?.split(",").map((brand) => brand.trim()).filter(Boolean) || null;
const maxPages = Number(args.get("max-pages") || 0);
const brands = Object.keys(AUTODATA_BRANDS).filter((brand) => !brandFilter || brandFilter.some((wanted) => wanted.toLowerCase() === brand.toLowerCase()));
const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pages = 0;
async function page(pathname) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${AUTODATA_BASE}${pathname}`, {
        signal: AbortSignal.timeout(30_000),
        headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120 Safari/537.36", "accept-language": "en" },
      });
      pages += 1;
      const text = await response.text();
      await sleep(pace);
      if (response.status === 429 || response.status >= 500) { await sleep(5000 * (attempt + 1)); continue; }
      return { status: response.status, text };
    } catch (error) {
      await sleep(3000 * (attempt + 1));
    }
  }
  return { status: 0, text: "" };
}

// Живёт ли поколение/модификация в нужные годы.
const recent = (item) => (item.to === null || item.to >= since) && (item.from === null || item.from <= new Date().getFullYear() + 1);

await fs.mkdir(outDir, { recursive: true });
for (const brand of brands) {
  if (maxPages && pages >= maxPages) break;
  const file = koreaSpecsFile(outDir, brand);
  let existing = null;
  try { existing = await readKoreaSpecs(file); } catch {}
  // Старый несжатый файл того же справочника тоже годится как источник разобранного.
  if (!existing) { try { existing = await readKoreaSpecs(file.replace(/\.gz$/, "")); } catch {} }
  const known = new Map();
  for (const model of existing?.models || []) for (const generation of model.generations || []) for (const modification of generation.modifications || []) if (modification.sections?.length) known.set(modification.path, modification);
  log(`[${brand}] уже разобрано модификаций: ${known.size}`);
  const models = [];
  for (const brandPath of AUTODATA_BRANDS[brand]) {
    const { status, text } = await page(brandPath);
    if (status !== 200) { log(`[${brand}] страница марки ${brandPath}: ответ ${status}`); continue; }
    for (const model of parseBrandModels(text)) if (recent(model)) models.push(model);
  }
  log(`[${brand}] моделей с выпуском не раньше ${since}: ${models.length}`);
  const result = { brand, source: "auto-data.net", since, generatedAt: new Date().toISOString(), models: [] };
  let fetched = 0;
  for (const model of models) {
    if (maxPages && pages >= maxPages) break;
    const modelPage = await page(model.path);
    if (modelPage.status !== 200) { log(`[${brand}] ${model.name}: ответ ${modelPage.status}`); continue; }
    const generations = parseModelGenerations(modelPage.text).filter(recent);
    const entry = { ...model, generations: [] };
    for (const generation of generations) {
      if (maxPages && pages >= maxPages) break;
      const generationPage = await page(generation.path);
      if (generationPage.status !== 200) continue;
      const modifications = parseGenerationModifications(generationPage.text).filter(recent);
      const genEntry = { ...generation, modifications: [] };
      for (const modification of modifications) {
        if (maxPages && pages >= maxPages) break;
        const cached = known.get(modification.path);
        if (cached) { genEntry.modifications.push({ ...modification, summary: cached.summary, sections: cached.sections }); continue; }
        const modificationPage = await page(modification.path);
        if (modificationPage.status !== 200) { log(`[${brand}] ${model.name} ${modification.name}: ответ ${modificationPage.status}`); continue; }
        const sections = parseModificationPage(modificationPage.text);
        if (!sections.length) { log(`[${brand}] ${model.name} ${modification.name}: страница без характеристик`); continue; }
        fetched += 1;
        genEntry.modifications.push({ ...modification, summary: summarizeModification(sections), sections });
      }
      if (genEntry.modifications.length) entry.generations.push(genEntry);
    }
    if (entry.generations.length) result.models.push(entry);
    log(`[${brand}] ${model.name}: поколений ${entry.generations.length}, модификаций ${entry.generations.reduce((total, generation) => total + generation.modifications.length, 0)}`);
    // Записываем после каждой модели: прерванный обход не теряет сделанного.
    await writeKoreaSpecs(file, result);
  }
  log(`[${brand}] готово: моделей ${result.models.length}, новых страниц ${fetched}, файл ${path.relative(ROOT, file)} (${koreaSpecsSlug(brand)})`);
}
log(`[done] страниц запрошено ${pages}`);

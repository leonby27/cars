// Пополнение каталога машинами с Encar (Корея).
//
// Устройство то же, что у пополнения Che168 (import-v2.mjs), только без браузера:
// площадка отвечает простыми запросами. Обход списков идёт срезами «марка →
// модельная группа → год» (scripts/lib/encar-client.mjs), карточки качаются
// параллельно с обходом, каждые `--batch` принятых машин записываются в базу —
// прерванный прогон сохраняет набранное.
//
// Правила ввоза те же, что у Che168 и Guazi (config/import-policy.mjs): список
// марок (для Кореи плюс Genesis и KGM), год от 2020, потолок цены «под ключ»
// 100 000 $. Газ, водород, грузовики, лизинг и аренда отсеиваются в разборе
// (scripts/lib/encar-parser.mjs). Пишется только база: статический дамп
// public/data/cars.json — наследие Che168, корейские машины в него не кладём.
//
// Работает только с нашего сервера: из Беларуси api.encar.com закрыт.
//
//   npm run import:encar -- --limit=200                      первые 200 машин
//   npm run import:encar -- --limit=5000 --brands=Hyundai,Kia
//   npm run import:encar -- --discoveries --limit=600        по находкам актуализации
//   npm run import:encar -- --limit=50 --database=0          сухой прогон без записи
//   npm run import:encar -- --limit=200 --database=0 --out=runtime/encar-export.json
//                                                            выгрузка принятых машин в файл (на сервере)
//   npm run import:encar -- --from=runtime/encar-export.json  запись машин из файла в базу (локально,
//                                                            где площадка недоступна)
//   npm run import:encar -- --repair --limit=10000            перечитать уже заведённые машины без полной
//                                                            техкарты (опции, осмотр, история) и дописать её
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EncarClient, EncarGeoBlockedError } from "./lib/encar-client.mjs";
import { loadKoreaSpecs } from "./lib/korea-specs.mjs";
import { ENCAR_MANUFACTURERS } from "./lib/encar-parser.mjs";
import { createEncarImportIdentity } from "./lib/encar-import-identity.mjs";
import { MAX_LANDED_USD, canonicalImportBrand, importPolicyViolation, isAbovePriceCeiling } from "../config/import-policy.mjs";
import { estimateLandedCost, sourceUsdRate } from "../src/pricing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, "runtime", "encar-import-report.json");
const DISCOVERIES_PATH = path.join(ROOT, "runtime", "encar-discoveries.json");

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const limit = Number(args.get("limit") || 100);
const batchSize = Number(args.get("batch") || 50);
const concurrency = Math.max(1, Number(args.get("concurrency") || 2));
const pace = Number(args.get("pace") || 300);
const writeDatabase = args.get("database") !== "0";
const withHistory = args.get("history") !== "0";
const brandFilter = args.get("brands")?.split(",").map((brand) => canonicalImportBrand(brand.trim())).filter(Boolean) || null;
const yearFrom = Number(args.get("year-from") || 2020);
// Цена в 만원 (10 000 вон). Потолок с запасом: 13 000 만원 ≈ 96 000 $, точный
// потолок «под ключ» проверяется по карточке; низ отсекает совсем дешёвые машины.
const priceMin = Number(args.get("price-min") || 700);
const priceMax = Number(args.get("price-max") || 13_000);
const maxMinutes = Number(args.get("max-minutes") || 0);
const deadline = maxMinutes > 0 ? Date.now() + maxMinutes * 60_000 : Infinity;
const outOfTime = () => Date.now() >= deadline;
const useDiscoveries = args.get("discoveries") === "true";
// `--out` складывает принятые машины в файл, `--from` заводит их из файла без сети:
// так машины, собранные на сервере, попадают в локальную базу, где площадка закрыта.
const outPath = args.get("out") ? path.resolve(ROOT, args.get("out")) : null;
const fromPath = args.get("from") ? path.resolve(ROOT, args.get("from")) : null;
// `--repair` перечитывает машины, заведённые до появления полной техкарты, и переписывает их.
const repair = args.get("repair") === "true";

const usdPerKrw = sourceUsdRate("KRW");
if (!(usdPerKrw > 0)) throw new Error("курс воны не задан (src/pricing.js PRICING.krwBynPer1000)");

const brands = Object.keys(ENCAR_MANUFACTURERS).filter((brand) => !brandFilter || brandFilter.includes(brand));
const startedAt = new Date().toISOString();
const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);

// Объявления пропускаем до скачивания; повтор машины под другим номером —
// после чтения карточки, по её sourceVehicleId. Снятая машина не блокирует
// новое объявление, а активная не должна появляться в каталоге дважды.
let identity = createEncarImportIdentity();
let pool = null;
if (writeDatabase) {
  ({ pool } = await import("../server/db.mjs"));
  const { rows } = await pool.query("SELECT external_id, status, source_payload->>'sourceVehicleId' AS source_vehicle_id FROM listings WHERE source='Encar'");
  identity = createEncarImportIdentity(rows);
  log(`[skip] в базе уже ${identity.knownIds.size} корейских объявлений`);
}
const { knownIds } = identity;

const accepted = [];
const rejected = new Map();
const rejectionExamples = [];
let checkpointed = 0;
let detailReads = 0;
const reject = (reason, externalId) => {
  rejected.set(reason, (rejected.get(reason) || 0) + 1);
  if (rejectionExamples.length < 40) rejectionExamples.push({ externalId, reason });
};

// Справочник характеристик по модели и комплектации (config/korea-specs, см.
// scripts/build-korea-specs.mjs): без него карточки заводятся без мощности и размеров.
const koreaSpecs = await loadKoreaSpecs(path.join(ROOT, "config", "korea-specs"));
log(`[specs] справочник характеристик: марок ${Object.keys(koreaSpecs).length}`);
const client = new EncarClient({ pace, log, specs: koreaSpecs });

const report = (extra = {}) => ({
  startedAt,
  source: "Encar",
  requested: limit,
  batchSize,
  concurrency,
  pace,
  brands,
  filters: { yearFrom, priceMinMan: priceMin, priceMaxMan: priceMax, usdPerKrw },
  requests: client.requests,
  throttled: client.throttled,
  detailReads,
  imported: accepted.length,
  importedByBrand: Object.fromEntries([...Map.groupBy(accepted, (car) => car.brand)].map(([brand, cars]) => [brand, cars.length])),
  importedByType: Object.fromEntries([...Map.groupBy(accepted, (car) => car.type)].map(([type, cars]) => [type, cars.length])),
  rejected: [...rejected.values()].reduce((total, value) => total + value, 0),
  rejectedByReason: Object.fromEntries([...rejected].sort((a, b) => b[1] - a[1])),
  rejectionExamples,
  policy: { minYear: yearFrom, maxLandedUsd: MAX_LANDED_USD, fuels: "petrol, diesel, hybrid, electric (no LPG/hydrogen)", sellType: "regular sale only" },
  ...extra,
});

let checkpointChain = Promise.resolve();
const checkpoint = (final = false) => {
  checkpointChain = checkpointChain.then(() => writeBatch(final), () => writeBatch(final));
  return checkpointChain;
};
async function writeBatch(final = false) {
  const upto = accepted.length;
  const fresh = accepted.slice(checkpointed, upto);
  if (!fresh.length && !final) return;
  let databaseRows = null;
  if (writeDatabase && fresh.length) {
    const { importCars } = await import("../server/repository.mjs");
    databaseRows = await importCars(fresh);
  }
  if (outPath) {
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "Encar", count: accepted.length, cars: accepted }, null, 1)}\n`);
  }
  checkpointed = upto;
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report({ finishedAt: new Date().toISOString(), final, databaseRows }), null, 2)}\n`);
  log(`[batch] +${fresh.length} принято (всего ${accepted.length}/${limit})${databaseRows === null ? "" : ` · база +${databaseRows}`}`);
}

// Кандидаты собираются обходом (или берутся из файла находок актуализации) и
// разбираются рабочими потоками параллельно.
const candidates = [];
const seen = new Set();
let discovering = true;
const enqueue = (candidate) => {
  if (candidates.length >= limit * 2) return false;
  if (seen.has(candidate.externalId) || knownIds.has(candidate.externalId)) return false;
  seen.add(candidate.externalId);
  candidates.push(candidate);
  return true;
};

async function discover() {
  if (repair) {
    if (!pool) throw new Error("--repair работает только с базой (--database=0 не сочетается)");
    const missing = await pool.query("SELECT external_id FROM listings WHERE source='Encar' AND status='active' AND (source_payload->'technicalSpecs') IS NULL ORDER BY first_seen_at DESC LIMIT $1", [limit]);
    for (const row of missing.rows) { knownIds.delete(String(row.external_id)); candidates.push({ externalId: String(row.external_id) }); }
    log(`[repair] без полной техкарты ${missing.rows.length} машин — перечитываю`);
    return;
  }
  if (fromPath) {
    const file = JSON.parse(await fs.readFile(fromPath, "utf8"));
    let known = 0;
    for (const car of file.cars || []) {
      if (accepted.length >= limit) break;
      if (!car?.externalId || car.source !== "Encar") continue;
      if (knownIds.has(String(car.externalId))) { known += 1; continue; }
      if (brandFilter && !brandFilter.includes(car.brand)) continue;
      const violation = importPolicyViolation(car);
      if (violation) { reject(`Import policy: ${violation}`, car.externalId); continue; }
      const duplicate = identity.claim(car);
      if (duplicate) { reject(duplicate, car.externalId); continue; }
      accepted.push(car);
      if (accepted.length - checkpointed >= batchSize) await checkpoint(false);
    }
    log(`[from] из файла принято ${accepted.length}, уже в базе ${known}, всего в файле ${(file.cars || []).length}`);
    return;
  }
  if (useDiscoveries) {
    const file = JSON.parse(await fs.readFile(DISCOVERIES_PATH, "utf8"));
    const ageMinutes = Math.round((Date.now() - new Date(file.generatedAt).getTime()) / 60000);
    log(`[new] ${file.items?.length ?? 0} находок от актуализации, файлу ${ageMinutes} мин`);
    if (ageMinutes > 24 * 60) log("[new] файлу находок больше суток — актуализация могла не отработать");
    let known = 0;
    for (const item of file.items || []) {
      if (candidates.length >= limit) break;
      if (brandFilter && !brandFilter.includes(canonicalImportBrand(item.brand))) continue;
      if (!enqueue(item)) known += 1;
    }
    log(`[new] ${candidates.length} к скачиванию · ${known} уже заведены или повторы`);
    return;
  }
  const stats = await client.walk({
    brands, yearFrom, priceMin, priceMax, minYear: yearFrom,
    onItem: (candidate) => { enqueue({ ...candidate, brand: null }); },
    onSlice: ({ label, total, items }) => log(`[list] ${label}: ${items} из ${total}`),
    stop: () => accepted.length >= limit || outOfTime() || candidates.length >= limit * 2,
  });
  log(`[walk] срезов ${stats.slices}, страниц ${stats.pages}, строк ${stats.items}, кандидатов ${stats.candidates}, пропущено ${JSON.stringify(stats.skipped)}`);
}

let cursor = 0;
let timeoutReported = false;
async function worker() {
  while (accepted.length < limit) {
    if (outOfTime()) {
      if (!timeoutReported) { timeoutReported = true; log(`[time] отведённые ${maxMinutes} мин вышли — дописываю набранное`); }
      return;
    }
    if (cursor >= candidates.length) {
      if (!discovering) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    const candidate = candidates[cursor++];
    try {
      const { status, car, detail } = await client.car(candidate.externalId, { usdPerKrw, history: withHistory });
      detailReads += 1;
      if (status === 404) { reject("listing gone (404)", candidate.externalId); continue; }
      if (status !== 200) { reject(`detail request failed (${status})`, candidate.externalId); continue; }
      if (!car) {
        const fuel = detail?.spec?.fuelName || "?";
        const ad = detail?.advertisement?.status || "?";
        reject(ad !== "ADVERTISE" ? `not advertised (${ad})` : `not importable (fuel ${fuel}, body ${detail?.spec?.bodyName || "?"}, photos ${detail?.photos?.length ?? 0})`, candidate.externalId);
        continue;
      }
      const violation = importPolicyViolation(car);
      if (violation) { reject(`Import policy: ${violation}`, candidate.externalId); continue; }
      const landedUsd = estimateLandedCost(car).totalUsd;
      if (isAbovePriceCeiling(landedUsd)) { reject(`landed price ${Math.round(landedUsd)} $ is above the ${MAX_LANDED_USD} $ ceiling`, candidate.externalId); continue; }
      const duplicate = identity.claim(car, { repair });
      if (duplicate) { reject(duplicate, candidate.externalId); continue; }
      accepted.push(car);
      if (accepted.length - checkpointed >= batchSize) await checkpoint(false);
    } catch (error) {
      if (error instanceof EncarGeoBlockedError) throw error;
      reject(`detail error: ${String(error.message).slice(0, 80)}`, candidate.externalId);
    }
  }
}

try {
  await Promise.all([
    discover().catch((error) => { log(`[walk] обход оборван: ${error.message}`); if (error instanceof EncarGeoBlockedError) throw error; }).finally(() => { discovering = false; }),
    ...Array.from({ length: concurrency }, worker),
  ]);
  await checkpoint(true);
  const final = report({ finishedAt: new Date().toISOString(), final: true, candidates: candidates.length });
  log(`[done] принято ${final.imported}, отклонено ${final.rejected}, запросов ${final.requests}`);
  console.log(JSON.stringify({ importedByBrand: final.importedByBrand, importedByType: final.importedByType, rejectedByReason: final.rejectedByReason }, null, 2));
} catch (error) {
  await checkpoint(true).catch(() => {});
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end().catch(() => {});
}

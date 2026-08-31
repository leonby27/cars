// Import v2 — the fast Che168 Global import for the closed pilot.
//
// This is the default bulk path. v1 (`import-che168-browser.mjs`) drove rendered
// DOM listing cards page by page; v2 keeps the same browser requirement and the
// same canonical parser and policy, but reads the site's own data endpoint.
//
// The public HTTP endpoint answers a datacenter request with a JavaScript bot
// challenge, so a real browser has to make the requests. Once the challenge is
// solved in the page, both discovery and detail reads go through the site's own
// React Flight endpoint (`RSC: 1`) instead of scraping rendered DOM: the list
// layer honours `brandid` and `page` server-side, and one detail payload is
// less than half the weight of its HTML page. Parsing, the import policy, and
// every write stay in Node with the canonical modules.
//
// Ночью списки обходит актуализация, и она же складывает всё незнакомое в
// `runtime/che168-discoveries.json`. С `--discoveries` пополнение берёт готовый
// список и только качает карточки: обход второй раз за ночь не нужен, а фиды
// (в том числе бензиновый) подхватываются те, что обошла актуализация.
//
// Usage:
//   npm run importv2 -- --discoveries --limit=600
//   npm run importv2 -- --map-only
//   npm run importv2 -- --limit=100
//   npm run importv2 -- --limit=1000 --batch=100 --brands=Deepal,Zeekr
//   npm run importv2 -- --repair=range
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildChe168Car, extractChe168DetailPayload, extractChe168ListPayload } from "./lib/che168-parser.mjs";
import { ICE_IMPORT_BRANDS, ICE_IMPORT_MIN_YEAR, IMPORT_BRANDS, IMPORT_MIN_YEAR, MAX_LANDED_USD, canonicalImportBrand, importPolicyViolation, isAbovePriceCeiling } from "../config/import-policy.mjs";
import { estimateLandedCost } from "../src/pricing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "public", "data", "cars.json");
const REPORT_PATH = path.join(ROOT, "runtime", "import-che168-report.json");
const PAGE_SIZE = 24;

// The source splits its catalog by powertrain: 5 is a plug-in hybrid, 6 a range
// extender, 7 pure electric. A run targets one or more of those feeds; brand ids
// are probed per feed, because a brand present in one is not necessarily in
// another, so each set of fuel types gets its own cached map.
const FUEL_TYPE_NAMES = { 1: "gasoline", 2: "diesel", 3: "hybrid", 5: "plug-in hybrid", 6: "range extender", 7: "electric" };
const ELECTRIC_FUEL_TYPE = 7;
const GASOLINE_FUEL_TYPE = 1;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const limit = Number(args.get("limit") || 100);
const batchSize = Number(args.get("batch") || 100);
// Темп бережный по той же причине, что и в актуализации: источник закрывается
// не от объёма за неделю, а от плотности обращений за один заход (август 2026 —
// см. scripts/lib/refresh-shifts.mjs). Два потока с секундной паузой дают около
// двух карточек в секунду, ночной лимит при этом выкачивается минут за двадцать.
const concurrency = Number(args.get("concurrency") || 2);
const pace = Number(args.get("pace") || 800);
// Сколько окон одновременно просматривают списки при поиске новых машин.
const listerCount = Math.max(1, Number(args.get("lister") || 1));
const brandFilter = args.get("brands")?.split(",").map((brand) => canonicalImportBrand(brand.trim())) || null;
const mapOnly = args.get("map-only") === "true";
// `--repair=range` re-reads cards the catalog already has whose range never
// parsed, so a parser improvement reaches listings imported before it.
const repairField = args.get("repair") || null;
const refreshMap = args.get("refresh-map") === "true";
const writeDatabase = args.get("database") !== "0";
// `--static=0` keeps the run out of public/data/cars.json. Two importers cannot
// share that file: each rewrites it whole from its own snapshot, so the second
// writer drops the first one's cards. The accepted cards are parked in a sidecar
// instead, ready to be merged once the other run is done — no refetching.
// Дампа каталога может не быть вовсе — он весит сотни мегабайт, вне git и
// пересоздаётся только импортом. Источник истины — база: там те же машины и ещё
// сверх того, поэтому без дампа просто не пишем статическую копию, а не заводим
// её заново с одной машины.
const hasStaticCatalog = existsSync(DATA_PATH);
const writeStatic = args.get("static") !== "0" && hasStaticCatalog;
if (args.get("static") !== "0" && !hasStaticCatalog) console.warn(`[static] ${path.relative(ROOT, DATA_PATH)} нет — статическая копия каталога не пишется; известные id берём из базы.`);
const PENDING_PATH = path.join(ROOT, "runtime", "che168-pending.json");
const maxBrandId = Number(args.get("max-brand-id") || 999);

// `--discoveries` берёт список новых машин у ночной актуализации вместо того,
// чтобы обходить списки источника второй раз за ночь. Актуализация всё равно
// читает каждую страницу каждого фида ради цен и попутно складывает туда всё,
// что нам подходит и чего у нас нет, — см. lib/che168-discovery.mjs.
const discoveriesArg = args.get("discoveries");
const DISCOVERIES_PATH = discoveriesArg && discoveriesArg !== "true"
  ? path.resolve(ROOT, discoveriesArg)
  : path.join(ROOT, "runtime", "che168-discoveries.json");
const discoveriesFile = discoveriesArg ? JSON.parse(await fs.readFile(DISCOVERIES_PATH, "utf8")) : null;
if (discoveriesFile) {
  const ageMinutes = Math.round((Date.now() - new Date(discoveriesFile.generatedAt).getTime()) / 60000);
  // Устаревший файл — не ошибка: машины из него либо уже заведены и отсеются по
  // известным id, либо ещё живы. Но молчать нельзя: если актуализация ночью
  // упала, пополнение работает по позавчерашним находкам и новых не увидит.
  console.log(`[new] ${discoveriesFile.items?.length ?? 0} находок от актуализации, файлу ${ageMinutes} мин`);
  if (ageMinutes > 24 * 60) console.warn(`[new] файлу находок больше суток — актуализация могла не отработать`);
}

const fuelTypes = String(args.get("fueltype") || (discoveriesFile?.feeds?.join(",")) || ELECTRIC_FUEL_TYPE)
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
if (!fuelTypes.length) throw new Error("--fueltype needs at least one numeric source fuel type");
// The pure-electric feed still carries hybrids, so they are dropped before a
// detail request is spent. A hybrid run must obviously not apply that filter.
const skipHybridCandidates = fuelTypes.every((fuelType) => fuelType === ELECTRIC_FUEL_TYPE);
// Бензиновый прогон: свой список марок и разрешённый тип «ДВС». Определяется по
// запрошенному фиду источника, отдельного ключа для этого не нужно.
const combustionRun = fuelTypes.includes(GASOLINE_FUEL_TYPE);
const policyBrands = combustionRun ? [...new Set([...IMPORT_BRANDS, ...ICE_IMPORT_BRANDS])] : IMPORT_BRANDS;
// Отсечка по году на слое списка: у бензина она на год выше, см. import-policy.mjs.
const listMinYear = combustionRun ? ICE_IMPORT_MIN_YEAR : IMPORT_MIN_YEAR;
const fuelKey = [...fuelTypes].sort((a, b) => a - b).join("-");
const BRAND_MAP_PATH = path.join(ROOT, "config", fuelKey === String(ELECTRIC_FUEL_TYPE) ? "che168-brands.json" : `che168-brands-${fuelKey}.json`);
const FEED_URL = `https://global.che168.com/en/used-cars?vehicle_list=1&fueltype=${fuelTypes[0]}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = new Date().toISOString();

// Потолок по времени. Прогон и так ограничен числом машин, но если источник
// начнёт отвечать медленно, ночная служба дотянется до утра и встретится с
// дневными посетителями. Набранное к этому моменту записывается как обычно.
const maxMinutes = Number(args.get("max-minutes") || 40);
const deadline = Number.isFinite(maxMinutes) && maxMinutes > 0 ? Date.now() + maxMinutes * 60_000 : Infinity;
const outOfTime = () => Date.now() >= deadline;
let timeoutReported = false;

// One in-page fetch of the site's Flight endpoint. Runs inside the challenged
// page so the request carries its cookies.
//
// Two throttling shapes are retried. HTTP 429 is the obvious one. The quieter
// one is a 200 whose body simply has no data block: under sustained load the
// source starts answering detail requests with an empty shell, and treating
// that as a bad listing threw away 7,210 perfectly good cards on the first
// full sweep. Callers pass the marker they need so the retry is targeted.
async function flight(page, url, expectMarker = null) {
  return page.evaluate(async ([target, marker]) => {
    let last = { status: 0, text: "" };
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(target, { credentials: "include", headers: { RSC: "1" } });
      if (!response.ok) {
        if (response.status !== 429) return { status: response.status, text: "" };
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
      last = { status: response.status, text: await response.text() };
      if (!marker || last.text.includes(marker)) return last;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
    return last;
  }, [url, expectMarker]);
}

const listUrl = (brandId, pageIndex, fuelType) => `/en/used-cars?brandid=${brandId}&fueltype=${fuelType}&vehicle_list=1${pageIndex > 1 ? `&page=${pageIndex}` : ""}&_rsc=l${fuelType}${brandId}${pageIndex}`;

// The browser hands back a raw Flight stream; wrapping it in the shape the
// canonical parser expects from server-rendered HTML keeps one list/detail
// parser for both transports.
const asFlightScript = (text) => `[1,${JSON.stringify(text)}])`;
const listPayload = (text) => extractChe168ListPayload([asFlightScript(text)]);

// Hybrids are visible in the list layer, so they are dropped before a detail
// request is spent on them. The detail card is still the authority: the import
// policy rechecks the powertrain there.
const HYBRID_FUEL = /PHEV|plug[- ]in|range extender|hybrid|DM-[ip]|增程|混动/i;

// Maps every Che168 brand id to its brand name once, so later runs address
// brands by name. Each requested feed is probed separately and the per-feed
// counts are kept: a brand sells a different number of plug-in hybrids than of
// electric cars, and discovery needs the per-feed figure to size its pagination.
// A brand absent from every requested feed returns no items and stays out.
async function buildBrandMap(page) {
  const map = {};
  const queue = Array.from({ length: maxBrandId }, (_, index) => index + 1);
  const worker = async () => {
    while (queue.length) {
      const brandId = queue.shift();
      for (const fuelType of fuelTypes) {
        const { text } = await flight(page, listUrl(brandId, 1, fuelType));
        const payload = text ? listPayload(text) : null;
        const name = payload?.items?.[0]?.brandname?.trim();
        if (!name) { await sleep(80); continue; }
        const count = payload.totalCount || payload.items.length;
        const entry = map[name] || (map[name] = { brandId, listings: 0, byFuelType: {} });
        entry.byFuelType[fuelType] = count;
        entry.listings += count;
        await sleep(80);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  const fuelLabel = fuelTypes.map((fuelType) => FUEL_TYPE_NAMES[fuelType] || fuelType).join(" + ");
  await fs.writeFile(BRAND_MAP_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "Che168 Global", fuelTypes, fuelType: fuelLabel, brands: sorted }, null, 2)}\n`);
  return sorted;
}

// The electric map predates per-feed counts and stores a single
// `electricListings` number, so it is read through this shim rather than
// rewritten — re-probing 144 brand ids to rename one field would be wasteful.
function brandListings(info) {
  return Number(info.listings ?? info.electricListings) || 0;
}

function brandListingsFor(info, fuelType) {
  return Number(info.byFuelType?.[fuelType] ?? (fuelTypes.length === 1 ? brandListings(info) : 0)) || 0;
}

async function loadBrandMap(page) {
  if (!refreshMap) {
    try {
      const cached = JSON.parse(await fs.readFile(BRAND_MAP_PATH, "utf8"));
      if (Object.keys(cached.brands || {}).length) return cached.brands;
    } catch {}
  }
  console.log("[map] probing Che168 brand ids (one-time)…");
  return buildBrandMap(page);
}

const catalog = hasStaticCatalog ? JSON.parse(await fs.readFile(DATA_PATH, "utf8")) : { cars: [] };
const catalogById = new Map((catalog.cars || []).map((car) => [car.id, car]));
// Listings can be in the database without being in the static file yet — that is
// exactly what `--static=0` produces. Skipping those ids too keeps a follow-up
// run from spending detail requests on cards it already has.
const knownIds = new Set(catalogById.keys());
if (writeDatabase) {
  try {
    const { pool } = await import("../server/db.mjs");
    const { rows } = await pool.query("SELECT id FROM listings");
    for (const row of rows) knownIds.add(row.id);
    console.log(`[skip] ${knownIds.size} listings already known (static + database)`);
  } catch (error) {
    console.warn(`[skip] database ids unavailable: ${error.message}`);
  }
}
const accepted = [];
const rejected = new Map();
const rejectionExamples = [];
let checkpointed = 0;
let detailReads = 0;

function reject(reason, externalId) {
  rejected.set(reason, (rejected.get(reason) || 0) + 1);
  if (rejectionExamples.length < 30) rejectionExamples.push({ externalId, reason });
}

function report(extra = {}) {
  return {
    startedAt,
    source: "Che168 Global",
    layer: "Incomplete Reports",
    discoveryMode: "flight-list",
    requested: limit,
    batchSize,
    concurrency,
    pace,
    detailReads,
    imported: accepted.length,
    importedByBrand: Object.fromEntries([...Map.groupBy(accepted, (car) => car.brand)].map(([brand, cars]) => [brand, cars.length])),
    rejected: [...rejected.values()].reduce((total, value) => total + value, 0),
    rejectedByReason: Object.fromEntries([...rejected].sort((a, b) => b[1] - a[1])),
    rejectionExamples,
    policy: { minYear: listMinYear, brands: policyBrands, newImports: combustionRun ? "combustion allowed" : "electric-only", cleansExistingCatalog: false },
    previousCount: catalog.cars?.length || 0,
    ...extra,
  };
}

// Appends the batch to the static catalog and PostgreSQL. Never replaces or
// filters what is already there: the policy governs new imports only.
// Serialized: concurrent workers can reach the batch boundary together, and two
// overlapping writes would re-send rows that are already checkpointed.
let checkpointChain = Promise.resolve();
const checkpoint = (final = false) => {
  checkpointChain = checkpointChain.then(() => writeBatch(final), () => writeBatch(final));
  return checkpointChain;
};

async function writeBatch(final = false) {
  // `accepted` keeps growing while this function awaits, so the batch boundary
  // has to be pinned before the writes and advanced by exactly that much.
  // Advancing to the later `accepted.length` would silently skip every card the
  // workers added mid-write.
  const upto = accepted.length;
  const fresh = accepted.slice(checkpointed, upto);
  if (!fresh.length && !final) return;
  const cars = [...catalogById.values()];
  const finishedAt = new Date().toISOString();
  if (writeStatic) {
    await fs.writeFile(DATA_PATH, `${JSON.stringify({ ...catalog, generatedAt: finishedAt, count: cars.length, cars }, null, 2)}\n`);
  } else {
    await fs.writeFile(PENDING_PATH, `${JSON.stringify({ generatedAt: finishedAt, count: accepted.length, cars: accepted }, null, 2)}\n`);
  }
  let databaseRows = null;
  if (writeDatabase && fresh.length) {
    const { importCars } = await import("../server/repository.mjs");
    databaseRows = await importCars(fresh);
  }
  checkpointed = upto;
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report({ finishedAt, final, resultingCount: cars.length, databaseRows }), null, 2)}\n`);
  console.log(`[batch] +${fresh.length} accepted (total ${accepted.length}/${limit}) · catalog ${cars.length}${databaseRows === null ? "" : ` · db +${databaseRows}`}`);
}

// Окно поднимается видимым: с 26.08.2026 источник узнаёт браузер без экрана и
// встречает его проверкой «не робот». На сервере экран виртуальный —
// `xvfb-run -a node scripts/import-v2.mjs ...`, см. scripts/refresh-che168.mjs.
const headless = args.get("headless") === "true";
if (!headless && process.platform === "linux" && !process.env.DISPLAY) {
  throw new Error("нужен экран: запускайте через `xvfb-run -a` (или --headless=true, но источник такое окно не пустит)");
}
const browser = await chromium.launch({ headless, args: ["--disable-blink-features=AutomationControlled"] });
// Пропуск проверки «не робот», выданный человеком: без него источник обрывает
// выдачу списков примерно на сотом запросе (замер 31.08.2026), с ним прошло 500
// страниц подряд. Файла может не быть — тогда работаем как раньше.
let sourceState = null;
try {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, "runtime", "source-state.json"), "utf8"));
  const ticket = (raw.cookies || []).find((c) => /EO-Bot-Captcha/i.test(c.name));
  const daysLeft = ticket ? (ticket.expires * 1000 - Date.now()) / 86400000 : 0;
  if (daysLeft > 0) { sourceState = raw; console.log(`[pass] пропуск на месте, годен ещё ${daysLeft.toFixed(1)} суток`); }
  else console.log("[pass] пропуск просрочен или отсутствует — источник будет прижимать");
} catch { console.log("[pass] пропуска нет — иду без него"); }
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
  // Подпись браузера не подменяем: она говорила «макбук», а сервер линуксовый, и
  // всё остальное в браузере это выдавало. Из-за этого противоречия источник
  // 31.08.2026 обрывал обход втрое раньше — см. память che168-working-list-walk.
  ...(sourceState ? { storageState: sourceState } : {}),
});
const page = await context.newPage();

try {
  await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 60_000 });
  console.log("[browser] challenge passed, feed rendered");

  const fuelLabel = fuelTypes.map((fuelType) => FUEL_TYPE_NAMES[fuelType] || fuelType).join(" + ");
  // Работая по находкам, прогон не обходит списки и не адресует марки по номерам,
  // поэтому карта марок ему не нужна — а её построение само по себе стоит обхода.
  const brandMap = discoveriesFile ? {} : await loadBrandMap(page);
  const targets = Object.entries(brandMap)
    .map(([sourceName, info]) => ({ sourceName, ...info, policyBrand: canonicalImportBrand(sourceName) }))
    .filter((target) => policyBrands.includes(target.policyBrand))
    .filter((target) => !brandFilter || brandFilter.includes(target.policyBrand))
    .sort((a, b) => brandListings(b) - brandListings(a));
  if (!discoveriesFile) {
    console.log(`[map] ${Object.keys(brandMap).length} Che168 brands with ${fuelLabel} listings; ${targets.length} match the import policy`);
    console.log(`[targets] ${targets.map((target) => `${target.sourceName}(${brandListings(target)})`).join(", ") || "none"}`);
  } else {
    console.log(`[new] работаем по находкам актуализации (${fuelLabel}), обход списков не нужен`);
  }
  if (mapOnly) {
    console.log(JSON.stringify({ brandMap, targets }, null, 2));
  } else {
    // Discovery and detail reads run together: brands are walked through the
    // Flight list layer while workers already parse the candidates it found.
    // A 20-brand sweep is hundreds of list pages, so a discover-everything-first
    // pass would leave the run with nothing written for a long time.
    const candidates = [];
    const seen = new Set();
    let discovering = true;
    const discover = async () => {
      if (repairField) {
        for (const car of catalogById.values()) {
          if (car.source !== "Che168" || car[repairField]) continue;
          candidates.push({ externalId: car.externalId, brand: car.brand, year: car.year, carname: car.title });
        }
        console.log(`[repair] ${candidates.length} existing Che168 cards without ${repairField}`);
        return;
      }
      if (discoveriesFile) {
        // Находки собраны час назад по списковому слою. За этот час часть машин
        // уже могла попасть к нам другим прогоном, поэтому известные отсеиваем
        // ещё раз — и здесь же режем по `--limit`, чтобы за ночь не выгребать
        // разом всё, что источник выложил за сутки.
        let known = 0;
        for (const item of discoveriesFile.items || []) {
          if (candidates.length >= limit) break;
          const externalId = String(item.externalId || "");
          if (!externalId || seen.has(externalId)) continue;
          if (knownIds.has(`che168-${externalId}`)) { known += 1; continue; }
          seen.add(externalId);
          candidates.push({ externalId, brand: item.brand, year: item.year, carname: item.carname || "" });
        }
        console.log(`[new] ${candidates.length} к скачиванию · ${known} уже заведены · всего в файле ${(discoveriesFile.items || []).length}`);
        return;
      }
      for (const target of targets) {
      if (accepted.length >= limit || outOfTime()) break;
      let brandCandidates = 0;
      let known = 0;
      let skippedOld = 0;
      let skippedHybrid = 0;
      // Each feed paginates on its own, so a brand is walked once per fuel type.
      for (const fuelType of fuelTypes) {
        if (accepted.length >= limit || outOfTime()) break;
        const listed = brandListingsFor(target, fuelType);
        if (!listed) continue;
        let pageCount = Math.max(1, Math.ceil(listed / PAGE_SIZE));
        // Страницы списка делятся между окнами по чередованию: первое окно берёт
        // 1, 3, 5-ю, второе — 2, 4, 6-ю. Источник отдаёт страницу за две-три
        // секунды, и один обходчик держал на этой скорости весь прогон, хотя
        // карточки успевали качаться вдвое быстрее. Число окон — `--lister`.
        await Promise.all(listerPages.map(async (listerPage, listerIndex) => {
        for (let pageIndex = listerIndex + 1; pageIndex <= pageCount && accepted.length < limit && !outOfTime(); pageIndex += listerPages.length) {
          const { text, status } = await flight(listerPage, listUrl(target.brandId, pageIndex, fuelType));
          const payload = status === 200 && text ? listPayload(text) : null;
          // Источник, начавший ограничивать частоту, отвечает не 200 или пустым
          // телом. Молчать об этом нельзя: страница просто «кончается», и прогон
          // выглядит успешным, хотя половина машин не найдена.
          if (status !== 200) console.warn(`[throttle] ${target.sourceName} стр. ${pageIndex}: ответ ${status}`);
          if (!payload?.items?.length) return;
          if (payload.pageCount) pageCount = Math.min(pageCount, payload.pageCount);
          for (const item of payload.items) {
            const externalId = String(item.infoid || "");
            if (!externalId || seen.has(externalId)) continue;
            if (knownIds.has(`che168-${externalId}`)) { known += 1; continue; }
            if (skipHybridCandidates && HYBRID_FUEL.test(`${item.fuelname} ${item.specname} ${item.carname}`)) { skippedHybrid += 1; continue; }
            // Модельный год из названия комплектации — то же, что проверяет политика
            // по детальной карточке, поэтому отбор здесь идёт по нему: иначе машина
            // 2019 модельного года, поставленная на учёт в 2020-м, качается целиком
            // и тут же отбраковывается. Года в названии нет — берём дату выпуска
            // из списка, это ближайшее к нему.
            const named = Number(`${item.specname} ${item.carname}`.match(/\b(20\d{2})\b/)?.[1]);
            const year = named || Number(String(item.regdate || "").slice(0, 4));
            if (!year || year < listMinYear) { skippedOld += 1; continue; }
            seen.add(externalId);
            candidates.push({ externalId, brand: target.policyBrand, year, carname: String(item.carname || "").trim() });
            brandCandidates += 1;
          }
          await sleep(pace);
        }
        }));
      }
      console.log(`[discover] ${target.sourceName}: ${brandCandidates} new candidates · ${known} already imported · skipped ${skippedOld} pre-2020${skipHybridCandidates ? `, ${skippedHybrid} hybrid` : ""} · ${brandListings(target)} listed`);
    } };

    // Details: parsed and policy-checked in Node; a batch write happens every
    // `batchSize` accepted cards so a long run keeps making durable progress.
    let cursor = 0;
    // Источник с 27.08.2026 обрывает выдачу после сотни-двух обращений и
    // отпускает через ~15 минут (замеры и живой прогон 31.08.2026). Раньше
    // пополнение этого не знало: при стене каждая следующая карточка отвечала
    // пустотой, и прогон «прожигал» весь список находок, не заведя ни одной
    // машины. Теперь отдыхаем — сами до стены и обязательно после неё.
    const burstLimit = Number(args.get("burst") || 140);
    const burstPauseMin = Number(args.get("burst-pause") || 15);
    // Безответная карточка дорога: внутренние повторы растягивают её на 10–15
    // секунд. Поэтому стену распознаём с восьми, а не с двадцати — иначе только
    // на распознавание уходит пять минут (проверено 31.08.2026: старая версия
    // без этого перебирала 150 карточек вхолостую и не завела ни одной).
    const wallLimit = Number(args.get("wall") || 8);
    let burstRequests = 0;
    let consecutiveFailures = 0;
    let wallPauses = 0;
    let successesSinceWall = 0;
    let givenUp = false;
    const restIfNeeded = async (reason) => {
      console.warn(`[pause] ${reason} — отдыхаю ${burstPauseMin} мин`);
      const until = Date.now() + burstPauseMin * 60_000;
      while (Date.now() < until && !outOfTime()) await sleep(5_000);
      burstRequests = 0;
      consecutiveFailures = 0;
    };
    const worker = async (workerPage) => {
      while (accepted.length < limit) {
        if (outOfTime()) {
          if (!timeoutReported) { timeoutReported = true; console.warn(`[time] отведённые ${maxMinutes} мин вышли — дописываем набранное и заканчиваем`); }
          return;
        }
        if (cursor >= candidates.length) {
          if (!discovering) return;
          await sleep(250);
          continue;
        }
        if (givenUp) return;
        // Норма подхода: отдыхаем добровольно, не доводя до стены.
        if (burstLimit && burstRequests >= burstLimit) {
          await restIfNeeded(`подход ${burstLimit} карточек закончен`);
          if (outOfTime()) return;
        }
        const candidate = candidates[cursor++];
        try {
          const { text, status } = await flight(workerPage, `/en/detail/${candidate.externalId}?_rsc=d${candidate.externalId}`, "ssrCarDetail");
          detailReads += 1;
          burstRequests += 1;
          const payload = status === 200 && text ? extractChe168DetailPayload([`[1,${JSON.stringify(text)}])`]) : null;
          if (!payload) {
            // Пустой ответ — почти всегда стена источника, а не беда карточки.
            // Возвращаем карточку в очередь: после отдыха она прочитается.
            reject(status === 200 ? "payload lacks ssrCarDetail" : `detail request failed (${status})`, candidate.externalId);
            consecutiveFailures += 1;
            if (consecutiveFailures >= wallLimit) {
              if (wallPauses >= 2 && successesSinceWall < 20) {
                givenUp = true;
                console.warn("[stop] источник молчит и после двух передышек — заканчиваю, набранное записано");
                return;
              }
              wallPauses += 1;
              successesSinceWall = 0;
              cursor = Math.max(0, cursor - consecutiveFailures);
              await restIfNeeded(`источник замолчал (${consecutiveFailures} карточек без ответа)`);
              if (outOfTime()) return;
            }
            continue;
          }
          consecutiveFailures = 0;
          successesSinceWall += 1;
          const car = buildChe168Car(payload);
          if (!car) {
            reject("detail page lacks required structured fields or gallery", candidate.externalId);
            continue;
          }
          const violation = importPolicyViolation(car, { combustion: combustionRun });
          if (violation) {
            reject(`Import policy: ${violation}`, candidate.externalId);
            continue;
          }
          // Потолок цены считаем здесь, а не в политике: она не считает деньги.
          const landedUsd = estimateLandedCost(car).totalUsd;
          if (isAbovePriceCeiling(landedUsd)) {
            reject(`landed price ${Math.round(landedUsd)} $ is above the ${MAX_LANDED_USD} $ ceiling`, candidate.externalId);
            continue;
          }
          const existing = catalogById.get(car.id);
          if (!repairField && knownIds.has(car.id)) {
            reject("already in catalog", candidate.externalId);
            continue;
          }
          if (existing && repairField) {
            // The source simply may not publish the field; rewriting an
            // unchanged card would cost a write and tell the report nothing.
            if (car[repairField] === null || car[repairField] === undefined) {
              reject(`source still has no ${repairField}`, candidate.externalId);
              continue;
            }
            catalogById.set(car.id, { ...existing, ...car });
            accepted.push({ ...existing, ...car });
            if (accepted.length - checkpointed >= batchSize) await checkpoint(false);
            continue;
          }
          catalogById.set(car.id, car);
          accepted.push(car);
          if (accepted.length - checkpointed >= batchSize) await checkpoint(false);
        } catch (error) {
          reject(`detail error: ${error.message.slice(0, 80)}`, candidate.externalId);
        }
        await sleep(pace);
      }
    };
    // Первое окно обхода — уже открытое, остальные докрываются по `--lister`.
    const listerPages = [page, ...await Promise.all(Array.from({ length: listerCount - 1 }, async () => {
      const extra = await context.newPage();
      await extra.goto("https://global.che168.com/en", { waitUntil: "domcontentloaded", timeout: 60_000 });
      return extra;
    }))];
    // Every worker fetches relative URLs, so its page has to sit on the site's
    // own origin; the challenge cookie is already shared through the context.
    const workerPages = await Promise.all(Array.from({ length: concurrency }, async () => {
      const workerPage = await context.newPage();
      await workerPage.goto("https://global.che168.com/en", { waitUntil: "domcontentloaded", timeout: 60_000 });
      return workerPage;
    }));
    await Promise.all([
      discover().finally(() => { discovering = false; }),
      ...workerPages.map(worker),
    ]);
    await checkpoint(true);
    console.log(JSON.stringify(report({ finishedAt: new Date().toISOString(), final: true, resultingCount: catalogById.size, candidates: candidates.length }), null, 2));
  }
} finally {
  await browser.close();
  if (writeDatabase) {
    const { pool } = await import("../server/db.mjs");
    await pool.end().catch(() => {});
  }
}

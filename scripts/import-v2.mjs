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
// Usage:
//   npm run importv2 -- --map-only
//   npm run importv2 -- --limit=100
//   npm run importv2 -- --limit=1000 --batch=100 --brands=Deepal,Zeekr
//   npm run importv2 -- --repair=range
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { buildChe168Car, extractChe168DetailPayload, extractChe168ListPayload } from "./lib/che168-parser.mjs";
import { IMPORT_BRANDS, canonicalImportBrand, importPolicyViolation } from "../config/import-policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "public", "data", "cars.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "import-che168-report.json");
const PAGE_SIZE = 24;

// The source splits its catalog by powertrain: 5 is a plug-in hybrid, 6 a range
// extender, 7 pure electric. A run targets one or more of those feeds; brand ids
// are probed per feed, because a brand present in one is not necessarily in
// another, so each set of fuel types gets its own cached map.
const FUEL_TYPE_NAMES = { 3: "hybrid", 5: "plug-in hybrid", 6: "range extender", 7: "electric" };
const ELECTRIC_FUEL_TYPE = 7;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const limit = Number(args.get("limit") || 100);
const batchSize = Number(args.get("batch") || 100);
const concurrency = Number(args.get("concurrency") || 5);
const brandFilter = args.get("brands")?.split(",").map((brand) => canonicalImportBrand(brand.trim())) || null;
const mapOnly = args.get("map-only") === "true";
// `--repair=range` re-reads cards the catalog already has whose range never
// parsed, so a parser improvement reaches listings imported before it.
const repairField = args.get("repair") || null;
const refreshMap = args.get("refresh-map") === "true";
const writeDatabase = args.get("database") !== "0";
const maxBrandId = Number(args.get("max-brand-id") || 999);
const fuelTypes = String(args.get("fueltype") || ELECTRIC_FUEL_TYPE)
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isFinite(value) && value > 0);
if (!fuelTypes.length) throw new Error("--fueltype needs at least one numeric source fuel type");
// The pure-electric feed still carries hybrids, so they are dropped before a
// detail request is spent. A hybrid run must obviously not apply that filter.
const skipHybridCandidates = fuelTypes.every((fuelType) => fuelType === ELECTRIC_FUEL_TYPE);
const fuelKey = [...fuelTypes].sort((a, b) => a - b).join("-");
const BRAND_MAP_PATH = path.join(ROOT, "config", fuelKey === String(ELECTRIC_FUEL_TYPE) ? "che168-brands.json" : `che168-brands-${fuelKey}.json`);
const FEED_URL = `https://global.che168.com/en/used-cars?vehicle_list=1&fueltype=${fuelTypes[0]}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = new Date().toISOString();

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

const catalog = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const catalogById = new Map((catalog.cars || []).map((car) => [car.id, car]));
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
    detailReads,
    imported: accepted.length,
    importedByBrand: Object.fromEntries([...Map.groupBy(accepted, (car) => car.brand)].map(([brand, cars]) => [brand, cars.length])),
    rejected: [...rejected.values()].reduce((total, value) => total + value, 0),
    rejectedByReason: Object.fromEntries([...rejected].sort((a, b) => b[1] - a[1])),
    rejectionExamples,
    policy: { minYear: 2020, brands: IMPORT_BRANDS, newImports: "electric-only", cleansExistingCatalog: false },
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
  await fs.writeFile(DATA_PATH, `${JSON.stringify({ ...catalog, generatedAt: finishedAt, count: cars.length, cars }, null, 2)}\n`);
  let databaseRows = null;
  if (writeDatabase && fresh.length) {
    const { importCars } = await import("../server/repository.mjs");
    databaseRows = await importCars(fresh);
  }
  checkpointed = upto;
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report({ finishedAt, final, resultingCount: cars.length, databaseRows }), null, 2)}\n`);
  console.log(`[batch] +${fresh.length} accepted (total ${accepted.length}/${limit}) · catalog ${cars.length}${databaseRows === null ? "" : ` · db +${databaseRows}`}`);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
const page = await context.newPage();

try {
  await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 60_000 });
  console.log("[browser] challenge passed, feed rendered");

  const brandMap = await loadBrandMap(page);
  const targets = Object.entries(brandMap)
    .map(([sourceName, info]) => ({ sourceName, ...info, policyBrand: canonicalImportBrand(sourceName) }))
    .filter((target) => IMPORT_BRANDS.includes(target.policyBrand))
    .filter((target) => !brandFilter || brandFilter.includes(target.policyBrand))
    .sort((a, b) => brandListings(b) - brandListings(a));
  const fuelLabel = fuelTypes.map((fuelType) => FUEL_TYPE_NAMES[fuelType] || fuelType).join(" + ");
  console.log(`[map] ${Object.keys(brandMap).length} Che168 brands with ${fuelLabel} listings; ${targets.length} match the import policy`);
  console.log(`[targets] ${targets.map((target) => `${target.sourceName}(${brandListings(target)})`).join(", ") || "none"}`);
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
      for (const target of targets) {
      if (accepted.length >= limit) break;
      let brandCandidates = 0;
      let known = 0;
      let skippedOld = 0;
      let skippedHybrid = 0;
      // Each feed paginates on its own, so a brand is walked once per fuel type.
      for (const fuelType of fuelTypes) {
        if (accepted.length >= limit) break;
        const listed = brandListingsFor(target, fuelType);
        if (!listed) continue;
        let pageCount = Math.max(1, Math.ceil(listed / PAGE_SIZE));
        for (let pageIndex = 1; pageIndex <= pageCount && accepted.length < limit; pageIndex += 1) {
          const { text, status } = await flight(listerPage, listUrl(target.brandId, pageIndex, fuelType));
          const payload = status === 200 && text ? listPayload(text) : null;
          if (!payload?.items?.length) break;
          if (payload.pageCount) pageCount = Math.min(pageCount, payload.pageCount);
          for (const item of payload.items) {
            const externalId = String(item.infoid || "");
            if (!externalId || seen.has(externalId)) continue;
            if (catalogById.has(`che168-${externalId}`)) { known += 1; continue; }
            if (skipHybridCandidates && HYBRID_FUEL.test(`${item.fuelname} ${item.specname} ${item.carname}`)) { skippedHybrid += 1; continue; }
            const year = Number(`${item.specname} ${item.carname}`.match(/\b(20\d{2})\b/)?.[1]);
            if (!year || year < 2020) { skippedOld += 1; continue; }
            seen.add(externalId);
            candidates.push({ externalId, brand: target.policyBrand, year, carname: String(item.carname || "").trim() });
            brandCandidates += 1;
          }
          await sleep(60);
        }
      }
      console.log(`[discover] ${target.sourceName}: ${brandCandidates} new candidates · ${known} already imported · skipped ${skippedOld} pre-2020${skipHybridCandidates ? `, ${skippedHybrid} hybrid` : ""} · ${brandListings(target)} listed`);
    } };

    // Details: parsed and policy-checked in Node; a batch write happens every
    // `batchSize` accepted cards so a long run keeps making durable progress.
    let cursor = 0;
    const worker = async (workerPage) => {
      while (accepted.length < limit) {
        if (cursor >= candidates.length) {
          if (!discovering) return;
          await sleep(250);
          continue;
        }
        const candidate = candidates[cursor++];
        try {
          const { text, status } = await flight(workerPage, `/en/detail/${candidate.externalId}?_rsc=d${candidate.externalId}`, "ssrCarDetail");
          detailReads += 1;
          if (status !== 200 || !text) {
            reject(`detail request failed (${status})`, candidate.externalId);
            continue;
          }
          const payload = extractChe168DetailPayload([`[1,${JSON.stringify(text)}])`]);
          if (!payload) {
            reject("payload lacks ssrCarDetail", candidate.externalId);
            continue;
          }
          const car = buildChe168Car(payload);
          if (!car) {
            reject("detail page lacks required structured fields or gallery", candidate.externalId);
            continue;
          }
          const violation = importPolicyViolation(car);
          if (violation) {
            reject(`Import policy: ${violation}`, candidate.externalId);
            continue;
          }
          const existing = catalogById.get(car.id);
          if (existing && !repairField) {
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
        await sleep(60);
      }
    };
    const listerPage = page;
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

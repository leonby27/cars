import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMPORT_BRANDS, IMPORT_BRAND_SLUGS, IMPORT_MIN_YEAR, assertImportSourceEnabled, canonicalImportBrand, importPolicyViolation, isAllowedImportBrand } from "../config/import-policy.mjs";
import { parseGuaziGlobalListing, parseGuaziGlobalProduct } from "./lib/guazi-parser.mjs";

assertImportSourceEnabled("Guazi");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "public", "data", "cars.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "import-global-report.json");
const CACHE_DIR = path.join(ROOT, "runtime", "guazi-global-cache");
const args = new Map(process.argv.slice(2).map((item) => item.includes("=") ? item.split(/=(.*)/s).slice(0, 2) : [item, true]));
const limit = Math.max(1, Number(args.get("--limit") || 100));
const concurrency = Math.max(1, Math.min(5, Number(args.get("--concurrency") || 3)));
const pageCount = Math.max(1, Number(args.get("--pages") || Math.ceil((limit + 20) / 20)));
const useCache = !args.has("--no-cache");
const pureEv = args.has("--pure-ev");
const repairFallbacks = args.has("--repair-fallbacks");
if (args.has("--replace-global-pilot")) throw new Error("Catalog cleanup is disabled by the import policy");
const replaceGlobalPilot = false;
const relatedFeedLimit = Math.max(0, Number(args.get("--related-feeds") || 0));
const relatedPageCount = Math.max(1, Number(args.get("--related-pages") || 2));
const preferredBrand = args.get("--prefer-brand") ? canonicalImportBrand(args.get("--prefer-brand")) : null;
const preferredPageCount = Math.max(relatedPageCount, Number(args.get("--prefer-pages") || relatedPageCount));
const preferredBrandSlug = preferredBrand?.toLocaleLowerCase("en-US").replaceAll("&", "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const preferredModels = String(args.get("--prefer-models") || "").split(",").map((value) => value.trim()).filter(Boolean);
const preferredModelsOnly = args.has("--prefer-models-only");
const EV_LIST_URL = pureEv
  ? "https://en.guazi.com/used-cars/?fuelType=2"
  : "https://en.guazi.com/used-cars/?fuelType=2%2C3%2C4";

await fs.mkdir(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cachePath = (key) => path.join(CACHE_DIR, `${key.replace(/[^a-z0-9_-]+/gi, "-")}.md`);

async function fetchReader(targetUrl, key, selector, attempts = 4, { bypassCache = false, validate = null } = {}) {
  const file = cachePath(key);
  if (useCache && !bypassCache) {
    try { return await fs.readFile(file, "utf8"); } catch {}
  }
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const readerUrl = `https://r.jina.ai/${targetUrl.replaceAll("&", "%26")}`;
      const response = await fetch(readerUrl, {
        headers: {
          accept: "text/plain",
          "x-no-cache": "true",
          "x-wait-for-selector": selector,
          ...(process.env.JINA_API_KEY ? { authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}),
        },
        signal: AbortSignal.timeout(70_000),
      });
      if (!response.ok) throw new Error(`Reader ${response.status} ${response.statusText}`);
      const text = await response.text();
      if (!text || /Security Verification/i.test(text)) throw new Error("Reader returned verification page");
      if (validate && !validate(text)) throw new Error("Reader returned an incomplete product page");
      await fs.writeFile(file, text);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1500);
    }
  }
  throw lastError;
}

const current = existsSync(DATA_PATH) ? JSON.parse(await fs.readFile(DATA_PATH, "utf8")) : { cars: [] };
const existingCarsById = new Map((current.cars || []).map((car) => [car.id, car]));
const needsDetailRepair = (car) => car?.id?.startsWith("guazi-global-")
  && (car.listingFallback === true || (car.images || []).filter(Boolean).length < 2);
const fallbackCars = (current.cars || []).filter(needsDetailRepair);
const repairUrls = fallbackCars.map((car) => car.sourceUrl).filter(Boolean);
const startedAt = new Date().toISOString();
const discovered = [];
const listErrors = [];

function collectListing(markdown) {
  return parseGuaziGlobalListing(markdown);
}

for (let page = 1; !repairFallbacks && page <= pageCount; page += 1) {
  const url = `${EV_LIST_URL}&page=${page}`;
  try {
    const markdown = await fetchReader(url, `list-${pureEv ? "bev" : "new-energy"}-${page}`, "a[href*=\"/products/\"]");
    const urls = collectListing(markdown);
    discovered.push(...urls);
    console.log(`Discovery ${page}/${pageCount}: ${urls.length} listings`);
  } catch (error) {
    listErrors.push({ page, error: error.message });
    console.log(`Discovery ${page}/${pageCount}: ${error.message}`);
  }
}

const relatedFeeds = [];
if (!repairFallbacks && relatedFeedLimit > 0) {
  const feedCounts = new Map();
  const globalCars = (current.cars || []).filter((car) => car.id.startsWith("guazi-global-") && isAllowedImportBrand(car.brand));
  for (const car of globalCars) {
    const externalId = car.id.replace("guazi-global-", "");
    try {
      const markdown = await fs.readFile(cachePath(`product-${externalId}`), "utf8");
      for (const match of markdown.matchAll(/https:\/\/en\.guazi\.com\/used-cars\/[a-z0-9-]+\/[a-z0-9-]+\//gi)) {
        feedCounts.set(match[0], (feedCounts.get(match[0]) || 0) + 1);
      }
    } catch {}
  }

  const rankedFeeds = [...feedCounts]
    // Navigation links occur on every product page; real related-model links do not.
    .filter(([, count]) => count < globalCars.length)
    .filter(([url]) => {
      const brandSlug = new URL(url).pathname.split("/").filter(Boolean)[1];
      return IMPORT_BRAND_SLUGS.includes(brandSlug);
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const preferredFeeds = preferredBrandSlug
    ? [...new Set([
        ...preferredModels.map((model) => `https://en.guazi.com/used-cars/${preferredBrandSlug}/${model}/`),
        ...(preferredModelsOnly ? [] : rankedFeeds.filter(([url]) => new URL(url).pathname.startsWith(`/used-cars/${preferredBrandSlug}/`)).map(([url]) => url)),
      ])]
    : [];
  relatedFeeds.push(...new Set([
    ...preferredFeeds,
    ...rankedFeeds.slice(0, relatedFeedLimit).map(([url]) => url),
  ]));

  const jobs = relatedFeeds.flatMap((feedUrl) => Array.from(
    { length: preferredFeeds.includes(feedUrl) ? preferredPageCount : relatedPageCount },
    (_, index) => ({ feedUrl, page: index + 1 }),
  ));
  let relatedCursor = 0;
  async function relatedWorker() {
    while (relatedCursor < jobs.length) {
      const { feedUrl, page } = jobs[relatedCursor++];
      const slug = new URL(feedUrl).pathname.replace(/^\/used-cars\//, "").replace(/\/$/, "");
      try {
        const markdown = await fetchReader(
          `${feedUrl}?page=${page}`,
          `related-${slug}-${page}`,
          "a[href*=\"/products/\"]",
        );
        const urls = collectListing(markdown);
        discovered.push(...urls);
        const pagesForFeed = preferredFeeds.includes(feedUrl) ? preferredPageCount : relatedPageCount;
        console.log(`Related ${slug} ${page}/${pagesForFeed}: ${urls.length} listings`);
      } catch (error) {
        listErrors.push({ feed: slug, page, error: error.message });
        console.log(`Related ${slug} ${page}/${relatedPageCount}: ${error.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => relatedWorker()));
}

const repairUrlSet = new Set(repairUrls);
const discoveredUnique = [...new Set(repairFallbacks ? repairUrls : [...repairUrls, ...discovered])];
if (preferredBrandSlug) {
  discoveredUnique.sort((a, b) => {
    const repairPriority = Number(!repairUrlSet.has(a)) - Number(!repairUrlSet.has(b));
    return repairPriority || Number(!a.includes(`/products/${preferredBrandSlug}-`)) - Number(!b.includes(`/products/${preferredBrandSlug}-`));
  });
}
function matchesImportPolicyHints(url) {
  const filename = new URL(url).pathname.split("/").pop() || "";
  const hasAllowedBrand = IMPORT_BRAND_SLUGS.some((slug) => filename.startsWith(`${slug}-`));
  const year = Number(filename.match(/-(20\d{2})-/)?.[1]);
  return hasAllowedBrand && year >= IMPORT_MIN_YEAR;
}
const candidates = discoveredUnique.filter((url) => {
  const externalId = url.match(/-([a-z0-9]{10})\.html/i)?.[1];
  const existingCar = externalId ? existingCarsById.get(`guazi-global-${externalId}`) : null;
  const eligible = repairFallbacks ? needsDetailRepair(existingCar) : !existingCar || needsDetailRepair(existingCar);
  return externalId && eligible && matchesImportPolicyHints(url);
});
const imported = [];
const detailErrors = [];
let cursor = 0;

async function worker(workerId) {
  while (cursor < candidates.length && imported.length < limit) {
    const index = cursor++;
    const url = candidates[index];
    const externalId = url.match(/-([a-z0-9]{10})\.html/i)?.[1] || `item-${index}`;
    try {
      let car = null;
      try {
        const cachedMarkdown = await fs.readFile(cachePath(`product-${externalId}`), "utf8");
        car = parseGuaziGlobalProduct(cachedMarkdown, url);
      } catch {}
      if (!car) {
        const markdown = await fetchReader(
          url,
          `product-${externalId}`,
          "img[src*=\"/ovp/product/prod/\"]",
          4,
          {
            bypassCache: true,
            validate: (text) => Boolean(parseGuaziGlobalProduct(text, url)),
          },
        );
        car = parseGuaziGlobalProduct(markdown, url);
      }
      if (!car) throw new Error("Incomplete product page or gallery");
      car.brand = canonicalImportBrand(car.brand);
      car.title = `${car.brand} ${car.model} ${car.year}`;
      const policyViolation = importPolicyViolation(car);
      if (policyViolation) throw new Error(`Import policy: ${policyViolation}`);
      if (pureEv && car.sourceFuelType && car.sourceFuelType !== "BEV") throw new Error("Product is not a BEV");
      if (imported.length < limit) imported.push(car);
      if (imported.length % 10 === 0) console.log(`Parsed ${imported.length}/${limit}`);
    } catch (error) {
      detailErrors.push({ url, workerId, error: error.message });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));

const importedByBrand = Object.fromEntries([...Map.groupBy(imported, (car) => car.brand)].map(([brand, cars]) => [brand, cars.length]));
const baseCars = current.cars || [];
const mergedCars = [...new Map([...baseCars, ...imported].map((car) => [car.id, car])).values()];
const repaired = imported.filter((car) => needsDetailRepair(existingCarsById.get(car.id))).length;
const added = imported.length - repaired;
const finishedAt = new Date().toISOString();
const report = {
  startedAt,
  finishedAt,
  source: "Guazi Global",
  pureEv,
  repairFallbacks,
  replaceGlobalPilot,
  requested: limit,
  pagesScanned: repairFallbacks ? 0 : pageCount,
  relatedFeedsScanned: relatedFeeds.length,
  relatedPagesPerFeed: relatedFeedLimit > 0 ? relatedPageCount : 0,
  preferredBrand,
  preferredModels,
  preferredModelsOnly,
  preferredPagesPerFeed: preferredBrand ? preferredPageCount : 0,
  policy: { minYear: IMPORT_MIN_YEAR, brands: IMPORT_BRANDS, newImports: "electric-only", cleansExistingCatalog: false },
  discovered: candidates.length,
  imported: imported.length,
  repaired,
  added,
  incompleteBefore: fallbackCars.length,
  incompleteAfter: mergedCars.filter(needsDetailRepair).length,
  importedByBrand,
  previousCount: current.cars?.length || 0,
  resultingCount: mergedCars.length,
  listErrors,
  detailErrors: detailErrors.slice(0, 30),
};

await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
const meetsSafetyThreshold = repairFallbacks ? imported.length > 0 || candidates.length === 0 : imported.length >= Math.min(limit, 80);
if (!meetsSafetyThreshold) {
  console.error("Import safety threshold not reached; catalog was not changed.");
  process.exitCode = 1;
} else if (imported.length > 0 && existsSync(DATA_PATH)) {
  await fs.writeFile(DATA_PATH, `${JSON.stringify({ ...current, source: "Guazi", generatedAt: finishedAt, count: mergedCars.length, cars: mergedCars }, null, 2)}\n`);
}

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGuaziGlobalListing, parseGuaziGlobalProduct } from "./lib/guazi-parser.mjs";

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
const replaceGlobalPilot = args.has("--replace-global-pilot");
const EV_LIST_URL = pureEv
  ? "https://en.guazi.com/used-cars/?fuelType=2"
  : "https://en.guazi.com/used-cars/?fuelType=2%2C3%2C4";

await fs.mkdir(CACHE_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cachePath = (key) => path.join(CACHE_DIR, `${key.replace(/[^a-z0-9_-]+/gi, "-")}.md`);

async function fetchReader(targetUrl, key, selector, attempts = 4) {
  const file = cachePath(key);
  if (useCache) {
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
      await fs.writeFile(file, text);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1500);
    }
  }
  throw lastError;
}

const current = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
const existingIds = new Set((current.cars || []).map((car) => car.id));
const startedAt = new Date().toISOString();
const discovered = [];
const listErrors = [];

for (let page = 1; page <= pageCount; page += 1) {
  const url = `${EV_LIST_URL}&page=${page}`;
  try {
    const markdown = await fetchReader(url, `list-${pureEv ? "bev" : "new-energy"}-${page}`, "a[href*=\"/products/\"]");
    const urls = parseGuaziGlobalListing(markdown);
    discovered.push(...urls);
    console.log(`Discovery ${page}/${pageCount}: ${urls.length} listings`);
  } catch (error) {
    listErrors.push({ page, error: error.message });
    console.log(`Discovery ${page}/${pageCount}: ${error.message}`);
  }
}

const candidates = [...new Set(discovered)].filter((url) => {
  const externalId = url.match(/-([a-z0-9]{10})\.html/i)?.[1];
  return externalId && !existingIds.has(`guazi-global-${externalId}`);
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
      const markdown = await fetchReader(url, `product-${externalId}`, "img[src*=\"/ovp/product/prod/\"]");
      const car = parseGuaziGlobalProduct(markdown, url);
      if (!car) throw new Error("Incomplete product page");
      if (pureEv && car.type !== "Электромобиль") throw new Error("Product is not a BEV");
      if (imported.length < limit) imported.push(car);
      if (imported.length % 10 === 0) console.log(`Parsed ${imported.length}/${limit}`);
    } catch (error) {
      detailErrors.push({ url, workerId, error: error.message });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index + 1)));

const importedByBrand = Object.fromEntries([...Map.groupBy(imported, (car) => car.brand)].map(([brand, cars]) => [brand, cars.length]));
const baseCars = replaceGlobalPilot
  ? (current.cars || []).filter((car) => !car.id.startsWith("guazi-global-") || (
      car.type === "Электромобиль"
      && (car.sourceFuelType ? car.sourceFuelType === "BEV" : /-00l-/i.test(car.sourceUrl || ""))
    ))
  : (current.cars || []);
const mergedCars = [...new Map([...baseCars, ...imported].map((car) => [car.id, car])).values()];
const finishedAt = new Date().toISOString();
const report = {
  startedAt,
  finishedAt,
  source: "Guazi Global",
  pureEv,
  replaceGlobalPilot,
  requested: limit,
  pagesScanned: pageCount,
  discovered: candidates.length,
  imported: imported.length,
  importedByBrand,
  previousCount: current.cars?.length || 0,
  resultingCount: mergedCars.length,
  listErrors,
  detailErrors: detailErrors.slice(0, 30),
};

await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (imported.length < Math.min(limit, 80)) {
  console.error("Import safety threshold not reached; catalog was not changed.");
  process.exitCode = 1;
} else {
  await fs.writeFile(DATA_PATH, `${JSON.stringify({ ...current, source: "Guazi", generatedAt: finishedAt, count: mergedCars.length, cars: mergedCars }, null, 2)}\n`);
}

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { marketPowertrain } from "../src/market-compare.js";
import { isDamagedMarketListing, withoutLowPriceOutliers } from "../src/market-price-cleanup.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.argv[2] || path.join(root, "..", "research", "avby-full-2026-09-21", "listings.jsonl"));
const manifestPath = path.join(path.dirname(source), "manifest.json");
const target = path.join(root, "data", "market-belarus-detailed.json");
const mileageLimits = [20_000, 50_000, 100_000, 150_000, 200_000, null];
const buckets = new Map();
let listings = 0;

const keyFor = (brand, model, year, powertrain, mileageMax) => JSON.stringify([brand, model, year, powertrain, mileageMax]);
const stream = readline.createInterface({ input: fs.createReadStream(source), crlfDelay: Infinity });

for await (const line of stream) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  const price = Number(row.priceUsd);
  const mileage = Number(row.mileageKm);
  const year = Number(row.year);
  const powertrain = marketPowertrain(row.properties?.engine_type);
  if (!row.eligible || row.isNew || row.onOrder || isDamagedMarketListing(row) || !row.brand || !row.model || !powertrain || !Number.isFinite(price) || price <= 0 || !Number.isFinite(mileage) || mileage < 0 || !Number.isInteger(year)) continue;
  listings += 1;
  for (const mileageMax of mileageLimits) {
    if (mileageMax !== null && mileage > mileageMax) continue;
    const key = keyFor(row.brand, row.model, year, powertrain, mileageMax);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(price);
  }
}

const median = (values) => {
  const index = Math.floor(values.length / 2);
  return values.length % 2 ? values[index] : (values[index - 1] + values[index]) / 2;
};
const brands = {};
for (const [key, values] of buckets) {
  const [brand, model, year, powertrain, mileageMax] = JSON.parse(key);
  const cleaned = withoutLowPriceOutliers(values);
  const sum = cleaned.reduce((total, value) => total + value, 0);
  brands[brand] ||= {};
  brands[brand][model] ||= {};
  brands[brand][model][year] ||= {};
  brands[brand][model][year][powertrain] ||= {};
  brands[brand][model][year][powertrain][mileageMax === null ? "all" : String(mileageMax)] = {
    count: cleaned.length,
    min: cleaned[0],
    mean: Math.round(sum / cleaned.length),
    median: Math.round(median(cleaned)),
    max: cleaned.at(-1),
  };
}

const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
const output = {
  version: 2,
  collectedAt: manifest.lastObservationAt || manifest.exportedAt || new Date().toISOString(),
  scope: "Used roadworthy passenger-car listings without New or On order badges; isolated low-price outliers removed",
  mileageLimits,
  listings,
  brands,
};
fs.writeFileSync(target, `${JSON.stringify(output)}\n`);
console.log(JSON.stringify({ target, listings, brands: Object.keys(brands).length, buckets: buckets.size, bytes: fs.statSync(target).size }));

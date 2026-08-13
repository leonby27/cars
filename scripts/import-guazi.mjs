import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeDrive, normalizeEnergy, parseGuaziHtml, parseGuaziListing, parseGuaziMarkdown, parseGuaziSeriesLinks } from "./lib/guazi-parser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "public", "data");
const CARS_PATH = path.join(OUTPUT_DIR, "cars.json");
const REPORT_PATH = path.join(OUTPUT_DIR, "import-report.json");
const TARGETS_PATH = path.join(ROOT, "config", "guazi-targets.json");
const INDEX_URL = "https://www.guazi.com/guazisou/cardetail/pc_cardetail_md_index.xml";
const args = new Map(process.argv.slice(2).map((item) => item.split("=").length > 1 ? item.split(/=(.*)/s).slice(0, 2) : [item, true]));
const limit = Number(args.get("--limit") || 18);
const scanLimit = Number(args.get("--scan") || 600);
const concurrency = Number(args.get("--concurrency") || 8);
const discoveryMode = args.get("--discovery") || "targeted";
const htmlUserAgent = process.env.GUAZI_HTML_USER_AGENT || "OAI-SearchBot/1.0";
const commonHeaders = { accept: "text/plain,text/markdown,text/html;q=0.9,*/*;q=0.5", "user-agent": "ChinaCarBY-Importer/0.1" };

async function fetchText(url, headers = commonHeaders, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

const xmlLocations = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

async function discoverMarkdownUrls(maximum) {
  const index = await fetchText(INDEX_URL);
  const sitemapUrls = xmlLocations(index);
  const discovered = [];
  for (const sitemapUrl of sitemapUrls) {
    const sitemap = await fetchText(sitemapUrl);
    discovered.push(...xmlLocations(sitemap));
    if (discovered.length >= maximum) break;
  }
  return discovered.slice(0, maximum);
}

async function discoverTargetMarkdownUrls(maximum) {
  const config = JSON.parse(await fs.readFile(TARGETS_PATH, "utf8"));
  const brandResults = await mapConcurrent(config.targets, async (target) => {
    const html = await fetchText(target.url, { ...commonHeaders, accept: "text/html", "user-agent": htmlUserAgent });
    return { ...target, series: parseGuaziSeriesLinks(html, target.url, target.includeSeries) };
  }, Math.min(concurrency, 6));
  const usableBrands = brandResults.filter((item) => !item.error);
  const groupedSeries = usableBrands.flatMap((target) => target.series.map((item) => ({ ...item, brand: target.brand })));
  const series = takeRoundRobin(groupedSeries, Number.MAX_SAFE_INTEGER, (item) => item.brand);
  const discovered = new Map();
  const byTarget = new Map(series.map((item) => [item.name, 0]));
  let listingRequests = 0;
  let active = series.map((item) => ({ ...item, page: 1, totalPages: 1 }));

  while (active.length && discovered.size < maximum) {
    const pageResults = await mapConcurrent(active, async (target) => {
      const pageUrl = new URL(target.url);
      if (target.page > 1) pageUrl.searchParams.set("page", String(target.page));
      const html = await fetchText(pageUrl.href, { ...commonHeaders, accept: "text/html", "user-agent": htmlUserAgent });
      return { ...target, ...parseGuaziListing(html) };
    }, concurrency);
    listingRequests += active.length;
    const valid = pageResults.filter((item) => !item.error && item.ids.length);
    const remaining = maximum - discovered.size;
    const quota = Math.max(1, Math.ceil(remaining / Math.max(valid.length, 1)));
    for (const result of valid) {
      for (const id of result.ids.slice(0, quota)) {
        if (discovered.size >= maximum) break;
        const url = `https://www.guazi.com/car-detail/c${id}.md`;
        if (!discovered.has(url)) {
          discovered.set(url, result.name);
          byTarget.set(result.name, (byTarget.get(result.name) || 0) + 1);
        }
      }
    }
    active = valid.filter((item) => item.page < item.totalPages).map((item) => ({ ...item, page: item.page + 1 }));
  }

  return {
    urls: [...discovered.keys()],
    stats: {
      configuredBrands: config.targets.length,
      availableBrands: usableBrands.length,
      series: series.length,
      listingRequests,
      bySeries: Object.fromEntries([...byTarget].filter(([, count]) => count > 0)),
      brandErrors: brandResults.filter((item) => item.error),
    },
  };
}

async function mapConcurrent(items, mapper, poolSize) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await mapper(items[index], index); }
      catch (error) { results[index] = { error: error.message, item: items[index] }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(poolSize, items.length) }, worker));
  return results;
}

function takeRoundRobin(items, maximum, groupBy) {
  const groups = [...Map.groupBy(items, groupBy).values()].map((itemsInGroup) => [...itemsInGroup]);
  const selected = [];
  while (groups.length && selected.length < maximum) {
    for (let index = groups.length - 1; index >= 0 && selected.length < maximum; index -= 1) {
      const item = groups[index].shift();
      if (item) selected.push(item);
      if (groups[index].length === 0) groups.splice(index, 1);
    }
  }
  return selected;
}

async function enrichCar(car) {
  const htmlUrl = car.sourceUrl.replace(/\.md$/, ".html");
  const html = await fetchText(htmlUrl, { ...commonHeaders, accept: "text/html", "user-agent": htmlUserAgent });
  const detail = parseGuaziHtml(html);
  if (detail.blocked || detail.images.length === 0) throw new Error("gallery unavailable");
  const type = normalizeEnergy(detail.energy, `${car.rawModel} ${car.rawSeries}`);
  const importedAt = new Date().toISOString();
  return {
    ...car,
    title: `${car.brand} ${car.model} ${car.year}`,
    type,
    drive: normalizeDrive(detail.driveRaw),
    battery: detail.battery,
    batteryType: detail.batteryType,
    range: detail.range,
    claims: detail.claims,
    image: detail.images[0],
    images: detail.images,
    status: "Объявление активно",
    statusTone: "green",
    importedAt,
    updated: "только что",
    sourceId: `GZ-${car.externalId}`,
    originalLanguage: "zh-CN",
  };
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
let previous = { cars: [] };
try { previous = JSON.parse(await fs.readFile(CARS_PATH, "utf8")); } catch {}
const previousById = new Map((previous.cars || []).map((car) => [car.id, car]));

const startedAt = new Date().toISOString();
const discovery = discoveryMode === "sitemap"
  ? { urls: await discoverMarkdownUrls(scanLimit), stats: null }
  : await discoverTargetMarkdownUrls(scanLimit);
const markdownUrls = discovery.urls;
const parsed = await mapConcurrent(markdownUrls, async (url) => {
  const markdown = await fetchText(url);
  return parseGuaziMarkdown(markdown, url);
}, concurrency);
const matching = parsed.filter((item) => item && !item.error);
const enrichmentBuffer = Math.max(12, Math.ceil(limit * 0.1));
const candidates = takeRoundRobin(matching, limit + enrichmentBuffer, (car) => car.brand);
const enriched = await mapConcurrent(candidates, enrichCar, Math.min(concurrency, 5));
const cars = enriched.filter((item) => item && !item.error).slice(0, limit).map((car) => {
  const old = previousById.get(car.id);
  const history = [...(old?.priceHistory || [])];
  if (!history.length || history.at(-1).priceCny !== car.chinaPrice) history.push({ at: car.importedAt, priceCny: car.chinaPrice });
  return { ...car, priceHistory: history.slice(-30) };
});

const payload = {
  source: "Guazi",
  mode: "closed-pilot",
  generatedAt: new Date().toISOString(),
  count: cars.length,
  cars,
};
const errors = [...parsed, ...enriched].filter((item) => item?.error);
const report = {
  startedAt,
  finishedAt: payload.generatedAt,
  discovered: markdownUrls.length,
  discoveryMode,
  discovery: discovery.stats,
  matchingCars: matching.length,
  matchingByBrand: Object.fromEntries([...Map.groupBy(matching, (car) => car.brand)].map(([brand, items]) => [brand, items.length])),
  enrichmentCandidates: candidates.length,
  imported: cars.length,
  errors: errors.slice(0, 20),
};
await fs.writeFile(CARS_PATH, `${JSON.stringify(payload, null, 2)}\n`);
await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (cars.length === 0) process.exitCode = 1;

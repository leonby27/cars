import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMPORT_BRANDS, IMPORT_MIN_YEAR, canonicalImportBrand, importPolicyViolation } from "../config/import-policy.mjs";
import { buildChe168Car, extractChe168DetailPayload, extractChe168ListPayload, parseChe168ListJsonLd } from "./lib/che168-parser.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "public", "data", "cars.json");
const REPORT_PATH = path.join(ROOT, "public", "data", "import-che168-report.json");
const LIST_URL = "https://global.che168.com/en/used-cars?vehicle_list=1&fueltype=7";
const SOURCE_PREFIXES = new Map([
  ["Xiaomi Auto", "Xiaomi"], ["Xiaomi", "Xiaomi"], ["ZEEKR", "Zeekr"], ["Zeekr", "Zeekr"],
  ["AITO", "HIMA"], ["HIMA", "HIMA"], ["XPENG", "XPeng"], ["NIO", "NIO"],
  ["LYNK&CO", "Lynk & Co"], ["Lynk & Co", "Lynk & Co"],
  ...IMPORT_BRANDS.map((brand) => [brand, brand]),
]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function listingBrand(name) {
  const normalized = String(name || "").trim();
  const match = [...SOURCE_PREFIXES].sort((a, b) => b[0].length - a[0].length)
    .find(([prefix]) => normalized.toLocaleLowerCase("en-US").startsWith(prefix.toLocaleLowerCase("en-US") + " "));
  return match ? canonicalImportBrand(match[1]) : null;
}

function listingYear(name) {
  return Number(String(name || "").match(/\b(20\d{2})\b/)?.[1]) || null;
}

function roundRobinByBrand(items) {
  const groups = [...Map.groupBy(items, (item) => item.brand).values()].map((group) => [...group]);
  const result = [];
  while (groups.length) {
    for (let index = groups.length - 1; index >= 0; index -= 1) {
      result.push(groups[index].shift());
      if (!groups[index].length) groups.splice(index, 1);
    }
  }
  return result;
}

async function scriptTexts(tab) {
  const scripts = tab.playwright.locator("script");
  const count = await scripts.count();
  const texts = [];
  for (let index = 0; index < count; index += 1) {
    const text = await scripts.nth(index).textContent();
    if (text) texts.push(text);
  }
  const bodyText = await tab.playwright.locator("body").textContent();
  if (bodyText) texts.push(bodyText);
  return texts;
}

async function renderedListItems(tab) {
  const cards = tab.playwright.locator("[data-uc-car-card]");
  const count = await cards.count();
  const items = new Map();
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const name = String(await card.textContent() || "").trim();
    const links = card.locator('a[href*="/detail/"]');
    if (!name || !(await links.count())) continue;
    const href = await links.first().getAttribute("href");
    const externalId = String(href || "").match(/\/detail\/(\d+)/)?.[1];
    if (!externalId) continue;
    items.set(externalId, {
      name,
      url: new URL(href, "https://global.che168.com").href,
    });
  }
  return [...items.values()];
}

export async function createChe168Pilot({ browser, limit = 100, pages = 24, concurrency = 4, brand = null, brandId = null, seriesIds = [], sort = 4, renderedDiscovery = false, seedItems = [], seedOnly = false, expectedSourceTotalCount = null } = {}) {
  if (!browser) throw new Error("A connected browser is required for Che168 bot-challenge handling");
  const targetBrand = brand ? canonicalImportBrand(brand) : null;
  const sortQuery = sort === null || sort === undefined ? "" : `&sort=${encodeURIComponent(sort)}`;
  const listUrl = brandId
    ? `https://global.che168.com/en/used-cars?brandid=${encodeURIComponent(brandId)}&fueltype=7&vehicle_list=1${sortQuery}`
    : `${LIST_URL}${sortQuery}`;
  const listUrls = [...new Set([
    listUrl,
    ...seriesIds.map((seriesId) => `https://global.che168.com/en/used-cars?brandid=${encodeURIComponent(brandId)}&seriesid=${encodeURIComponent(seriesId)}&fueltype=7&vehicle_list=1${sortQuery}`),
  ])];
  const current = JSON.parse(await fs.readFile(DATA_PATH, "utf8"));
  const existingIds = new Set((current.cars || []).map((car) => car.id));
  const startedAt = new Date().toISOString();
  const candidates = [];
  const candidateIds = new Set();
  const imported = [];
  const rejected = [];
  const discoveryErrors = [];
  let pagesScanned = 0;
  let sourceTotalCount = Number(expectedSourceTotalCount) || null;
  let sourcePageCount = null;
  let detailCursor = 0;
  let orderedCandidates = [];
  const listTab = await browser.tabs.new();
  const workerTabs = [];

  function considerItem(item) {
    const externalId = String(item.externalId || "").match(/^(\d+)$/)?.[1]
      || String(item.url || "").match(/\/detail\/(\d+)/)?.[1];
    const itemBrand = canonicalImportBrand(item.brand || listingBrand(item.name));
    const year = Number(item.year) || listingYear(item.name);
    if (!externalId || !itemBrand || (targetBrand && itemBrand !== targetBrand) || !year || year < IMPORT_MIN_YEAR || existingIds.has(`che168-${externalId}`) || candidateIds.has(externalId)) return;
    candidateIds.add(externalId);
    candidates.push({ externalId, brand:itemBrand, year, name:item.name, url:item.url || `https://global.che168.com/en/detail/${externalId}` });
  }

  async function discover() {
    for (const item of seedItems) considerItem(item);
    for (const feedUrl of seedOnly ? [] : listUrls) {
      for (let page = 1; page <= pages; page += 1) {
        pagesScanned += 1;
        const url = `${feedUrl}&page=${page}`;
        try {
          await listTab.goto(url);
          await wait(renderedDiscovery ? 800 : 250);
          const texts = await scriptTexts(listTab);
          const serverPage = extractChe168ListPayload(texts);
          sourceTotalCount = Math.max(sourceTotalCount || 0, serverPage?.totalCount || 0) || null;
          sourcePageCount = Math.max(sourcePageCount || 0, serverPage?.pageCount || 0) || null;
          const renderedItems = renderedDiscovery ? await renderedListItems(listTab) : [];
          const items = renderedItems.length
            ? renderedItems
            : serverPage?.items?.length
              ? serverPage.items.map((item) => ({ name:item.carname, url:`https://global.che168.com/en/detail/${item.infoid}` }))
              : texts.flatMap(parseChe168ListJsonLd);
          for (const item of items) considerItem(item);
          if (serverPage?.pageCount && page >= serverPage.pageCount) break;
        } catch (error) {
          discoveryErrors.push({ feedUrl, page, error:error.message });
        }
      }
    }
    orderedCandidates = targetBrand ? [...candidates] : roundRobinByBrand(candidates);
    for (let index = 0; index < Math.min(concurrency, orderedCandidates.length); index += 1) workerTabs.push(await browser.tabs.new());
    return { pagesScanned, feeds:seedOnly ? 0 : listUrls.length, targetBrand, sourceTotalCount, sourcePageCount, discovered:candidates.length, byBrand:Object.fromEntries([...Map.groupBy(candidates, (item) => item.brand)].map(([brand, cars]) => [brand, cars.length])), errors:discoveryErrors };
  }

  async function parseCandidate(candidate, tab) {
    await tab.goto(candidate.url);
    await wait(250);
    const payload = extractChe168DetailPayload(await scriptTexts(tab));
    const car = buildChe168Car(payload);
    if (!car) throw new Error("detail page lacks required structured fields or gallery");
    const violation = importPolicyViolation(car);
    if (violation) throw new Error(`Import policy: ${violation}`);
    return car;
  }

  async function importNext(batchSize = 20) {
    const target = Math.min(limit, imported.length + Math.max(1, batchSize));
    async function worker(tab, workerId) {
      while (detailCursor < orderedCandidates.length && imported.length < target && imported.length < limit) {
        const candidate = orderedCandidates[detailCursor++];
        try {
          const car = await parseCandidate(candidate, tab);
          // Several workers may finish together. Keep every successful result;
          // a batch boundary is a progress checkpoint, never a reason to drop a card.
          if (imported.length < limit) imported.push(car);
        } catch (error) {
          rejected.push({ externalId:candidate.externalId, brand:candidate.brand, workerId, error:error.message });
        }
      }
    }
    await Promise.all(workerTabs.map((tab, index) => worker(tab, index + 1)));
    return { imported:imported.length, requested:limit, attempted:detailCursor, remaining:orderedCandidates.length - detailCursor, rejected:rejected.length };
  }

  async function finalize({ allowPartial = false } = {}) {
    if (!imported.length || (!allowPartial && imported.length < limit)) throw new Error(`Only ${imported.length}/${limit} eligible Che168 cards were parsed; catalog was not changed`);
    const finishedAt = new Date().toISOString();
    const selected = imported.slice(0, limit);
    const merged = [...new Map([...(current.cars || []), ...selected].map((car) => [car.id, car])).values()];
    const report = {
      startedAt,
      finishedAt,
      source:"Che168 Global",
      layer:"Incomplete Reports",
      targetBrand,
      requested:limit,
      pagesScanned,
      feedsScanned:seedOnly ? 0 : listUrls.length,
      discoveryMode:seedOnly ? "seeded-rendered-cards" : renderedDiscovery ? "rendered-cards" : "structured-payload",
      sourceTotalCount,
      sourcePageCount,
      discovered:candidates.length,
      attempted:detailCursor,
      imported:selected.length,
      rejected:rejected.length,
      importedByBrand:Object.fromEntries([...Map.groupBy(selected, (car) => car.brand)].map(([brand, cars]) => [brand, cars.length])),
      fieldCoverage:Object.fromEntries(["battery", "electricRange", "drive", "bodyStructure", "bodyColor", "firstRegistration", "technicalSpecs"].map((field) => [field, selected.filter((car) => field === "technicalSpecs" ? car.technicalSpecs?.count > 0 : car[field] !== null && car[field] !== undefined && car[field] !== "Не указан").length])),
      previousCount:current.cars?.length || 0,
      resultingCount:merged.length,
      policy:{ minYear:IMPORT_MIN_YEAR, brands:IMPORT_BRANDS, newImports:"electric-only", cleansExistingCatalog:false },
      discoveryErrors,
      rejectionExamples:rejected.slice(0, 30),
    };
    await fs.writeFile(DATA_PATH, `${JSON.stringify({ ...current, generatedAt:finishedAt, count:merged.length, cars:merged }, null, 2)}\n`);
    await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    return report;
  }

  return { discover, importNext, finalize };
}

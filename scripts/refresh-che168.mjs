// Refresh — price and availability for the Che168 catalog.
//
// A full detail sweep of ~33k cards costs about two hours, but the source's
// own list layer already carries the current dollar price for every visible
// card, so the bulk of the refresh is a ~2k-page list walk (~6 minutes).
// Detail requests are spent only where the lists are silent: a card that
// vanished from every feed is either sold or merely rotated out of the list
// layer — the measured split is roughly 40/60 — so absence alone must never
// unpublish a card. Its own page is the authority: a sold card still answers
// with a detail payload, just without a price.
//
// Usage:
//   npm run refresh                     # full run: lists + detail checks + writes
//   npm run refresh -- --dry-run       # measure only, no database writes
//   npm run refresh -- --skip-detail   # lists only (prices), leave missing cards alone
//   npm run refresh -- --detail-limit=500
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractChe168ListPayload, extractChe168DetailPayload } from "./lib/che168-parser.mjs";
import { estimateLandedCost } from "../src/pricing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, "runtime", "refresh-report.json");
const FEED_URL = "https://global.che168.com/en/used-cars?vehicle_list=1&fueltype=7";
// The catalog spans three powertrain feeds; each paginates on its own.
const FUEL_TYPES = [7, 5, 6];
const USD_TO_CNY = 7.15;
// Day-to-day the source re-quotes yuan prices in dollars at the current rate,
// which moves almost every card by $10–20. Those wiggles are noise: they would
// rewrite the whole catalog and flood price_history daily. Only a move of at
// least this many dollars counts as a real re-pricing.
const PRICE_STEP_USD = 100;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const dryRun = args.get("dry-run") === "true";
const skipDetail = args.get("skip-detail") === "true";
const detailLimit = Number(args.get("detail-limit") || Infinity);
const concurrency = Number(args.get("concurrency") || 4);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const startedAt = Date.now();
const asFlightScript = (text) => `[1,${JSON.stringify(text)}])`;

// Same in-page fetch as import-v2: the request must run inside the challenged
// page so it carries the anti-bot cookies. 429 and the quieter empty-shell
// throttle answer are both retried against the marker the caller expects.
async function flight(page, url, expectMarker) {
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

const listUrl = (fuelType, pageIndex) =>
  `/en/used-cars?fueltype=${fuelType}&vehicle_list=1${pageIndex > 1 ? `&page=${pageIndex}` : ""}&_rsc=rf${fuelType}p${pageIndex}`;

const { pool } = await import("../server/db.mjs");
const { rows } = await pool.query(`SELECT id, external_id, price_cny, estimated_total_usd,
    (source_payload->>'usdPrice')::numeric AS usd_price,
    (source_payload->>'year')::int AS year,
    source_payload->>'type' AS type,
    source_payload->>'engine' AS engine,
    title
  FROM listings WHERE source='Che168' AND status='active'`);
console.log(`[db] ${rows.length} active Che168 listings`);

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
const page = await context.newPage();

const seenPrices = new Map(); // externalId -> current USD price on the source
let listPages = 0;
let listPagesEmpty = 0;

async function sweepLists() {
  const queue = [];
  for (const fuelType of FUEL_TYPES) {
    const { text } = await flight(page, listUrl(fuelType, 1), "infoid");
    const payload = extractChe168ListPayload([asFlightScript(text)]);
    if (!payload?.pageCount) throw new Error(`feed ${fuelType}: first list page did not parse`);
    for (let pageIndex = 1; pageIndex <= payload.pageCount; pageIndex += 1) queue.push({ fuelType, pageIndex });
    console.log(`[feed] fueltype=${fuelType}: ${payload.totalCount} cars, ${payload.pageCount} pages`);
  }
  const total = queue.length;
  const worker = async () => {
    while (queue.length) {
      const { fuelType, pageIndex } = queue.shift();
      const { status, text } = await flight(page, listUrl(fuelType, pageIndex), "infoid");
      const payload = status === 200 && text ? extractChe168ListPayload([asFlightScript(text)]) : null;
      if (!payload?.items?.length) listPagesEmpty += 1;
      else for (const item of payload.items) {
        const id = String(item.infoid || "");
        const price = Number(String(item.price).replace(/[^\d.]/g, "")) || null;
        if (id && price && !seenPrices.has(id)) seenPrices.set(id, price);
      }
      listPages += 1;
      if (listPages % 200 === 0) console.log(`[lists] ${listPages}/${total} pages, ${seenPrices.size} cars`);
      await sleep(60);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`[lists] done: ${listPages} pages (${listPagesEmpty} empty), ${seenPrices.size} cars priced`);
}

// A card the lists no longer show gets one detail request. The sold page still
// returns a full ssrCarDetail block — only without a price — so "detail without
// a price" is the positive signal for sold. Anything else (404, no payload
// after retries) stays untouched and is only counted: guessing here would
// either hide a live car or keep advertising a sold one.
async function checkDetail(externalId) {
  const { status, text } = await flight(page, `/en/detail/${externalId}?_rsc=rfd${externalId}`, "ssrCarDetail");
  const payload = status === 200 && text ? extractChe168DetailPayload([asFlightScript(text)]) : null;
  if (!payload?.detail) return { verdict: "unknown", status };
  const price = Number(String(payload.detail.price ?? "").replace(/[^\d.]/g, "")) || null;
  return price ? { verdict: "alive", price } : { verdict: "sold" };
}

const landedTotal = (row, usd) => estimateLandedCost({
  source: "Che168",
  usdPrice: usd,
  chinaPrice: Math.round((usd * USD_TO_CNY) / 100) * 100,
  year: row.year,
  type: row.type,
  engine: row.engine,
}).totalUsd;

try {
  await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 60_000 });
  console.log("[browser] challenge passed");

  await sweepLists();

  const priceUpdates = []; // real re-pricings: new price + landed estimate + history point
  const estimateUpdates = []; // price unchanged, but the stored landed estimate drifted
  const touchIds = []; // seen and unchanged: just record the sighting
  const soldIds = [];
  const missing = [];
  let unknown = 0;

  const classify = (row, liveUsd) => {
    const oldUsd = Number(row.usd_price) || 0;
    if (liveUsd && oldUsd && Math.abs(liveUsd - oldUsd) >= PRICE_STEP_USD) {
      const est = landedTotal(row, liveUsd);
      priceUpdates.push({
        id: row.id,
        usd: liveUsd,
        cny: Math.round((liveUsd * USD_TO_CNY) / 100) * 100,
        est: Number.isFinite(est) ? est : Number(row.estimated_total_usd) || null,
        oldUsd,
        title: row.title,
      });
      return;
    }
    const usd = oldUsd || liveUsd;
    const est = usd ? landedTotal(row, usd) : null;
    if (Number.isFinite(est) && Math.abs(est - Number(row.estimated_total_usd || 0)) >= 1) estimateUpdates.push({ id: row.id, est });
    else touchIds.push(row.id);
  };

  for (const row of rows) {
    const liveUsd = seenPrices.get(String(row.external_id));
    if (liveUsd) classify(row, liveUsd);
    else missing.push(row);
  }
  console.log(`[match] ${rows.length - missing.length} in lists · ${priceUpdates.length} re-priced · ${missing.length} need a detail check`);

  if (!skipDetail) {
    const queue = missing.slice(0, detailLimit);
    const skipped = missing.length - queue.length;
    if (skipped > 0) console.log(`[detail] --detail-limit: ${skipped} of ${missing.length} missing cards left for the next run`);
    let checked = 0;
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift();
        const result = await checkDetail(row.external_id);
        if (result.verdict === "sold") soldIds.push(row.id);
        else if (result.verdict === "alive") classify(row, result.price);
        else unknown += 1;
        checked += 1;
        if (checked % 200 === 0) console.log(`[detail] ${checked} checked · ${soldIds.length} sold · ${unknown} no answer · ${Math.round((Date.now() - startedAt) / 60000)}min`);
        await sleep(60);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(`[detail] done: ${checked} checked, ${soldIds.length} sold, ${unknown} without a clear answer`);
  }

  const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

  if (!dryRun) {
    for (const batch of chunk(priceUpdates, 1000)) {
      await pool.query(`UPDATE listings l SET price_cny=v.cny, estimated_total_usd=v.est,
          source_payload = l.source_payload || jsonb_build_object('usdPrice', v.usd, 'sourcePriceUsd', v.usd, 'chinaPrice', v.cny),
          last_seen_at=now(), last_checked_at=now()
        FROM jsonb_to_recordset($1::jsonb) AS v(id text, cny integer, usd numeric, est numeric)
        WHERE l.id = v.id`, [JSON.stringify(batch.map(({ id, cny, usd, est }) => ({ id, cny, usd, est })))]);
      await pool.query(`INSERT INTO price_history (listing_id, observed_at, price_cny)
        SELECT v.id, now(), v.cny FROM jsonb_to_recordset($1::jsonb) AS v(id text, cny integer)
        ON CONFLICT DO NOTHING`, [JSON.stringify(batch.map(({ id, cny }) => ({ id, cny })))]);
    }
    for (const batch of chunk(estimateUpdates, 2000)) {
      await pool.query(`UPDATE listings l SET estimated_total_usd=v.est, last_seen_at=now(), last_checked_at=now()
        FROM jsonb_to_recordset($1::jsonb) AS v(id text, est numeric) WHERE l.id = v.id`, [JSON.stringify(batch)]);
    }
    for (const batch of chunk(touchIds, 5000)) {
      await pool.query(`UPDATE listings SET last_seen_at=now(), last_checked_at=now() WHERE id = ANY($1::text[])`, [batch]);
    }
    for (const batch of chunk(soldIds, 5000)) {
      await pool.query(`UPDATE listings SET status='unavailable', last_checked_at=now() WHERE id = ANY($1::text[])`, [batch]);
    }
  }

  const drops = priceUpdates.filter((u) => u.usd < u.oldUsd);
  const report = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    minutes: Math.round((Date.now() - startedAt) / 6000) / 10,
    dryRun,
    activeBefore: rows.length,
    listPages,
    listPagesEmpty,
    pricedByLists: seenPrices.size,
    rePriced: priceUpdates.length,
    priceDrops: drops.length,
    priceRises: priceUpdates.length - drops.length,
    estimateOnly: estimateUpdates.length,
    unchanged: touchIds.length,
    detailChecked: skipDetail ? 0 : Math.min(missing.length, detailLimit),
    sold: soldIds.length,
    noAnswer: unknown,
    biggestDrops: [...drops].sort((a, b) => (a.usd - a.oldUsd) - (b.usd - b.oldUsd)).slice(0, 10)
      .map(({ id, title, oldUsd, usd }) => ({ id, title, oldUsd, usd })),
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify({ ...report, priceUpdates: priceUpdates.map(({ id, title, oldUsd, usd }) => ({ id, title, oldUsd, usd })) }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await pool.end();
}

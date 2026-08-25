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
// The run starts with a priority pass: cards visitors opened in the last 30
// days (view/availability/favorite events, top 300) get a detail check and a
// database write first, so the cars people care about are fresh within minutes
// even if the rest of the run is interrupted. --skip-detail skips this pass too.
//
// Usage:
//   npm run refresh                     # full run: priority pass + lists + detail checks + writes
//   npm run refresh -- --dry-run       # measure only, no database writes
//   npm run refresh -- --skip-detail   # lists only (prices), leave missing cards alone
//   npm run refresh -- --detail-limit=500
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractChe168ListPayload, extractChe168DetailPayload } from "./lib/che168-parser.mjs";
import { discoveryCandidate } from "./lib/che168-discovery.mjs";
import { estimateLandedCost } from "../src/pricing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, "runtime", "refresh-report.json");
// Машины источника, которых у нас нет: обход списков всё равно проходит мимо
// каждой, так что находки достаются даром. Отсюда их забирает пополнение вместо
// собственного обхода — см. `scripts/lib/che168-discovery.mjs`.
const DISCOVERIES_PATH = path.join(ROOT, "runtime", "che168-discoveries.json");
const FEED_URL = "https://global.che168.com/en/used-cars?vehicle_list=1&fueltype=7";
// The catalog spans four powertrain feeds; each paginates on its own. Feed 1 is
// the petrol one and it is by far the largest (~181k cars, ~7.5k pages, about
// twenty extra minutes). It has to be walked all the same: a card missing from
// every feed goes to the detail queue, so leaving petrol out would send tens of
// thousands of perfectly live cards there every night — and none of them would
// ever get a price update from the lists.
const FUEL_TYPES = [7, 5, 6, 1];
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
      // Сорванное соединение — обычное дело на длинном прогоне. Раньше такая
      // ошибка выбрасывалась наружу и роняла весь скрипт вместе с несохранёнными
      // результатами; теперь это просто ещё одна попытка.
      let response;
      try {
        response = await fetch(target, { credentials: "include", headers: { RSC: "1" } });
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        continue;
      }
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
    source_payload->>'sourceFuelType' AS fuel_type,
    source_payload->>'transmission' AS transmission,
    source_payload->>'manufactureDate' AS manufacture_date,
    source_payload->>'city' AS city,
    source_payload->>'dimensions' AS dimensions,
    (source_payload->>'curbWeight')::numeric AS curb_weight,
    title
  FROM listings WHERE source='Che168' AND status='active'`);
console.log(`[db] ${rows.length} active Che168 listings`);

// Все наши идентификаторы, вместе с проданными: машина, снятая с витрины, иногда
// ещё мелькает в списках, и без этого списка находки предлагали бы качать её
// каждую ночь заново.
const { rows: knownRows } = await pool.query(`SELECT id FROM listings WHERE source='Che168'`);
const knownIds = new Set(knownRows.map((row) => row.id));

// Cards visitors actually opened in the last month jump the queue: each gets a
// detail-page check and a database write before the list sweep even starts, so
// the cars people look at are fresh within the first minutes of a run.
const { rows: popular } = await pool.query(`SELECT listing_id, count(*)::int AS views
  FROM analytics_events
  WHERE listing_id IS NOT NULL
    AND created_at >= now() - interval '30 days'
    AND event_name IN ('vehicle_view','availability_click','favorite_added')
  GROUP BY listing_id ORDER BY views DESC LIMIT 300`);
const activeById = new Map(rows.map((row) => [row.id, row]));
const popularRows = popular.map((p) => activeById.get(p.listing_id)).filter(Boolean);

const browser = await chromium.launch();
const context = await browser.newContext({
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
});
const page = await context.newPage();

const seenPrices = new Map(); // externalId -> current USD price on the source
const discoveries = new Map(); // externalId -> кандидат на скачивание, см. lib/che168-discovery.mjs
let discoveriesSkipped = 0; // машины источника, которых у нас нет и которые не проходят правила
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
        // Незнакомая машина попадается здесь бесплатно — страница всё равно
        // прочитана ради цен. Отбор идёт по списку, окончательное решение
        // остаётся за карточкой при скачивании.
        if (id && !knownIds.has(`che168-${id}`) && !discoveries.has(id)) {
          const candidate = discoveryCandidate(item, { fuelType, knownIds });
          if (candidate) discoveries.set(id, candidate);
          else discoveriesSkipped += 1;
        }
      }
      listPages += 1;
      if (listPages % 200 === 0) console.log(`[lists] ${listPages}/${total} pages, ${seenPrices.size} cars, ${discoveries.size} new`);
      await sleep(60);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(`[lists] done: ${listPages} pages (${listPagesEmpty} empty), ${seenPrices.size} cars priced`);
  console.log(`[new] ${discoveries.size} машин источника нам подходят и ещё не заведены (${discoveriesSkipped} мимо правил)`);
}

// Находки переживают прогон в файле: пополнение запускается отдельной службой
// через час. Пустой список тоже записываем — иначе пополнение возьмёт вчерашний
// файл и полезет за машинами, которые уже завело.
async function writeDiscoveries() {
  const payload = {
    generatedAt: new Date().toISOString(),
    feeds: FUEL_TYPES,
    catalogKnown: knownIds.size,
    skippedByPolicy: discoveriesSkipped,
    items: [...discoveries.values()],
  };
  await fs.mkdir(path.dirname(DISCOVERIES_PATH), { recursive: true });
  await fs.writeFile(DISCOVERIES_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[new] записано в ${path.relative(ROOT, DISCOVERIES_PATH)}: ${payload.items.length}`);
}

// A card the lists no longer show gets one detail request. The sold page still
// returns a full ssrCarDetail block — only without a price — so "detail without
// a price" is the positive signal for sold. Anything else (404, no payload
// after retries) stays untouched and is only counted: guessing here would
// either hide a live car or keep advertising a sold one.
async function checkDetail(externalId) {
  let status = 0;
  let text = "";
  try {
    ({ status, text } = await flight(page, `/en/detail/${externalId}?_rsc=rfd${externalId}`, "ssrCarDetail"));
  } catch {
    // Ни одна сетевая ошибка не должна прерывать прогон: машина уходит в
    // «без ответа» и остаётся на витрине нетронутой до следующего раза.
    return { verdict: "unknown", status: 0 };
  }
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
  // Без этих полей расчёт не узнает гибрид с генератором и не увидит настоящий
  // возраст машины — и переписал бы цену по старым правилам.
  sourceFuelType: row.fuel_type,
  transmission: row.transmission,
  manufactureDate: row.manufacture_date,
  city: row.city,
  dimensions: row.dimensions,
  curbWeight: row.curb_weight,
}).totalUsd;

try {
  await page.goto(FEED_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll("[data-uc-car-card]").length > 0, null, { timeout: 60_000 });
  console.log("[browser] challenge passed");

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

  const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

  // Totals survive across flushes; the working arrays are drained by each one.
  const stats = { rePriced: 0, priceUpdates: [], drops: [], estimateOnly: 0, unchanged: 0, sold: 0 };
  const flushWrites = async () => {
    // Снимок делаем синхронно: пока идёт запись, воркеры продолжают складывать
    // сюда новые машины, и без снимка очистка в конце потеряла бы их.
    const prices = priceUpdates.splice(0);
    const estimates = estimateUpdates.splice(0);
    const touches = touchIds.splice(0);
    const sold = soldIds.splice(0);
    if (!dryRun) {
      for (const batch of chunk(prices, 1000)) {
        // `content_changed_at` — дата настоящего изменения объявления, её берёт карта
        // сайта. Двигаем её только здесь: цена у продавца действительно изменилась.
        // Ниже, где меняется лишь наш расчёт (курс сдвинулся), дату не трогаем — иначе
        // она станет одинаковой у всего каталога и снова перестанет что-то значить.
        // `previous_price_usd` и `price_changed_at` — для стрелки изменения цены на
        // карточке: карточка показывает прошлую цену и дату в подсказке. Прошлую
        // цену пишем в долларах, как её отдал источник, без пересчёта через юани.
        await pool.query(`UPDATE listings l SET price_cny=v.cny, estimated_total_usd=v.est,
            source_payload = l.source_payload || jsonb_build_object('usdPrice', v.usd, 'sourcePriceUsd', v.usd, 'chinaPrice', v.cny),
            previous_price_usd=v.old_usd, price_changed_at=now(),
            last_seen_at=now(), last_checked_at=now(), content_changed_at=now()
          FROM jsonb_to_recordset($1::jsonb) AS v(id text, cny integer, usd numeric, est numeric, old_usd numeric)
          WHERE l.id = v.id`, [JSON.stringify(batch.map(({ id, cny, usd, est, oldUsd }) => ({ id, cny, usd, est, old_usd: oldUsd })))]);
        await pool.query(`INSERT INTO price_history (listing_id, observed_at, price_cny)
          SELECT v.id, now(), v.cny FROM jsonb_to_recordset($1::jsonb) AS v(id text, cny integer)
          ON CONFLICT DO NOTHING`, [JSON.stringify(batch.map(({ id, cny }) => ({ id, cny })))]);
      }
      for (const batch of chunk(estimates, 2000)) {
        await pool.query(`UPDATE listings l SET estimated_total_usd=v.est, last_seen_at=now(), last_checked_at=now()
          FROM jsonb_to_recordset($1::jsonb) AS v(id text, est numeric) WHERE l.id = v.id`, [JSON.stringify(batch)]);
      }
      for (const batch of chunk(touches, 5000)) {
        await pool.query(`UPDATE listings SET last_seen_at=now(), last_checked_at=now() WHERE id = ANY($1::text[])`, [batch]);
      }
      for (const batch of chunk(sold, 5000)) {
        await pool.query(`UPDATE listings SET status='unavailable', last_checked_at=now() WHERE id = ANY($1::text[])`, [batch]);
      }
    }
    stats.rePriced += prices.length;
    stats.priceUpdates.push(...prices);
    stats.drops.push(...prices.filter((u) => u.usd < u.oldUsd));
    stats.estimateOnly += estimates.length;
    stats.unchanged += touches.length;
    stats.sold += sold.length;
  };

  // Priority pass: the cars visitors opened get their authoritative detail
  // check and a write immediately, before the ~6-minute list walk begins.
  const prioritized = new Set();
  if (!skipDetail && popularRows.length) {
    console.log(`[priority] ${popularRows.length} visitor-viewed cars go first`);
    const queue = [...popularRows];
    const worker = async () => {
      while (queue.length) {
        const row = queue.shift();
        const result = await checkDetail(row.external_id);
        if (result.verdict === "sold") soldIds.push(row.id);
        else if (result.verdict === "alive") classify(row, result.price);
        else unknown += 1;
        prioritized.add(row.id);
        await sleep(60);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(`[priority] done: ${prioritized.size} checked · ${soldIds.length} sold · ${priceUpdates.length} re-priced`);
    await flushWrites();
  }

  await sweepLists();
  // Записываем сразу после обхода, до долгой проверки пропавших карточек: если
  // прогон оборвётся на ней, находки уже лежат на диске и пополнение их получит.
  if (!dryRun) await writeDiscoveries();

  for (const row of rows) {
    if (prioritized.has(row.id)) continue;
    const liveUsd = seenPrices.get(String(row.external_id));
    if (liveUsd) classify(row, liveUsd);
    else missing.push(row);
  }
  console.log(`[match] ${rows.length - prioritized.size - missing.length} in lists · ${priceUpdates.length} re-priced · ${missing.length} need a detail check`);
  // Всё, что списки подтвердили, записываем сразу — до долгой детальной фазы.
  await flushWrites();

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
        if (checked % 200 === 0) console.log(`[detail] ${checked} checked · ${stats.sold + soldIds.length} sold · ${unknown} no answer · ${Math.round((Date.now() - startedAt) / 60000)}min`);
        // Пишем по ходу дела: прогон длинный, и прерванный на середине он должен
        // оставить в базе всё, что успел проверить, а не выбросить результат.
        if (checked % 1000 === 0) await flushWrites();
        await sleep(60);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log(`[detail] done: ${checked} checked, ${soldIds.length} sold, ${unknown} without a clear answer`);
  }

  await flushWrites();

  // Проданная машина уходит и из избранного: каталог её больше не показывает, и в
  // личном кабинете она висела бы карточкой, которую уже нельзя открыть. Чистим не
  // только помеченные этим прогоном, а всё избранное с неживыми объявлениями —
  // состояние снимает и `db:expire`, а до этого места чистка не доходила.
  // Заказы не трогаем: по ним человек уже общается с нами, там машина должна остаться.
  const favoritesCleared = dryRun ? 0 : (await pool.query(`DELETE FROM customer_favorites f
    USING listings l WHERE l.id = f.listing_id AND l.status <> 'active'`)).rowCount;
  if (favoritesCleared) console.log(`[favorites] ${favoritesCleared} saved cards removed: their listings are gone`);

  const drops = stats.drops;
  const report = {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    minutes: Math.round((Date.now() - startedAt) / 6000) / 10,
    dryRun,
    activeBefore: rows.length,
    listPages,
    listPagesEmpty,
    pricedByLists: seenPrices.size,
    discovered: discoveries.size,
    discoveriesSkipped,
    prioritized: prioritized.size,
    rePriced: stats.rePriced,
    priceDrops: drops.length,
    priceRises: stats.rePriced - drops.length,
    estimateOnly: stats.estimateOnly,
    unchanged: stats.unchanged,
    detailChecked: skipDetail ? 0 : prioritized.size + Math.min(missing.length, detailLimit),
    sold: stats.sold,
    noAnswer: unknown,
    favoritesCleared,
    biggestDrops: [...drops].sort((a, b) => (a.usd - a.oldUsd) - (b.usd - b.oldUsd)).slice(0, 10)
      .map(({ id, title, oldUsd, usd }) => ({ id, title, oldUsd, usd })),
  };
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify({ ...report, priceUpdates: stats.priceUpdates.map(({ id, title, oldUsd, usd }) => ({ id, title, oldUsd, usd })) }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await pool.end();
}

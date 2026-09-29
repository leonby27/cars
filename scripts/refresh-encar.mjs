// Актуализация корейских машин (Encar): цены, наличие, находки для пополнения.
//
// Один проход по спискам площадки (те же срезы, что у пополнения) даёт номер и
// цену каждой живой машины. Дальше три ветки для наших активных объявлений:
//   • видели, цена та же   — отмечаем «проверена сегодня» пачкой;
//   • видели, цена другая  — перечитываем карточку и переписываем (стрелка цены);
//   • не видели            — проверяем карточку: 404 или статус не ADVERTISE —
//                            продана; иначе переписываем (переехала в другой срез).
// Всё незнакомое и подходящее складывается в runtime/encar-discoveries.json —
// пополнение берёт его через `--discoveries` и не обходит списки второй раз.
//
// Отсутствие в списке само по себе не значит «продана» — только карточка. Это
// правило Che168 (память che168-fake-wall-sold-pages), здесь оно то же.
//
//   npm run refresh:encar                    полный проход
//   npm run refresh:encar -- --brands=Hyundai --detail-limit=200
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EncarClient, EncarGeoBlockedError } from "./lib/encar-client.mjs";
import { ENCAR_MANUFACTURERS } from "./lib/encar-parser.mjs";
import { canonicalImportBrand, importPolicyViolation } from "../config/import-policy.mjs";
import { sourceUsdRate } from "../src/pricing.js";
import { pool } from "../server/db.mjs";
import { upsertCar } from "../server/repository.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, "runtime", "encar-refresh-report.json");
const DISCOVERIES_PATH = path.join(ROOT, "runtime", "encar-discoveries.json");

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const pace = Number(args.get("pace") || 300);
const concurrency = Math.max(1, Number(args.get("concurrency") || 2));
const brandFilter = args.get("brands")?.split(",").map((brand) => canonicalImportBrand(brand.trim())).filter(Boolean) || null;
const yearFrom = Number(args.get("year-from") || 2020);
// Сколько карточек «не видели в списке» проверять за прогон; 0 — все.
const detailLimit = Number(args.get("detail-limit") || 0);
const maxMinutes = Number(args.get("max-minutes") || 0);
const deadline = maxMinutes > 0 ? Date.now() + maxMinutes * 60_000 : Infinity;
const outOfTime = () => Date.now() >= deadline;
const dryRun = args.get("dry") === "true";

const usdPerKrw = sourceUsdRate("KRW");
const brands = Object.keys(ENCAR_MANUFACTURERS).filter((brand) => !brandFilter || brandFilter.includes(brand));
const startedAt = new Date().toISOString();
const log = (line) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const client = new EncarClient({ pace, log });

const summary = { startedAt, brands, active: 0, seenSamePrice: 0, priceChanged: 0, rewritten: 0, unseen: 0, sold: 0, stillAlive: 0, unknown: 0, discoveries: 0, requests: 0, errors: [] };

try {
  // Активные корейские объявления с ценой в вонах.
  const { rows } = await pool.query("SELECT id, external_id, price_cny FROM listings WHERE source='Encar' AND status='active'");
  const active = new Map(rows.map((row) => [String(row.external_id), { id: row.id, won: Number(row.price_cny) }]));
  const known = new Set((await pool.query("SELECT external_id FROM listings WHERE source='Encar'")).rows.map((row) => String(row.external_id)));
  summary.active = active.size;
  log(`[refresh] активных корейских машин ${active.size}, всего известных ${known.size}`);

  // Проход по спискам: цена каждой живой машины и находки.
  const seenPrice = new Map();
  const discoveries = new Map();
  const stats = await client.walk({
    brands, yearFrom, minYear: yearFrom,
    onItem: (candidate) => {
      const won = candidate.priceMan ? Math.round(candidate.priceMan * 10_000) : null;
      seenPrice.set(candidate.externalId, won);
      if (!known.has(candidate.externalId) && !discoveries.has(candidate.externalId)) {
        discoveries.set(candidate.externalId, { externalId: candidate.externalId, year: candidate.year, type: candidate.type, priceMan: candidate.priceMan, brand: canonicalImportBrand(candidate.manufacturer), modelGroup: candidate.modelGroup });
      }
    },
    onSlice: ({ label, total, items }) => log(`[list] ${label}: ${items} из ${total}`),
    stop: outOfTime,
  });
  summary.walk = stats;
  summary.discoveries = discoveries.size;
  await fs.mkdir(path.dirname(DISCOVERIES_PATH), { recursive: true });
  await fs.writeFile(DISCOVERIES_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), source: "Encar", yearFrom, items: [...discoveries.values()] }, null, 2)}\n`);
  log(`[walk] в списках ${seenPrice.size} машин, находок ${discoveries.size}`);

  // Ветки для активных объявлений.
  const samePrice = [];
  const changed = [];
  const unseen = [];
  for (const [externalId, listing] of active) {
    if (!seenPrice.has(externalId)) { unseen.push(externalId); continue; }
    const won = seenPrice.get(externalId);
    if (won === null || Math.abs(won - listing.won) < 10_000) samePrice.push(listing.id);
    else changed.push(externalId);
  }
  summary.seenSamePrice = samePrice.length;
  summary.priceChanged = changed.length;
  summary.unseen = unseen.length;
  log(`[refresh] цена та же ${samePrice.length} · цена изменилась ${changed.length} · не в списках ${unseen.length}`);

  if (!dryRun && samePrice.length) {
    for (let offset = 0; offset < samePrice.length; offset += 1000) {
      await pool.query("UPDATE listings SET last_seen_at=now(), last_checked_at=now() WHERE id=ANY($1::text[])", [samePrice.slice(offset, offset + 1000)]);
    }
  }

  const markSold = async (externalId) => {
    summary.sold += 1;
    if (dryRun) return;
    await pool.query("UPDATE listings SET status='unavailable', sold_at=COALESCE(sold_at, now()), last_checked_at=now() WHERE source='Encar' AND external_id=$1", [externalId]);
  };
  const queue = [...changed, ...(detailLimit > 0 ? unseen.slice(0, detailLimit) : unseen)];
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length && !outOfTime()) {
      const externalId = queue[cursor++];
      try {
        const { status, car, detail } = await client.car(externalId, { usdPerKrw, history: true });
        summary.requests = client.requests;
        if (status === 404 || (status === 200 && detail && detail.advertisement?.status && detail.advertisement.status !== "ADVERTISE")) { await markSold(externalId); continue; }
        if (status !== 200) { summary.unknown += 1; continue; }
        if (!car || importPolicyViolation(car)) {
          // Живая, но больше не наша (например, пропали фото): считаем снятой из каталога.
          await markSold(externalId);
          continue;
        }
        summary.stillAlive += 1;
        if (!dryRun) { await upsertCar(car); summary.rewritten += 1; }
      } catch (error) {
        if (error instanceof EncarGeoBlockedError) throw error;
        summary.unknown += 1;
        if (summary.errors.length < 20) summary.errors.push({ externalId, error: String(error.message).slice(0, 120) });
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  summary.requests = client.requests;
  summary.finishedAt = new Date().toISOString();
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  log(`[done] проданы ${summary.sold}, переписаны ${summary.rewritten}, без ответа ${summary.unknown}, находок ${summary.discoveries}, запросов ${summary.requests}`);
} catch (error) {
  summary.fatal = error.message;
  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(summary, null, 2)}\n`).catch(() => {});
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => {});
}

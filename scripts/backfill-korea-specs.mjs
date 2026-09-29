// Дописать характеристики из справочника уже заведённым корейским машинам.
//
// Без сети к площадке: запись машины лежит в базе целиком (source_payload), к ней
// применяется тот же справочник, что и при импорте (scripts/lib/korea-specs.mjs), и
// машина переписывается через обычную запись каталога — цена и история не трогаются.
//
//   npm run db:korea-specs                 все активные корейские машины без мощности
//   npm run db:korea-specs -- --all        и те, у которых мощность уже есть (пересчёт)
//   npm run db:korea-specs -- --dry-run    только посчитать, ничего не писать
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadKoreaSpecs, matchKoreaSpec, applyKoreaSpecs } from "./lib/korea-specs.mjs";
import { pool } from "../server/db.mjs";
import { upsertCar } from "../server/repository.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const all = process.argv.includes("--all");
const dryRun = process.argv.includes("--dry-run");
const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] || 0);

const catalog = await loadKoreaSpecs(path.join(ROOT, "config", "korea-specs"));
console.log(`[specs] справочник: марок ${Object.keys(catalog).length}`);
const { rows } = await pool.query(`SELECT id, source_payload FROM listings WHERE source='Encar' AND status='active'
  ${all ? "" : "AND NULLIF(source_payload->>'horsepower','') IS NULL"} ORDER BY first_seen_at DESC ${limit ? `LIMIT ${limit}` : ""}`);
console.log(`[specs] машин к обработке: ${rows.length}`);
const stats = { matched: 0, exact: 0, unmatched: 0, written: 0, byBrand: {} };
const misses = new Map();
try {
  for (const row of rows) {
    const car = row.source_payload;
    if (!car || typeof car !== "object") continue;
    const match = matchKoreaSpec(car, catalog);
    const key = `${car.brand} ${car.model}`;
    if (!match) { stats.unmatched += 1; misses.set(key, (misses.get(key) || 0) + 1); continue; }
    stats.matched += 1;
    if (match.exact) stats.exact += 1;
    stats.byBrand[car.brand] = (stats.byBrand[car.brand] || 0) + 1;
    if (dryRun) continue;
    // Прежняя техкарта площадки (опции, осмотр) остаётся: applyKoreaSpecs добавляет свои группы к ней.
    const next = applyKoreaSpecs({ ...car, horsepower: null, torqueNm: null, acceleration: null, dimensions: null, curbWeight: null, engine: car.engineCc ? `${(car.engineCc / 1000).toFixed(1)}L` : car.engine }, catalog);
    await upsertCar(next);
    stats.written += 1;
  }
  console.log(JSON.stringify({ ...stats, topMisses: [...misses].sort((a, b) => b[1] - a[1]).slice(0, 25) }, null, 2));
} finally {
  await pool.end().catch(() => {});
}

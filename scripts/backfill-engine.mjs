// Достаёт объём двигателя из технических характеристик и кладёт его в поля, по
// которым считается пошлина.
//
// Импорт до 23 августа 2026 года объём не сохранял, и расчёт подставлял всем
// гибридам 1,5 литра. Ставка за кубический сантиметр растёт ступенями, поэтому у
// машин с мотором 2,0 литра и больше цена выходила заниженной. Сама строка вида
// «2.0T 184HP L4» в характеристиках лежала всё это время — её и переносим.
//
// Запуск: node scripts/backfill-engine.mjs (или npm run db:engine)
// С «--dry» ничего не пишет, только считает.
//
// Прогонять заново после каждого `npm run db:import` из старого дампа: он
// перезаписывает характеристики машин целиком и объём снова обнуляется.
import { pool } from "../server/db.mjs";

const dryRun = process.argv.includes("--dry");

// «1.5T 156HP L4», «2.0L 184 horsepower», «4.4T» — берём только объём в литрах.
const displacement = (text) => {
  const match = String(text || "").match(/(\d(?:\.\d)?)\s*[LT]/i);
  const litres = match ? Number(match[1]) : null;
  return litres >= 0.5 && litres <= 8 ? match[0].trim() : null;
};

const { rows } = await pool.query(`SELECT l.id, l.vehicle_id,
    (SELECT item->>'value' FROM jsonb_array_elements(l.source_payload->'technicalSpecs'->'groups') g,
            jsonb_array_elements(g->'items') item WHERE item->>'name' = 'Engine' LIMIT 1) AS engine_raw,
    l.source_payload->>'engine' AS engine_now,
    v.specifications->>'engine' AS engine_spec
  FROM listings l JOIN vehicles v ON v.id = l.vehicle_id`);
console.log(`[db] ${rows.length} объявлений`);

const updates = [];
let withoutSize = 0;
for (const row of rows) {
  const engine = displacement(row.engine_raw);
  if (!engine) { withoutSize++; continue; }
  if (row.engine_now === engine && row.engine_spec === engine) continue;
  updates.push({ id: row.id, vehicleId: row.vehicle_id, engine });
}
console.log(`[расчёт] объём нашёлся и записывается у ${updates.length}, без объёма в характеристиках ${withoutSize}`);
const byLitres = new Map();
for (const item of updates) {
  const litres = item.engine.replace(/[LT]/i, "");
  byLitres.set(litres, (byLitres.get(litres) || 0) + 1);
}
console.log("[расчёт] по объёму:", [...byLitres.entries()].sort((a, b) => b[1] - a[1]).map(([litres, count]) => `${litres} л — ${count}`).join(", "));

if (dryRun) {
  console.log("[dry] в базу ничего не записано");
} else {
  const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
  for (const batch of chunk(updates, 2000)) {
    const payload = JSON.stringify(batch.map(({ id, vehicleId, engine }) => ({ id, vehicleId, engine })));
    await pool.query(`UPDATE listings l
      SET source_payload = l.source_payload || jsonb_build_object('engine', v.engine)
      FROM jsonb_to_recordset($1::jsonb) AS v(id text, engine text) WHERE l.id = v.id`, [payload]);
    await pool.query(`UPDATE vehicles t
      SET specifications = t.specifications || jsonb_build_object('engine', v.engine), updated_at = now()
      FROM jsonb_to_recordset($1::jsonb) AS v("vehicleId" text, engine text) WHERE t.id = v."vehicleId"`, [payload]);
  }
  console.log(`[db] записано ${updates.length}`);
}
await pool.end();

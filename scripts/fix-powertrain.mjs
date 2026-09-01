// Починка типа двигателя у машин, заведённых с русской версии источника.
//
// 31.08.2026 сборщик перешёл на /ru/, а распознавание типа было написано под
// английские слова: «Электромобиль» и «Продлённый запас хода» не совпадали ни с
// одним условием и падали в «ДВС». Настоящий тип при этом сохранён в карточке
// (`sourceFuelType`), так что чинить можно на месте, ничего не скачивая заново.
//
// Тип решает, по какому правилу считается растаможка, поэтому вместе с ним
// пересчитываем и цену под ключ.
import { normalizeChe168Energy } from "./lib/che168-parser.mjs";
import { estimateLandedCost } from "../src/pricing.js";

const dryRun = process.argv.includes("--dry-run");
const { pool } = await import("../server/db.mjs");

const { rows } = await pool.query(`SELECT l.id, v.id AS vehicle_id, v.brand, v.model, v.powertrain, v.model_year,
    l.source_payload, l.estimated_total_usd
  FROM listings l JOIN vehicles v ON v.id = l.vehicle_id
  WHERE l.source = 'Che168' AND l.source_payload->>'sourceFuelType' IS NOT NULL`);
console.log(`[fix] смотрю ${rows.length} машин`);

const changes = [];
for (const row of rows) {
  const payload = row.source_payload || {};
  const rightType = normalizeChe168Energy({ fuelname: payload.sourceFuelType, carname: payload.title || "", specname: "" }, []);
  if (!rightType || rightType === row.powertrain) continue;
  const car = { ...payload, type: rightType, year: row.model_year, brand: row.brand };
  const landed = estimateLandedCost(car)?.totalUsd;
  changes.push({
    id: row.id,
    vehicleId: row.vehicle_id,
    from: row.powertrain,
    to: rightType,
    est: Number.isFinite(landed) ? Math.round(landed) : null,
    oldEst: Number(row.estimated_total_usd) || null,
  });
}

const byPair = new Map();
for (const c of changes) {
  const key = `${c.from} → ${c.to}`;
  byPair.set(key, (byPair.get(key) || 0) + 1);
}
console.log(`[fix] исправить нужно ${changes.length} машин:`);
for (const [pair, count] of [...byPair].sort((a, b) => b[1] - a[1])) console.log(`   ${pair}: ${count}`);
const withPrice = changes.filter((c) => c.est && c.oldEst);
if (withPrice.length) {
  const diff = withPrice.reduce((sum, c) => sum + (c.est - c.oldEst), 0) / withPrice.length;
  console.log(`[fix] цена под ключ в среднем изменится на ${Math.round(diff)} $`);
}

if (dryRun) {
  console.log("[fix] пробный прогон — ничего не меняю");
  await pool.end();
  process.exit(0);
}

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
for (const batch of chunk(changes, 500)) {
  await pool.query(
    `UPDATE vehicles v SET powertrain = x.to_type FROM jsonb_to_recordset($1::jsonb) AS x(vehicle_id text, to_type text) WHERE v.id = x.vehicle_id`,
    [JSON.stringify(batch.map((c) => ({ vehicle_id: c.vehicleId, to_type: c.to })))],
  );
  await pool.query(
    `UPDATE listings l SET estimated_total_usd = x.est,
        source_payload = l.source_payload || jsonb_build_object('type', x.to_type)
      FROM jsonb_to_recordset($1::jsonb) AS x(id text, est numeric, to_type text) WHERE l.id = x.id`,
    [JSON.stringify(batch.filter((c) => c.est).map((c) => ({ id: c.id, est: c.est, to_type: c.to })))],
  );
}
console.log(`[fix] готово: ${changes.length} машин исправлено`);
await pool.end();

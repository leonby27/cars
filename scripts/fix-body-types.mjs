// Пересчитывает тип кузова у машин, которые в базе лежат как «кузов не определён».
//
// Зачем: тип кузова считается при загрузке объявления (src/body-types.js), и машины,
// загруженные до появления нового правила, остаются с прежним значением. Так вышло
// с купе, кабриолетами и пикапами — их значения появились вместе с бензиновым
// каталогом, а к тому времени в базе уже лежало под тысячу таких машин: в фильтре
// их не было, в разделы сайта они не попадали.
//
// Трогаем только «не определён» и пустые: у машин с проставленным кузовом правила
// не менялись, а массовый пересчёт всей базы двигал бы дату изменения объявления
// у всего каталога сразу и сбил бы карту сайта.
//
// Повторный запуск безопасен: то, что и так посчиталось, скрипт не переписывает.
import { normalizeBodyType } from "../src/body-types.js";
import { pool } from "../server/db.mjs";

const UNKNOWN = "Не определён";
const batchSize = 500;

const { rows } = await pool.query(
  `SELECT v.id,
          v.brand,
          v.model,
          v.specifications->>'bodyType' AS body_type,
          v.specifications->>'bodyStructure' AS body_structure,
          v.specifications->>'vehicleClass' AS vehicle_class,
          l.description
     FROM vehicles v
     JOIN listings l ON l.vehicle_id = v.id
    WHERE v.specifications->>'bodyType' IS NULL OR v.specifications->>'bodyType' = $1`,
  [UNKNOWN],
);

const changes = new Map();
for (const row of rows) {
  const bodyType = normalizeBodyType({
    brand: row.brand,
    model: row.model,
    bodyStructure: row.body_structure,
    vehicleClass: row.vehicle_class,
    description: row.description,
  });
  if (!bodyType || bodyType === UNKNOWN || bodyType === row.body_type) continue;
  changes.set(row.id, bodyType);
}

const ids = [...changes.keys()];
for (let offset = 0; offset < ids.length; offset += batchSize) {
  const batch = ids.slice(offset, offset + batchSize);
  await pool.query(
    `UPDATE vehicles v
        SET specifications = jsonb_set(v.specifications, '{bodyType}', to_jsonb(patch.body_type)),
            updated_at = now()
       FROM unnest($1::text[], $2::text[]) AS patch(id, body_type)
      WHERE v.id = patch.id`,
    [batch, batch.map((id) => changes.get(id))],
  );
}

// Копия карточки в объявлении собирается при загрузке и используется расчётами,
// поэтому кузов в ней тоже выравниваем — иначе карточка и фильтр разойдутся.
const patched = await pool.query(
  `UPDATE listings l
      SET source_payload = jsonb_set(l.source_payload, '{bodyType}', to_jsonb(v.specifications->>'bodyType'))
     FROM vehicles v
    WHERE v.id = l.vehicle_id
      AND v.specifications->>'bodyType' IS NOT NULL
      AND l.source_payload->>'bodyType' IS DISTINCT FROM v.specifications->>'bodyType'`,
);

const byType = new Map();
for (const bodyType of changes.values()) byType.set(bodyType, (byType.get(bodyType) || 0) + 1);
const summary = [...byType].sort((a, b) => b[1] - a[1]).map(([bodyType, count]) => `${bodyType}: ${count}`).join(", ");
console.log(`Проверено машин без кузова: ${rows.length}; определено: ${changes.size}${summary ? ` (${summary})` : ""}; выровнено карточек: ${patched.rowCount}`);
process.exit(0);

// Дозаполнение полей для фильтров каталога по уже импортированным машинам.
// Разгон 0–100, наибольший крутящий момент, размер передних шин и диаметр диска
// уже лежат в полной технической карте каждого объявления (source_payload);
// скрипт переносит их в specifications, откуда их читают фильтры и карточки.
// Только добавляет ключи — существующие значения specifications не трогает.
// Повторный запуск безопасен: перезаписывает те же ключи теми же значениями.
import { pool } from "../server/db.mjs";

const numberPattern = "^[0-9]+(\\.[0-9]+)?$";

const result = await pool.query(
  `WITH extracted AS (
    SELECT l.vehicle_id AS id,
      COALESCE(
        max(CASE WHEN item->>'name' = 'Official 0-100km/h acceleration (s)' AND item->>'value' ~ $1 THEN (item->>'value')::numeric END),
        max(CASE WHEN item->>'name' = 'Measured 0-100km/h acceleration (s)' AND item->>'value' ~ $1 THEN (item->>'value')::numeric END)
      ) AS accel,
      max(CASE WHEN item->>'name' IN ('Max Torque (N·m)', 'Total Motor Torque (N·m)', 'System Combined Torque (N·m)') AND item->>'value' ~ $1 THEN (item->>'value')::numeric END) AS torque,
      max(CASE WHEN item->>'name' = 'Front Tire Specification' AND item->>'value' <> '--' THEN item->>'value' END) AS tire
    FROM listings l,
      jsonb_array_elements(l.source_payload->'technicalSpecs'->'groups') AS g,
      jsonb_array_elements(g->'items') AS item
    WHERE l.source = 'Che168'
    GROUP BY l.vehicle_id
  )
  UPDATE vehicles v
  SET specifications = v.specifications || jsonb_strip_nulls(jsonb_build_object(
        'acceleration', e.accel,
        'torqueNm', e.torque,
        'tireSizeFront', e.tire,
        'tireRim', (regexp_match(e.tire, 'R\\s*([0-9]{2})'))[1]::numeric
      )),
      updated_at = now()
  FROM extracted e
  WHERE e.id = v.id`,
  [numberPattern],
);

const coverage = await pool.query(`SELECT count(*)::int total,
    count(*) FILTER (WHERE specifications ? 'acceleration')::int accel,
    count(*) FILTER (WHERE specifications ? 'torqueNm')::int torque,
    count(*) FILTER (WHERE specifications ? 'tireRim')::int tire
  FROM vehicles`);

console.log(`Обновлено машин: ${result.rowCount}`);
console.log(`Покрытие: разгон ${coverage.rows[0].accel}, момент ${coverage.rows[0].torque}, шины ${coverage.rows[0].tire} из ${coverage.rows[0].total}`);
await pool.end();

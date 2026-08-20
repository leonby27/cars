// Прогоняет уже загруженный каталог через словарь канонических названий моделей
// (config/import-policy.mjs). Новые импорты получают чистые имена сами, этот
// скрипт выравнивает то, что попало в базу до появления словаря. Повторный
// запуск безопасен: машины с каноническими именами он не трогает.
import { canonicalImportModel } from "../config/import-policy.mjs";
import { pool } from "../server/db.mjs";

const { rows: models } = await pool.query("SELECT brand, model, count(*)::int AS n FROM vehicles GROUP BY 1, 2 ORDER BY 1, 2");

let renamedVehicles = 0;
for (const { brand, model, n } of models) {
  const canonical = canonicalImportModel(brand, model);
  if (canonical === model) continue;
  await pool.query("UPDATE vehicles SET model=$3, updated_at=now() WHERE brand=$1 AND model=$2", [brand, model, canonical]);
  renamedVehicles += n;
  console.log(`${brand}: "${model}" -> "${canonical}" (${n})`);
}

// Заголовок и копия карточки в payload собираются из vehicles при чтении, но в
// базе они тоже должны совпадать — ими пользуются отчёты обновления цен.
const patched = await pool.query(`
  UPDATE listings l SET
    title = v.brand || ' ' || v.model || ' ' || v.model_year,
    source_payload = jsonb_set(jsonb_set(l.source_payload, '{model}', to_jsonb(v.model)), '{title}', to_jsonb(v.brand || ' ' || v.model || ' ' || v.model_year::text))
  FROM vehicles v
  WHERE v.id = l.vehicle_id
    AND (l.source_payload->>'model' IS DISTINCT FROM v.model OR l.title IS DISTINCT FROM v.brand || ' ' || v.model || ' ' || v.model_year)`);

// Единственная машина «Toyota bz7» в марке ORA — ошибка источника: по размерам
// и характеристикам это не bZ7, чья это карточка на самом деле — неизвестно.
const hidden = await pool.query(`
  UPDATE listings l SET status='unavailable'
  FROM vehicles v
  WHERE v.id = l.vehicle_id AND v.brand = 'ORA' AND v.model = 'Toyota bz7' AND l.status = 'active'`);

console.log(`Переименовано машин: ${renamedVehicles}; выровнено карточек: ${patched.rowCount}; скрыто мусорных: ${hidden.rowCount}`);
process.exit(0);

// Прогоняет уже загруженный каталог через словарь названий: канонические имена
// моделей (config/import-policy.mjs) и беларуские названия вместо китайских
// (config/model-names-by.mjs). Новые импорты получают правильные имена сами, этот
// скрипт выравнивает то, что попало в базу раньше. Повторный запуск безопасен:
// машины с правильными именами он не трогает.
//
// Марка меняется вместе с моделью: 银河E5 в Беларуси продают как Geely EX5 — без
// приставки Galaxy, а машины альянса Huawei разъезжаются из общей «HIMA» по пяти
// своим маркам (AITO, Luxeed, Stelato, Shangjie, Maextro).
import { canonicalImportName } from "../config/import-policy.mjs";
import { carTitle } from "../src/car-title.js";
import { pool } from "../server/db.mjs";

// Тип двигателя нужен трём моделям BYD: под одним китайским именем у них едут
// и гибриды, и электромобили, и разъезжаются они по разным именам.
const { rows: models } = await pool.query("SELECT brand, model, powertrain, count(*)::int AS n FROM vehicles GROUP BY 1, 2, 3 ORDER BY 1, 2, 3");

let renamedVehicles = 0;
for (const { brand, model, powertrain, n } of models) {
  const canonical = canonicalImportName(brand, model, powertrain);
  if (canonical.brand === brand && canonical.model === model) continue;
  await pool.query(
    "UPDATE vehicles SET brand=$4, model=$5, updated_at=now() WHERE brand=$1 AND model=$2 AND powertrain=$3",
    [brand, model, powertrain, canonical.brand, canonical.model],
  );
  renamedVehicles += n;
  console.log(`${brand} ${model} [${powertrain}] -> ${canonical.brand} ${canonical.model} (${n})`);
}

// Заголовок и копия карточки в payload собираются из vehicles при чтении, но в базе
// они тоже должны совпадать — ими пользуются отчёты обновления цен и поиск по заголовку.
//
// Заголовок собирается своей функцией, а не склейкой в SQL: у части машин модель
// начинается с имени марки, и простая склейка давала «Geely Galaxy Galaxy L6 2025»,
// «Mazda Mazda3 2022», «MG MG5 2023». Повтор убирается в car-title.js, поэтому
// заголовки пересобираются здесь по одному, а не одним запросом.
const { rows: listings } = await pool.query(`
  SELECT l.id, l.title, v.brand, v.model, v.model_year,
         l.source_payload->>'model' AS payload_model,
         l.source_payload->>'brand' AS payload_brand
  FROM listings l JOIN vehicles v ON v.id = l.vehicle_id`);

let patched = 0;
for (const row of listings) {
  const title = carTitle(row.brand, row.model, row.model_year);
  if (title === row.title && row.payload_model === row.model && row.payload_brand === row.brand) continue;
  await pool.query(
    `UPDATE listings SET title=$2,
       source_payload = jsonb_set(jsonb_set(jsonb_set(source_payload, '{model}', to_jsonb($3::text)), '{brand}', to_jsonb($4::text)), '{title}', to_jsonb($2::text))
     WHERE id=$1`,
    [row.id, title, row.model, row.brand],
  );
  patched += 1;
}

// Единственная машина «Toyota bz7» в марке ORA — ошибка источника: по размерам
// и характеристикам это не bZ7, чья это карточка на самом деле — неизвестно.
const hidden = await pool.query(`
  UPDATE listings l SET status='unavailable'
  FROM vehicles v
  WHERE v.id = l.vehicle_id AND v.brand = 'ORA' AND v.model = 'Toyota bz7' AND l.status = 'active'`);

console.log(`Переименовано машин: ${renamedVehicles}; выровнено карточек: ${patched}; скрыто мусорных: ${hidden.rowCount}`);
process.exit(0);

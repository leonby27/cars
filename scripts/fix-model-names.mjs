// Прогоняет уже загруженный каталог через словарь названий: канонические имена
// моделей (config/import-policy.mjs) и беларуские названия вместо китайских
// (config/model-names-by.mjs). Новые импорты получают правильные имена сами, этот
// скрипт выравнивает то, что попало в базу раньше. Повторный запуск безопасен:
// машины с правильными именами он не трогает.
//
// Марка меняется вместе с моделью: вся линейка Geely Galaxy объединяется с Geely
// (слово Galaxy остаётся в модели), а машины альянса Huawei разъезжаются из общей
// «HIMA» по пяти своим маркам (AITO, Luxeed, Stelato, Shangjie, Maextro).
import { canonicalImportName } from "../config/import-policy.mjs";
import { modelSpellingKey } from "../config/guazi-model-names.mjs";
import { carTitle } from "../src/car-title.js";
import { pool } from "../server/db.mjs";

// --dry-run: только показать, что изменится, ничего не записывая.
const DRY_RUN = process.argv.includes("--dry-run");
const write = (sql, params) => DRY_RUN ? Promise.resolve({ rowCount: 0 }) : pool.query(sql, params);

// Тип двигателя нужен трём моделям BYD: под одним китайским именем у них едут
// и гибриды, и электромобили, и разъезжаются они по разным именам.
// Машины Guazi идут отдельным проходом ниже: у них свой словарь написаний.
// Источник нужен словарю: корейские имена (Encar) приводятся своим словарём.
const { rows: models } = await pool.query(`SELECT v.brand, v.model, v.powertrain, l.source, count(*)::int AS n
  FROM vehicles v JOIN listings l ON l.vehicle_id = v.id
  WHERE l.source IS DISTINCT FROM 'Guazi' GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3`);

let renamedVehicles = 0;
for (const { brand, model, powertrain, source, n } of models) {
  const canonical = canonicalImportName(brand, model, powertrain, { source });
  if (canonical.brand === brand && canonical.model === model) continue;
  await write(
    `UPDATE vehicles v SET brand=$4, model=$5, updated_at=now() FROM listings l
     WHERE l.vehicle_id = v.id AND l.source IS DISTINCT FROM 'Guazi' AND v.brand=$1 AND v.model=$2 AND v.powertrain=$3`,
    [brand, model, powertrain, canonical.brand, canonical.model],
  );
  renamedVehicles += n;
  console.log(`${brand} ${model} [${powertrain}] -> ${canonical.brand} ${canonical.model} (${n})`);
}

// Guazi пишет те же модели иначе, чем Che168, — эталоном служит каталог Che168
// (config/guazi-model-names.mjs). Словарь не знает только новых написаний: если имя
// после словаря отличается от модели Che168 той же марки лишь регистром, пробелами
// или дефисом («CS35PLUS» и «CS35 PLUS»), берём написание Che168. Машины считаются
// по одной — Buick Envision разводится по размерам кузова.
const { rows: cheModels } = await pool.query(`SELECT DISTINCT v.brand, v.model
  FROM vehicles v JOIN listings l ON l.vehicle_id = v.id WHERE l.source = 'Che168'`);
const cheSpelling = new Map(cheModels.map(({ brand, model }) => [`${brand}|${modelSpellingKey(model)}`, model]));
const cheNames = new Set(cheModels.map(({ brand, model }) => `${brand}|${model}`));
const { rows: guaziCars } = await pool.query(`SELECT v.id, v.brand, v.model, v.powertrain,
    l.source_payload->>'lengthMm' AS "lengthMm", l.source_payload->>'widthMm' AS "widthMm"
  FROM vehicles v JOIN listings l ON l.vehicle_id = v.id WHERE l.source = 'Guazi'`);
const guaziRenames = new Map();
const guaziOwnModels = new Map();
for (const car of guaziCars) {
  const canonical = canonicalImportName(car.brand, car.model, car.powertrain, { ...car, source: "Guazi" });
  const model = cheSpelling.get(`${canonical.brand}|${modelSpellingKey(canonical.model)}`) || canonical.model;
  if (!cheNames.has(`${canonical.brand}|${model}`)) {
    const own = `${canonical.brand} ${model}`;
    guaziOwnModels.set(own, (guaziOwnModels.get(own) || 0) + 1);
  }
  if (canonical.brand === car.brand && model === car.model) continue;
  await write("UPDATE vehicles SET brand=$2, model=$3, updated_at=now() WHERE id=$1", [car.id, canonical.brand, model]);
  const rename = `${car.brand} ${car.model} [${car.powertrain}] -> ${canonical.brand} ${model}`;
  guaziRenames.set(rename, (guaziRenames.get(rename) || 0) + 1);
  renamedVehicles += 1;
}
for (const [rename, n] of guaziRenames) console.log(`Guazi: ${rename} (${n})`);
// Модели, которых у Che168 нет. Среди них бывают новые написания уже известных
// машин — их надо дописать в config/guazi-model-names.mjs.
if (guaziOwnModels.size) {
  console.log(`Модели Guazi без пары у Che168 (${guaziOwnModels.size}):`);
  for (const [model, n] of [...guaziOwnModels].sort()) console.log(`  ${model} (${n})`);
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
  await write(
    `UPDATE listings SET title=$2,
       source_payload = jsonb_set(jsonb_set(jsonb_set(source_payload, '{model}', to_jsonb($3::text)), '{brand}', to_jsonb($4::text)), '{title}', to_jsonb($2::text))
     WHERE id=$1`,
    [row.id, title, row.model, row.brand],
  );
  patched += 1;
}

// Единственная машина «Toyota bz7» в марке ORA — ошибка источника: по размерам
// и характеристикам это не bZ7, чья это карточка на самом деле — неизвестно.
const hidden = await write(`
  UPDATE listings l SET status='unavailable', sold_at=COALESCE(sold_at, now())
  FROM vehicles v
  WHERE v.id = l.vehicle_id AND v.brand = 'ORA' AND v.model = 'Toyota bz7' AND l.status = 'active'`);

console.log(`${DRY_RUN ? "[проверка, без записи] " : ""}Переименовано машин: ${renamedVehicles}; выровнено карточек: ${patched}; скрыто мусорных: ${hidden.rowCount}`);
process.exit(0);

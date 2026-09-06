// Пересчёт характеристик у машин, заведённых с русской версии источника.
//
// Что случилось: 31.08.2026 сборщик перешёл на русскую версию сайта источника, а
// разбор искал характеристики по английским названиям («Battery Energy (kWh)»).
// У всех машин, заведённых с того дня, остались пустыми ёмкость батареи, запас
// хода, мощность, разгон, момент, шины и объём двигателя. Объём вдобавок нужен
// расчёту пошлины: без него растаможку считали по «полтора литра по умолчанию»,
// и цена под ключ у бензиновых машин с мотором 2 л была занижена тысячи на три.
//
// Почему чинится без обращения к источнику: исходные строки характеристик — с
// теми самыми русскими названиями — сохранены в записи машины целиком. Разбор
// теперь понимает оба языка, поэтому достаточно перечитать сохранённое.
//
// Почему не через обычную запись машины: она ставит объявлению «в продаже» и
// двигает дату последней проверки. Первое воскресило бы машины, только что снятые
// с продажи, второе — соврало бы, что мы их сейчас проверяли у источника. Поэтому
// пересчёт трогает ровно три вещи: характеристики, ёмкость с запасом хода и цену
// под ключ.
//
// Запуск: `npm run db:respec` (посмотреть без записи — `npm run db:respec -- --dry-run`).
import { pool } from "../server/db.mjs";
import { normalizeCar, vehicleSpecifications } from "../server/repository.mjs";
import { estimateLandedCost } from "../src/pricing.js";
import { deriveChe168SpecFields, specsFromTechnicalSpecs } from "./lib/che168-parser.mjs";

const args = new Map(process.argv.slice(2).map((item) => item.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "true"]));
const dryRun = args.get("dry-run") === "true";
const limit = Number(args.get("limit") || 0);

// Берём только живые объявления, у которых характеристики пусты, а исходные строки
// сохранены. Снятые с продажи не трогаем вовсе, а машины, заведённые до перехода на
// русскую версию, под условие не попадают — у них всё на месте.
const { rows } = await pool.query(`
  SELECT l.id, l.source_payload
    FROM listings l
    JOIN vehicles v ON v.id = l.vehicle_id
   WHERE l.source = 'Che168'
     AND l.status = 'active'
     AND l.source_payload ? 'technicalSpecs'
     AND v.battery_kwh IS NULL
     AND (v.specifications->>'acceleration') IS NULL
     AND (v.specifications->>'tireSizeFront') IS NULL
   ORDER BY l.imported_at DESC
   ${limit ? `LIMIT ${limit}` : ""}`);
console.log(`[respec] машин без характеристик: ${rows.length}`);

const stats = { пересчитано: 0, "нечего взять": 0, батарея: 0, "объём мотора": 0, разгон: 0, "запас хода": 0, "цена изменилась": 0 };
let written = 0;

for (const row of rows) {
  const car = row.source_payload || {};
  const specs = specsFromTechnicalSpecs(car.technicalSpecs);
  if (!specs.length) { stats["нечего взять"] += 1; continue; }
  const derived = deriveChe168SpecFields(specs);

  // Пустое значение не затирает уже записанное: пересчёт только дополняет.
  const merged = { ...car };
  const fill = (key, value) => {
    if (value === null || value === undefined || value === "") return false;
    if (merged[key] !== null && merged[key] !== undefined && merged[key] !== "") return false;
    merged[key] = value;
    return true;
  };
  const filledBattery = fill("battery", derived.battery);
  const filledEngine = fill("engine", derived.engine);
  const filledAcceleration = fill("acceleration", derived.acceleration);
  const filledRange = fill("electricRange", derived.electricRange);
  fill("range", derived.electricRange);
  fill("horsepower", derived.horsepower);
  fill("torqueNm", derived.torqueNm);
  fill("tireSizeFront", derived.tireSizeFront);
  fill("tireRim", derived.tireRim);
  fill("batteryType", derived.batteryType);
  fill("batteryBrand", derived.batteryBrand);
  fill("bodyStructure", derived.bodyStructure);
  fill("seats", derived.seats);
  fill("doors", derived.doors);
  if (JSON.stringify(merged) === JSON.stringify(car)) { stats["нечего взять"] += 1; continue; }

  stats.пересчитано += 1;
  if (filledBattery) stats.батарея += 1;
  if (filledEngine) stats["объём мотора"] += 1;
  if (filledAcceleration) stats.разгон += 1;
  if (filledRange) stats["запас хода"] += 1;

  const item = normalizeCar(merged);
  const priceBefore = estimateLandedCost(normalizeCar(car)).totalUsd;
  const priceAfter = estimateLandedCost(item).totalUsd;
  if (priceAfter !== priceBefore) stats["цена изменилась"] += 1;

  if (dryRun) {
    if (stats.пересчитано === 1) {
      console.log("[respec] пример:", JSON.stringify({
        id: item.id, title: item.title, батарея: item.battery, мотор: item.engine,
        мощность: item.horsepower, разгон: item.acceleration, шины: item.tireSizeFront,
        "цена было": priceBefore, "цена стало": priceAfter,
      }, null, 1));
    }
    continue;
  }

  await pool.query(
    `UPDATE vehicles SET battery_kwh=$2, electric_range_km=$3, combined_range_km=$4, specifications=$5, updated_at=now()
      WHERE id=(SELECT vehicle_id FROM listings WHERE id=$1)`,
    [row.id, item.battery, item.electricRange, item.combinedRange, JSON.stringify(vehicleSpecifications(item))],
  );
  await pool.query(
    "UPDATE listings SET source_payload=$2, estimated_total_usd=$3 WHERE id=$1",
    [row.id, JSON.stringify(merged), priceAfter],
  );
  written += 1;
  if (written % 500 === 0) console.log(`[respec] записано ${written} из ${stats.пересчитано}`);
}

console.table([stats]);
console.log(dryRun ? "[respec] пробный прогон — в базу ничего не записано" : `[respec] готово: обновлено ${written} машин`);
await pool.end();

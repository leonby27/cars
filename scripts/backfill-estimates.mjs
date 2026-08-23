// Пересчитывает сохранённую цену «под ключ» у всех объявлений в базе.
//
// Карточка считает цену заново при каждом показе, а вот сортировка по цене и
// фильтр «цена до» работают по числу в базе. Поэтому после правки расчёта его
// нужно прогнать один раз: иначе каталог сортирует и фильтрует по старым суммам,
// а показывает новые.
//
// Запуск: node scripts/backfill-estimates.mjs (или npm run db:estimates)
// С «--dry» ничего не пишет, только показывает, у скольких машин цена изменится.
import { pool } from "../server/db.mjs";
import { estimateLandedCost } from "../src/pricing.js";

const dryRun = process.argv.includes("--dry");
const STEP = 1; // разницу меньше доллара считаем шумом округления и не пишем

const { rows } = await pool.query(`SELECT l.id, l.estimated_total_usd, l.price_cny,
    l.source, l.status,
    (l.source_payload->>'usdPrice')::numeric AS usd_price,
    v.model_year AS year,
    v.powertrain AS type,
    l.source_payload->>'sourceFuelType' AS fuel_type,
    COALESCE(l.source_payload->>'transmission', v.specifications->>'transmission') AS transmission,
    COALESCE(l.source_payload->>'engine', v.specifications->>'engine') AS engine,
    l.city,
    l.source_payload->>'manufactureDate' AS manufacture_date,
    l.source_payload->>'dimensions' AS dimensions,
    (l.source_payload->>'curbWeight')::numeric AS curb_weight
  FROM listings l JOIN vehicles v ON v.id = l.vehicle_id`);
console.log(`[db] ${rows.length} объявлений`);

const updates = [];
let unchanged = 0;
let skipped = 0;
for (const row of rows) {
  const est = estimateLandedCost({
    source: row.source,
    usdPrice: Number(row.usd_price) || 0,
    chinaPrice: Number(row.price_cny) || 0,
    year: row.year,
    type: row.type,
    engine: row.engine,
    sourceFuelType: row.fuel_type,
    transmission: row.transmission,
    city: row.city,
    // Дата выпуска — не мелочь: возраст считается по ней, а на трёх и пяти годах
    // стоят пороги ставок и порог НДС. Без неё расчёт откатывался на модельный год,
    // и сохранённая цена расходилась с той, что видит человек в карточке, на ~20%
    // у машин около пятилетнего рубежа. По этому же числу работают сортировка
    // «дешёвые» и фильтр «цена до», поэтому расхождение видно и в выдаче каталога.
    manufactureDate: row.manufacture_date,
    dimensions: row.dimensions,
    curbWeight: row.curb_weight,
  }).totalUsd;
  if (!Number.isFinite(est) || est <= 0) { skipped++; continue; }
  if (Math.abs(est - Number(row.estimated_total_usd || 0)) < STEP) { unchanged++; continue; }
  updates.push({ id: row.id, est, was: Number(row.estimated_total_usd) || 0, active: row.status === "active" });
}

const active = updates.filter((item) => item.active);
const money = (value) => `${Math.round(value).toLocaleString("ru-RU")} $`;
const median = (list) => {
  if (!list.length) return 0;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
console.log(`[расчёт] меняется у ${updates.length} (из них в продаже ${active.length}), без изменений ${unchanged}, без цены ${skipped}`);
if (active.length) {
  const up = active.filter((item) => item.est > item.was);
  const down = active.filter((item) => item.est < item.was);
  console.log(`[расчёт] дороже у ${up.length} (медиана +${money(median(up.map((i) => i.est - i.was)))}), дешевле у ${down.length} (медиана −${money(median(down.map((i) => i.was - i.est)))})`);
}

if (dryRun) {
  console.log("[dry] в базу ничего не записано");
} else {
  const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
  for (const batch of chunk(updates, 2000)) {
    await pool.query(`UPDATE listings l SET estimated_total_usd = v.est
      FROM jsonb_to_recordset($1::jsonb) AS v(id text, est numeric) WHERE l.id = v.id`,
      [JSON.stringify(batch.map(({ id, est }) => ({ id, est })))]);
  }
  console.log(`[db] записано ${updates.length}`);
}
await pool.end();

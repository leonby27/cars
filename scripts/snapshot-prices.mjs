// Недельный снимок цен каталога: по строке на «марка + модель + год выпуска».
//
// Из этих снимков считается индекс цены под ключ и списки «подешевело / подорожало»
// для отчёта журнала. Сегодняшняя база помнит только сегодняшние цены, поэтому
// снимки надо копить заранее: первый честный отчёт возможен через две недели после
// первого запуска.
//
// Запуск: npm run snapshot:prices (на сервере — раз в неделю по таймеру
// abcars-price-snapshot, в ночь на воскресенье после актуализации каталога).
// Повторный запуск в тот же день перезаписывает снимок этого дня, а не плодит второй.
//
// Считаем по сохранённой в базе цене под ключ (estimated_total_usd): её пересчитывает
// каждая выкладка и каждое обновление объявления. Если правило расчёта менялось, а
// пересчёт не прогонялся, снимок унаследует старые суммы — поэтому в таймере перед
// снимком стоит `npm run db:estimates`.
import { pool } from "../server/db.mjs";

// Наборы меньше трёх машин в снимок не идут: там медиана — это цена одного
// объявления, и её случайный уход из продажи выглядел бы как обвал цен.
const MIN_LISTINGS = 3;

const dryRun = process.argv.includes("--dry");
// Дату можно задать явно (`--date=2026-09-01`) — нужно, чтобы досчитать пропущенную
// неделю, если сервер в тот день был занят или выключен.
const dateArg = process.argv.find((arg) => arg.startsWith("--date="));
const takenOn = dateArg ? dateArg.slice("--date=".length) : null;

const sql = `
  WITH sample AS (
    SELECT v.brand, v.model, v.model_year, l.estimated_total_usd AS usd
    FROM listings l JOIN vehicles v ON v.id = l.vehicle_id
    WHERE l.status = 'active' AND l.estimated_total_usd > 0
  )
  SELECT brand, model, model_year,
    count(*)::int AS listings,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY usd)::numeric, 2) AS median_usd,
    round(min(usd)::numeric, 2) AS min_usd
  FROM sample
  GROUP BY brand, model, model_year
  HAVING count(*) >= $1
  ORDER BY count(*) DESC`;

const { rows } = await pool.query(sql, [MIN_LISTINGS]);
const day = takenOn || new Date().toISOString().slice(0, 10);

if (!rows.length) {
  console.error("Снимок не сделан: в базе нет активных объявлений с посчитанной ценой.");
  await pool.end();
  process.exit(1);
}

const listings = rows.reduce((sum, row) => sum + row.listings, 0);
if (dryRun) {
  console.log(`Пробный прогон: ${rows.length} наборов «модель+год», ${listings} машин, дата снимка ${day}. Ничего не записано.`);
  await pool.end();
  process.exit(0);
}

// Одним запросом, а не построчно: наборов около полутысячи, отдельные вставки
// стоили бы полтысячи обращений к базе.
const params = [];
const placeholders = rows.map((row, index) => {
  params.push(day, `${row.brand}|${row.model}|${row.model_year ?? ""}`, row.brand, row.model, row.model_year, row.listings, row.median_usd, row.min_usd);
  const base = index * 8;
  return `($${base + 1}::date, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
});

await pool.query(
  `INSERT INTO price_snapshots (taken_on, bucket, brand, model, model_year, listings, median_usd, min_usd)
   VALUES ${placeholders.join(",")}
   ON CONFLICT (taken_on, bucket) DO UPDATE SET
     listings = EXCLUDED.listings, median_usd = EXCLUDED.median_usd, min_usd = EXCLUDED.min_usd`,
  params,
);

const history = await pool.query("SELECT taken_on, count(*)::int AS buckets FROM price_snapshots GROUP BY taken_on ORDER BY taken_on DESC LIMIT 5");
console.log(`Снимок ${day}: ${rows.length} наборов «модель+год», ${listings} машин.`);
// Дата из базы приходит объектом времени в поясе машины: печатаем по частям, иначе
// перевод в UTC на западных поясах сдвинул бы день назад.
const dayText = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
console.log("Последние снимки:");
for (const row of history.rows) console.log(`  ${dayText(row.taken_on)} — ${row.buckets} наборов`);
if (history.rows.length < 2) console.log("Сравнивать пока не с чем: отчёт станет возможен со второго снимка.");

await pool.end();

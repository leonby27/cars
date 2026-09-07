import fs from "node:fs";
import pg from "pg";

const envValue = (file, key) => {
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} is missing in ${file}`);
  return line.slice(key.length + 1).replace(/^['\"]|['\"]$/g, "");
};

const source = new pg.Client({ connectionString:envValue(".env.local.neon-backup", "DATABASE_URL") });
const target = new pg.Client({ connectionString:envValue(".env.local", "DATABASE_URL") });
await Promise.all([source.connect(), target.connect()]);

try {
  // Продакшен ещё хранит события в предыдущей версии таблицы, без полей human и
  // human_action. Для локального исторического снимка считаем эти события валидными:
  // иначе новый фильтр скрыл бы всю накопленную статистику.
  const eventsResult = await source.query(`SELECT event_id, visitor_id, session_id, event_name, path, listing_id, listing_title, properties, created_at,
      true AS human, true AS human_action FROM analytics_events
      WHERE created_at >= now() - interval '90 days' ORDER BY created_at`);
  const accountsResult = await source.query(`SELECT id, false AS staff, created_at FROM customer_accounts
    WHERE created_at >= now() - interval '90 days' OR id IN (SELECT customer_id FROM customer_favorites)`);
  const favoritesResult = await source.query("SELECT customer_id, listing_id, created_at FROM customer_favorites");

  await target.query("BEGIN");
  try {
    for (let index = 0; index < accountsResult.rows.length; index += 1) {
      const account = accountsResult.rows[index];
      const suffix = String(index + 1).padStart(4, "0");
      await target.query(`INSERT INTO customer_accounts (id, name, phone, password_salt, password_hash, created_at, updated_at, staff)
        VALUES ($1, $2, $3, 'analytics-snapshot', 'analytics-snapshot', $4, $4, $5)
        ON CONFLICT (id) DO NOTHING`, [account.id, account.staff ? "Сотрудник" : `Посетитель ${suffix}`, `+37529000${suffix}`, account.created_at, account.staff]);
    }
    for (const favorite of favoritesResult.rows) {
      await target.query(`INSERT INTO customer_favorites (customer_id, listing_id, created_at)
        VALUES ($1, $2, $3) ON CONFLICT (customer_id, listing_id) DO NOTHING`, [favorite.customer_id, favorite.listing_id, favorite.created_at]);
    }
    for (const event of eventsResult.rows) {
      await target.query(`INSERT INTO analytics_events (event_id, visitor_id, session_id, event_name, path, listing_id, listing_title, properties, created_at, human, human_action)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (event_id) DO NOTHING`, [event.event_id, event.visitor_id, event.session_id, event.event_name, event.path, event.listing_id, event.listing_title, event.properties, event.created_at, event.human, event.human_action]);
    }
    await target.query("COMMIT");
  } catch (error) {
    await target.query("ROLLBACK");
    throw error;
  }
  console.log(JSON.stringify({ events:eventsResult.rowCount, accounts:accountsResult.rowCount, favorites:favoritesResult.rowCount }));
} finally {
  await Promise.all([source.end(), target.end()]);
}

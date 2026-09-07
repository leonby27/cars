import { pool } from './db.mjs';
import { fetchMetrikaSearchTraffic, readSearchTraffic, syncSearchTraffic } from '../worker/analytics.js';

export function postgresSearchStore(db = pool) {
  return {
    async read(source, property, range) {
      const [days, state] = await Promise.all([
        db.query('SELECT payload FROM search_traffic_daily WHERE source=$1 AND property=$2 AND day>=$3 AND day<=$4 ORDER BY day', [source, property, range.startDate, range.endDate]),
        db.query('SELECT payload FROM search_traffic_sync WHERE source=$1 AND property=$2', [source, property]),
      ]);
      return { days:days.rows.map((row) => JSON.parse(row.payload)), state:state.rows[0] ? JSON.parse(state.rows[0].payload) : null };
    },
    async save(source, property, days, state) {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const day of days) await client.query(`INSERT INTO search_traffic_daily(source,property,day,payload) VALUES($1,$2,$3,$4)
          ON CONFLICT(source,property,day) DO UPDATE SET payload=EXCLUDED.payload`, [source, property, day.day, JSON.stringify(day)]);
        await client.query(`INSERT INTO search_traffic_sync(source,property,payload) VALUES($1,$2,$3)
          ON CONFLICT(source,property) DO UPDATE SET payload=EXCLUDED.payload`, [source, property, JSON.stringify(state)]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async fail(source, property, error) {
      // Keep last successful sync time and all saved days on an upstream failure.
      await db.query(`INSERT INTO search_traffic_sync(source,property,payload) VALUES($1,$2,$3)
        ON CONFLICT(source,property) DO UPDATE SET payload=(search_traffic_sync.payload::jsonb || EXCLUDED.payload::jsonb)::text`, [source, property, JSON.stringify({ error })]);
    },
  };
}
export async function getSearchTraffic(period) {
  const [report, metrika] = await Promise.all([
    readSearchTraffic(period, process.env, postgresSearchStore()),
    fetchMetrikaSearchTraffic(process.env, period),
  ]);
  return { ...report, metrika };
}
export async function collectSearchTraffic() {
  const lock = await pool.connect();
  let acquired = false;
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock(72641031) AS acquired")).rows[0].acquired;
    if (!acquired) return { sync:{ status:'already_running' } };
    return await syncSearchTraffic(process.env, postgresSearchStore());
  } finally {
    if (acquired) await lock.query("SELECT pg_advisory_unlock(72641031)");
    lock.release();
  }
}

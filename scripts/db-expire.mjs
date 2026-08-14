import { pool } from "../server/db.mjs";

const days = Math.max(7, Number(process.argv.find((value) => value.startsWith("--days="))?.split("=")[1]) || 30);
const result = await pool.query(`UPDATE listings SET status='unavailable'
  WHERE status='active' AND last_seen_at < now() - make_interval(days => $1)
  RETURNING id`, [days]);
console.log(`Marked ${result.rowCount} listings unavailable after ${days} days without a successful sighting`);
await pool.end();

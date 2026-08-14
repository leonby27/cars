import { pool } from "../server/db.mjs";

const limit = Math.max(1, Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1]) || 1000);
const result = await pool.query(`INSERT INTO crawl_jobs (source, listing_id, job_type, url, priority)
  SELECT l.source, l.id, 'refresh_listing', l.source_url,
    CASE WHEN l.last_checked_at IS NULL THEN 50 WHEN l.last_checked_at < now() - interval '7 days' THEN 30 ELSE 10 END
  FROM listings l
  WHERE l.status='active' AND COALESCE(l.last_checked_at, 'epoch') < now() - interval '24 hours'
  ORDER BY l.last_checked_at ASC NULLS FIRST
  LIMIT $1
  ON CONFLICT (job_type, listing_id) WHERE status IN ('queued','running') DO NOTHING
  RETURNING id`, [limit]);
console.log(`Queued ${result.rowCount} stale listings`);
await pool.end();

import { pool } from "./db.mjs";
import { DISABLED_IMPORT_SOURCES } from "../config/import-policy.mjs";

export async function scheduleStaleListings(limit = 1000) {
  const result = await pool.query(`INSERT INTO crawl_jobs (source, listing_id, job_type, url, priority)
    SELECT l.source, l.id, 'refresh_listing', l.source_url,
      CASE WHEN l.last_checked_at IS NULL THEN 50 WHEN l.last_checked_at < now() - interval '7 days' THEN 30 ELSE 10 END
    FROM listings l
    WHERE l.status='active'
      AND NOT (l.source='Guazi' AND COALESCE(l.source_payload->>'priceBasis','')='FOB')
      AND NOT (l.source = ANY($2::text[])) AND COALESCE(l.last_checked_at, 'epoch') < now() - interval '24 hours'
    ORDER BY l.last_checked_at ASC NULLS FIRST
    LIMIT $1
    ON CONFLICT (job_type, listing_id) WHERE status IN ('queued','running') DO NOTHING
    RETURNING id`, [limit, [...DISABLED_IMPORT_SOURCES]]);
  return result.rowCount;
}

// Age is not evidence of a sale. Hide stale records of any source, keeping
// their facts, check dates and photographs for the next verified refresh.
export async function expireUnseenListings(days = 30) {
  const safeDays=Math.max(7,Number(days) || 30);
  const result=await pool.query(`UPDATE listings SET status='skipped', sold_at=NULL, content_changed_at=now(),
    source_payload=source_payload || jsonb_build_object('catalogQuarantine', jsonb_build_object('reason','stale-observation','observedAt',now()))
    WHERE status='active' AND COALESCE(last_seen_at,'epoch'::timestamptz) < now() - make_interval(days => $1)
    RETURNING id`, [safeDays]);
  return result.rowCount;
}

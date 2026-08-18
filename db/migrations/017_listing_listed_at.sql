-- The default catalog order sorted on COALESCE(source_payload->>'sourceListedAt', first_seen_at).
-- No index can serve that expression, so every catalog request seq-scanned all active listings
-- and disk-sorted them with source_payload inside the sort key (~455 ms per request).
-- Materialise the value into a column the sort can index instead.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS listed_at TIMESTAMPTZ;

UPDATE listings
   SET listed_at = COALESCE(NULLIF(source_payload->>'sourceListedAt', '')::timestamptz, first_seen_at)
 WHERE listed_at IS NULL;

ALTER TABLE listings ALTER COLUMN listed_at SET DEFAULT now();
ALTER TABLE listings ALTER COLUMN listed_at SET NOT NULL;

-- NULLS LAST and the id tiebreaker mirror buildCarOrder("newest") so the planner can
-- walk the index instead of sorting.
CREATE INDEX IF NOT EXISTS listings_listed_at_idx
  ON listings (listed_at DESC NULLS LAST, id)
  WHERE status = 'active';

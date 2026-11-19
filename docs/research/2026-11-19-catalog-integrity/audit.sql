-- Read-only diagnostics, prepared 2026-11-19. Does not contact source sites.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT source, status, count(*) AS listings,
  min(last_checked_at) AS oldest_check, max(last_checked_at) AS newest_check,
  count(*) FILTER (WHERE last_checked_at IS NULL OR last_checked_at < now()-interval '7 days') AS check_older_than_week,
  count(*) FILTER (WHERE last_seen_at IS NULL OR last_seen_at < now()-interval '30 days') AS unseen_month
FROM listings GROUP BY source,status ORDER BY source,status;

SELECT id,source,external_id,status,price_cny,estimated_total_usd,last_checked_at,last_seen_at,
  source_payload->>'usdPrice' AS quoted_usd,
  source_payload->>'fobPriceUsd' AS fob_usd, source_payload->>'fobPort' AS port,
  source_payload->'sourceAvailability' AS availability_evidence,
  source_payload->'catalogQuarantine' AS quarantine
FROM listings WHERE source='Che168' AND external_id IN ('59011973','60354703','60451086','60424178');

-- Historical incident candidates; timestamps are UTC. This is NOT proof
-- of an incorrect price and NOT a command to restore old prices as current.
SELECT status,count(*) AS candidates
FROM listings WHERE source='Che168' AND (
  last_checked_at BETWEEN '2026-11-18T03:00:02.102Z' AND '2026-11-18T10:33:30.714Z'
  OR first_seen_at BETWEEN '2026-11-18T03:00:02.102Z' AND '2026-11-18T10:33:30.714Z'
) GROUP BY status;

-- Structural contradictions. None of these checks proves live availability;
-- that requires a new read of the marketplace for the exact external ID.
SELECT l.source,l.id,l.external_id,l.status FROM listings l
WHERE l.status='active' AND (
  l.id IS DISTINCT FROM CASE l.source WHEN 'Che168' THEN 'che168-' WHEN 'Guazi' THEN 'guazi-' WHEN 'Encar' THEN 'encar-' END || l.external_id
  OR COALESCE(l.price_cny,0)<=0 OR COALESCE(l.estimated_total_usd,0)<=0
  OR l.mileage_km IS NULL OR l.mileage_km<0
  OR NOT EXISTS (SELECT 1 FROM listing_media m WHERE m.listing_id=l.id)
  OR (l.source_payload->>'externalId' IS NOT NULL AND l.source_payload->>'externalId' IS DISTINCT FROM l.external_id)
  OR (l.source='Guazi' AND (
    l.source_payload->>'priceBasis' IS DISTINCT FROM 'FOB'
    OR l.source_payload->>'fobPort' IS DISTINCT FROM 'Horgos'
    OR l.source_payload->>'fobPriceUsd' IS DISTINCT FROM l.source_payload->>'usdPrice'))
) ORDER BY l.source,l.id LIMIT 200;
ROLLBACK;

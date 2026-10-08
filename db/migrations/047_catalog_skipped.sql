-- Automatic data/policy skips are retained for future source checks. They are
-- not sold cars and must not be exposed through detail, favorites or feeds.
CREATE OR REPLACE VIEW catalog_listings AS
SELECT l.* FROM listings l
WHERE l.status <> 'skipped'
AND (
  NOT EXISTS (SELECT 1 FROM catalog_sources WHERE NOT enabled)
  OR NOT EXISTS (SELECT 1 FROM catalog_sources s WHERE s.source=l.source AND NOT s.enabled)
)
AND NOT EXISTS (SELECT 1 FROM catalog_hidden_duplicates h WHERE h.listing_id=l.id);

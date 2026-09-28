-- Cross-source duplicates stay in the source tables. Only the public catalog
-- hides the secondary card while its preferred counterpart is active.
CREATE TABLE IF NOT EXISTS catalog_duplicate_matches (
  duplicate_listing_id text PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  canonical_listing_id text NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  strategy text NOT NULL,
  confidence smallint NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  signals jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_confirmed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (duplicate_listing_id <> canonical_listing_id)
);

CREATE INDEX IF NOT EXISTS catalog_duplicate_matches_canonical_idx
  ON catalog_duplicate_matches(canonical_listing_id);

CREATE OR REPLACE VIEW catalog_listings AS
SELECT l.*
FROM listings l
WHERE NOT EXISTS (
  SELECT 1 FROM catalog_sources s
  WHERE s.source=l.source AND NOT s.enabled
)
AND NOT EXISTS (
  SELECT 1
  FROM catalog_duplicate_matches d
  JOIN listings canonical ON canonical.id=d.canonical_listing_id
  WHERE d.duplicate_listing_id=l.id
    AND canonical.status='active'
    AND NOT EXISTS (
      SELECT 1 FROM catalog_sources s
      WHERE s.source=canonical.source AND NOT s.enabled
    )
);

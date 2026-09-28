-- Visibility is independent of listing availability and ingestion. New writes
-- cannot re-enable a hidden source; switching back restores the same records.
CREATE TABLE IF NOT EXISTS catalog_sources (
  source text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO catalog_sources(source, enabled) VALUES ('Guazi',false) ON CONFLICT DO NOTHING;
CREATE OR REPLACE VIEW catalog_listings AS
SELECT l.* FROM listings l
WHERE NOT EXISTS (SELECT 1 FROM catalog_sources s WHERE s.source=l.source AND NOT s.enabled);

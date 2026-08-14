ALTER TABLE listings ADD COLUMN IF NOT EXISTS estimated_total_usd INTEGER;
CREATE INDEX IF NOT EXISTS listings_estimated_total_idx ON listings(estimated_total_usd);

-- The public card looks up external_id without constraining source. The old
-- (source,external_id) index reads ~2,000 pages for that lookup.
CREATE INDEX IF NOT EXISTS listings_external_lookup_idx ON listings(external_id) WHERE source<>'Encar';
-- Related cars and price comparison select brand/model without powertrain.
CREATE INDEX IF NOT EXISTS vehicles_brand_model_idx ON vehicles(brand,model);

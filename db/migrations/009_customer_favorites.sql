CREATE TABLE IF NOT EXISTS customer_favorites (
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, listing_id)
);

CREATE INDEX IF NOT EXISTS customer_favorites_listing_idx
  ON customer_favorites(listing_id);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  model_year INTEGER NOT NULL,
  powertrain TEXT NOT NULL,
  drivetrain TEXT,
  battery_kwh NUMERIC(8,2),
  electric_range_km INTEGER,
  combined_range_km INTEGER,
  specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  city TEXT,
  first_registration TEXT,
  mileage_km INTEGER NOT NULL,
  price_cny INTEGER NOT NULL,
  guide_price_cny INTEGER,
  owners INTEGER,
  transfers INTEGER,
  condition_grade TEXT,
  appearance_score NUMERIC(5,2),
  claims TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  content_hash TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS listings_status_idx ON listings(status);
CREATE INDEX IF NOT EXISTS listings_price_idx ON listings(price_cny);
CREATE INDEX IF NOT EXISTS listings_mileage_idx ON listings(mileage_km);
CREATE INDEX IF NOT EXISTS listings_checked_idx ON listings(last_checked_at);
CREATE INDEX IF NOT EXISTS vehicles_catalog_idx ON vehicles(powertrain, brand, model, model_year DESC);

CREATE TABLE IF NOT EXISTS listing_media (
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  url TEXT NOT NULL,
  cached_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, position)
);

CREATE TABLE IF NOT EXISTS price_history (
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  price_cny INTEGER NOT NULL,
  PRIMARY KEY (listing_id, observed_at)
);

CREATE INDEX IF NOT EXISTS price_history_listing_idx ON price_history(listing_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS source_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT,
  url TEXT NOT NULL,
  format TEXT NOT NULL,
  content_hash TEXT,
  payload TEXT,
  http_status INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS source_snapshots_lookup_idx ON source_snapshots(source, external_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  discovered INTEGER NOT NULL DEFAULT 0,
  imported INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crawl_jobs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  url TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS crawl_jobs_claim_idx ON crawl_jobs(status, available_at, priority DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS crawl_jobs_active_unique
  ON crawl_jobs(job_type, listing_id)
  WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS order_drafts (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  contact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  calculation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_drafts_listing_idx ON order_drafts(listing_id, created_at DESC);

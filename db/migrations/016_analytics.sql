CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  path TEXT NOT NULL,
  listing_id TEXT,
  listing_title TEXT,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_idx
  ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_created_idx
  ON analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_listing_created_idx
  ON analytics_events(listing_id, created_at DESC)
  WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS analytics_events_visitor_created_idx
  ON analytics_events(visitor_id, created_at DESC);


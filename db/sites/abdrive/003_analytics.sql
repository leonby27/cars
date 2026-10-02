CREATE TABLE IF NOT EXISTS analytics_events (
 event_id text PRIMARY KEY,
 visitor_id text NOT NULL,
 session_id text NOT NULL,
 entry_source text NOT NULL,
 device text NOT NULL CHECK(device IN('desktop','mobile')),
 human_action boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS analytics_events_visitor_idx ON analytics_events(visitor_id,session_id,created_at);

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'healthy',
  blocked_until TIMESTAMPTZ,
  probe_until TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO source_health (source, status)
VALUES ('Guazi', 'healthy')
ON CONFLICT (source) DO NOTHING;

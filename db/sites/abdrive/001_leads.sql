-- Only the separate ABDrive database; no foreign keys into the shared catalog.
CREATE TABLE IF NOT EXISTS site_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  site_id text NOT NULL CHECK (site_id = 'abdrive')
);
INSERT INTO site_identity(singleton,site_id) VALUES(true,'abdrive') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY,
  request_key uuid NOT NULL UNIQUE,
  name text NOT NULL,
  phone text NOT NULL,
  destination_id text NOT NULL,
  destination_name text NOT NULL,
  listing_id text,
  snapshot jsonb NOT NULL,
  comment text NOT NULL DEFAULT '',
  consent_version text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','handed_over','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at DESC);
CREATE TABLE IF NOT EXISTS lead_notifications (
  lead_id uuid PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  lock_token uuid,
  sent_at timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS lead_notifications_pending_idx
  ON lead_notifications(available_at) WHERE sent_at IS NULL;

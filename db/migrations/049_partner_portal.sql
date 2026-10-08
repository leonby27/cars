CREATE TABLE IF NOT EXISTS partner_accounts (
  id UUID PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS partner_sessions (
  token_hash TEXT PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS partner_sessions_account ON partner_sessions(partner_id);
CREATE TABLE IF NOT EXISTS partner_requests (
  id UUID PRIMARY KEY,
  lead_key TEXT NOT NULL UNIQUE,
  partner_id UUID NOT NULL REFERENCES partner_accounts(id) ON DELETE CASCADE,
  snapshot JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','waiting','completed','declined')),
  owner_note TEXT NOT NULL DEFAULT '',
  partner_note TEXT NOT NULL DEFAULT '',
  demo BOOLEAN NOT NULL DEFAULT false,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS partner_requests_account ON partner_requests(partner_id,assigned_at DESC);

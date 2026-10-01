-- Run only in the isolated ABDrive private database, after 001_leads.sql.
CREATE TABLE IF NOT EXISTS customer_accounts (
 id uuid PRIMARY KEY, name text NOT NULL, phone text NOT NULL UNIQUE,
 password_salt text NOT NULL, password_hash text NOT NULL,
 email text NOT NULL DEFAULT '', telegram text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '',
 preferred_contact text NOT NULL DEFAULT 'phone', consent_version text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_sessions (
 token_hash text PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS customer_sessions_customer_idx ON customer_sessions(customer_id);
CREATE TABLE IF NOT EXISTS customer_favorites (
 customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 listing_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(customer_id,listing_id)
);
CREATE TABLE IF NOT EXISTS customer_searches (
 id bigserial PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 title text NOT NULL, filters jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(customer_id,filters)
);
CREATE TABLE IF NOT EXISTS customer_orders (
 id bigserial PRIMARY KEY, customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 listing_id text NOT NULL, snapshot jsonb NOT NULL, request_key uuid NOT NULL UNIQUE,
 availability_status text NOT NULL DEFAULT 'decision' CHECK(availability_status IN ('decision','requested','confirmed')),
 availability_comment text NOT NULL DEFAULT '', availability_requested_at timestamptz,
 contact_name text NOT NULL DEFAULT '', contact_phone text NOT NULL DEFAULT '', contact_methods text[] NOT NULL DEFAULT '{}',
 contact_saved_at timestamptz, contact_consent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(customer_id,listing_id)
);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customer_accounts(id) ON DELETE CASCADE;
CREATE TABLE IF NOT EXISTS account_rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);

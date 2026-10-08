ALTER TABLE partner_registration_requests ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS partner_registration_requests_unseen_idx
  ON partner_registration_requests (updated_at DESC) WHERE seen_at IS NULL;

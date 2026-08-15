ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS telegram TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT NOT NULL DEFAULT 'phone';

ALTER TABLE customer_accounts
  DROP CONSTRAINT IF EXISTS customer_accounts_preferred_contact_check;

ALTER TABLE customer_accounts
  ADD CONSTRAINT customer_accounts_preferred_contact_check
  CHECK (preferred_contact IN ('phone', 'telegram', 'email'));

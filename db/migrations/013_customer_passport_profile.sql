ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS passport_number TEXT,
  ADD COLUMN IF NOT EXISTS personal_number TEXT,
  ADD COLUMN IF NOT EXISTS passport_issue_date DATE,
  ADD COLUMN IF NOT EXISTS passport_issued_by TEXT,
  ADD COLUMN IF NOT EXISTS registration_address TEXT;

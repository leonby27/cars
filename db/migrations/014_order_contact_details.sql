ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS contact_methods TEXT[] NOT NULL DEFAULT ARRAY['phone']::TEXT[],
  ADD COLUMN IF NOT EXISTS contact_saved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_consent_at TIMESTAMPTZ;

ALTER TABLE customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_contact_details_check;

ALTER TABLE customer_orders
  ADD CONSTRAINT customer_orders_contact_details_check
  CHECK (
    (contact_name IS NULL OR char_length(contact_name) BETWEEN 2 AND 80)
    AND (contact_phone IS NULL OR char_length(contact_phone) BETWEEN 12 AND 16)
    AND cardinality(contact_methods) BETWEEN 1 AND 3
    AND contact_methods <@ ARRAY['phone','viber','telegram']::TEXT[]
  );

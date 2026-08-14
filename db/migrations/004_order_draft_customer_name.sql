ALTER TABLE order_drafts
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS availability_confirmed_at TIMESTAMPTZ;

ALTER TABLE customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_availability_status_check;

ALTER TABLE customer_orders
  ADD CONSTRAINT customer_orders_availability_status_check
  CHECK (availability_status IN ('decision', 'requested', 'confirmed'));

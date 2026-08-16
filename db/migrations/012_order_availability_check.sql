ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'decision',
  ADD COLUMN IF NOT EXISTS availability_comment TEXT,
  ADD COLUMN IF NOT EXISTS availability_requested_at TIMESTAMPTZ;

UPDATE customer_orders
SET availability_status = 'requested',
    availability_requested_at = COALESCE(updated_at, created_at)
WHERE availability_status = 'decision'
  AND (inspection_status <> 'decision' OR contract_status <> 'locked' OR payment_status <> 'locked');

ALTER TABLE customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_availability_status_check;

ALTER TABLE customer_orders
  ADD CONSTRAINT customer_orders_availability_status_check
  CHECK (availability_status IN ('decision', 'requested'));

ALTER TABLE customer_orders
  DROP CONSTRAINT IF EXISTS customer_orders_availability_comment_length_check;

ALTER TABLE customer_orders
  ADD CONSTRAINT customer_orders_availability_comment_length_check
  CHECK (availability_comment IS NULL OR char_length(availability_comment) <= 600);

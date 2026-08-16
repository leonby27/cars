CREATE TABLE IF NOT EXISTS customer_orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  listing_id TEXT NOT NULL REFERENCES listings(id),
  inspection_status TEXT NOT NULL DEFAULT 'decision',
  contract_status TEXT NOT NULL DEFAULT 'locked',
  payment_status TEXT NOT NULL DEFAULT 'locked',
  contract_confirmed_at TIMESTAMPTZ,
  invoice_requested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, listing_id),
  CHECK (inspection_status IN ('decision', 'requested', 'skipped')),
  CHECK (contract_status IN ('locked', 'available', 'confirmed')),
  CHECK (payment_status IN ('locked', 'available', 'invoice_requested'))
);

CREATE INDEX IF NOT EXISTS customer_orders_customer_idx
  ON customer_orders(customer_id, updated_at DESC);

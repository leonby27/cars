CREATE TABLE IF NOT EXISTS partner_registration_requests (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  phone TEXT NOT NULL UNIQUE CHECK (phone ~ '^\+(375[0-9]{9}|7[0-9]{10})$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

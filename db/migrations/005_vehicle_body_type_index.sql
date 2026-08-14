CREATE INDEX IF NOT EXISTS vehicles_body_type_idx
  ON vehicles ((specifications->>'bodyType'));

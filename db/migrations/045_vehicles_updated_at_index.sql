-- The ABDrive price index checks this timestamp instead of repricing the full
-- catalog on a timer. The listing change timestamp already has an index.
CREATE INDEX IF NOT EXISTS vehicles_updated_at_idx ON vehicles(updated_at DESC);

-- Additive, independently applied schema. Does not alter legacy BY listings/prices.
-- Immutable versions: an old calculation cannot overwrite another market or newer inputs.
CREATE TABLE IF NOT EXISTS market_offers (
  listing_id text NOT NULL,
  market text NOT NULL CHECK (market IN ('BY', 'RU')),
  destination_id text NOT NULL,
  scenario_id text NOT NULL,
  source_version text NOT NULL,
  rules_version text NOT NULL,
  rates_version text NOT NULL,
  tariffs_version text NOT NULL,
  valuation_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('estimated', 'unavailable', 'ineligible')),
  currency text NOT NULL CHECK (currency IN ('BYN', 'RUB')),
  total_amount numeric(16,2),
  calculation jsonb,
  reason text,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listing_id, market, destination_id, scenario_id,
    source_version, rules_version, rates_version, tariffs_version, valuation_date),
  CHECK ((market = 'BY' AND currency = 'BYN') OR (market = 'RU' AND currency = 'RUB')),
  CHECK ((status = 'estimated' AND total_amount IS NOT NULL AND total_amount > 0 AND calculation IS NOT NULL AND jsonb_typeof(calculation) = 'object' AND reason IS NULL)
    OR (status <> 'estimated' AND total_amount IS NULL AND calculation IS NULL AND reason IS NOT NULL AND length(trim(reason)) > 0))
);
CREATE INDEX IF NOT EXISTS market_offers_price_idx
  ON market_offers (market, destination_id, scenario_id, rules_version, rates_version,
    tariffs_version, valuation_date, total_amount, listing_id) WHERE status = 'estimated';

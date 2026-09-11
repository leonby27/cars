ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- Старые снятые объявления уже имеют время последней проверки. Оно даёт им
-- такое же ограниченное окно, как новым, вместо повторного запуска двух недель
-- для всего исторического архива в день выкладки.
UPDATE listings
SET sold_at = COALESCE(last_checked_at, last_seen_at, imported_at)
WHERE status = 'unavailable' AND sold_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_sold_at_idx
  ON listings(sold_at)
  WHERE status = 'unavailable';

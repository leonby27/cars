-- Стрелка изменения цены на карточке: нужна прошлая цена и дата, когда она
-- поменялась. Прошлую цену храним в долларах — именно её отдаёт источник, и
-- именно из неё считается «под ключ» на сайте. Конвертация в юани и обратно
-- сдвигала бы старую цену на десятки долларов (см. che168-price-double-conversion).
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS previous_price_usd NUMERIC,
  ADD COLUMN IF NOT EXISTS price_changed_at TIMESTAMPTZ;

-- Прошлым переоценкам дату и цену восстанавливаем из истории цен: берём
-- предпоследнюю точку. Она в юанях, поэтому доллары получаются с точностью до
-- курса — для уже случившихся изменений это единственный доступный источник.
WITH steps AS (
  SELECT listing_id,
         price_cny,
         observed_at,
         row_number() OVER (PARTITION BY listing_id ORDER BY observed_at DESC) AS rn
    FROM price_history
), last_change AS (
  SELECT current.listing_id,
         previous.price_cny AS previous_price_cny,
         current.observed_at AS changed_at
    FROM steps current
    JOIN steps previous ON previous.listing_id = current.listing_id AND previous.rn = 2
   WHERE current.rn = 1 AND current.price_cny <> previous.price_cny
)
UPDATE listings l
   SET previous_price_usd = round(last_change.previous_price_cny / 7.15),
       price_changed_at = last_change.changed_at
  FROM last_change
 WHERE l.id = last_change.listing_id
   AND l.price_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS listings_price_changed_at_idx ON listings (price_changed_at DESC) WHERE price_changed_at IS NOT NULL;

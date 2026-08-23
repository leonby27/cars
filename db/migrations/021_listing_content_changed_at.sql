-- Когда данные объявления изменились по-настоящему.
--
-- Нужно карте сайта: по дате изменения поисковик решает, стоит ли заходить на страницу
-- заново. Прежде в карте стояла `imported_at` — она одинаковая у всех 31 332 карточек,
-- потому что приходит из последнего полного импорта. То есть поисковику мы сообщали
-- «ничего не менялось» даже когда у машины менялась цена.
--
-- Остальные даты для этого не годятся: `last_seen_at` и `last_checked_at` обновляются
-- при каждой проверке объявления, даже когда ничего не изменилось, — по ним поисковик
-- решил бы, что раз в сутки меняется весь каталог.
--
-- Значение пишет `upsertCar` (server/repository.mjs) и только тогда, когда отличается
-- отпечаток содержимого `content_hash`. Существующим объявлениям ставим `imported_at`:
-- это дата, когда мы их последний раз записывали.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS content_changed_at TIMESTAMPTZ;

UPDATE listings SET content_changed_at = imported_at WHERE content_changed_at IS NULL;

ALTER TABLE listings ALTER COLUMN content_changed_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS listings_content_changed_idx ON listings(content_changed_at DESC);

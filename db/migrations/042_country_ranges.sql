-- Страна посетителя в разделе «Заходы»: Беларусь, Россия или другая.
--
-- Адреса, выданные сетям Беларуси и России, публикует RIPE (регистратор адресов
-- Европы и СНГ). Таблицу переписывает `npm run countries`
-- (scripts/update-country-ranges.mjs) раз в неделю, вместе со списком дата-центров.
-- Сам адрес посетителя не храним: при записи захода в событие ложится только код
-- страны.
CREATE TABLE IF NOT EXISTS country_ranges (
  network CIDR PRIMARY KEY,
  country TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS country_ranges_network_idx
  ON country_ranges USING gist (network inet_ops);

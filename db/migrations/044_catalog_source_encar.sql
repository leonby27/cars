-- Корейский источник Encar (29.09.2026): заведён выключенным, чтобы первые импорты
-- ложились в базу, но не показывались в каталоге, пока Сергей не включит источник
-- (переключатель в кабинете, server/catalog-sources.mjs). Включённый источник
-- виден через тот же вид catalog_listings, что и Che168.
INSERT INTO catalog_sources(source, enabled) VALUES ('Encar', false) ON CONFLICT DO NOTHING;

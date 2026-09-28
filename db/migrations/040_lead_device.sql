-- Устройство, с которого оставили заявку из кабинета: компьютер или телефон и
-- система (Android, iOS, Windows…). Определяет сервер по заголовкам запроса — так же,
-- как у событий аналитики. У заявок с формы сайта то же лежит в calculation.
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS device TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS platform TEXT;

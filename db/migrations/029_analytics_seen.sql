-- Когда сотрудник в последний раз открывал каждый пункт раздела аналитики.
-- Раньше это лежало в браузере, и просмотр с телефона не гасил красные цифры
-- на компьютере. Вход в раздел один на всех, поэтому и отметка одна на всех.
CREATE TABLE IF NOT EXISTS analytics_seen (
  section TEXT PRIMARY KEY,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

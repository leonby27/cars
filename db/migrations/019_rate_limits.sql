-- Счётчики частоты запросов. Держим их в базе, а не в памяти сервера: на Vercel
-- каждый запрос может попасть в свой экземпляр функции, и счётчик в памяти
-- ограничивал бы только один из них, то есть почти ничего.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits INTEGER NOT NULL DEFAULT 0
);

-- По этому полю подчищаются просроченные счётчики (`npm run db:expire`).
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits(window_started_at);

-- Сохранённые поиски: набор фильтров каталога, к которому клиент возвращается
-- из личного кабинета. Фильтры лежат целиком в JSONB — форма набора живёт во
-- фронтенде, и новая выпадашка не требует новой колонки. Уникальность по паре
-- (клиент, фильтры) не даёт одному и тому же поиску сохраниться дважды.
CREATE TABLE IF NOT EXISTS customer_searches (
  id BIGSERIAL PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  filters JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, filters)
);

CREATE INDEX IF NOT EXISTS customer_searches_customer_idx
  ON customer_searches(customer_id, created_at DESC);

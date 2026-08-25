-- Признак «за событием стоит живой человек». Ставится не сразу: страница сначала
-- записывает заход, а отметку получает, когда посетитель себя проявит — подвигает
-- мышью, коснётся экрана, прокрутит, нажмёт клавишу или просто пробудет на открытой
-- странице. Роботы, которые снимают страницу и уходят, отметку не получают никогда,
-- поэтому в разделе аналитики видны отдельно и в число посетителей не входят.
ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS human BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS analytics_events_human_idx
  ON analytics_events(visitor_id, created_at DESC)
  WHERE human;

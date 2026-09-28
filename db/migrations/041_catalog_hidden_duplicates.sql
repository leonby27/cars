-- Какие дубли сейчас скрыты — готовым списком, а не проверкой в каждом запросе.
-- Раньше вид catalog_listings для каждого запроса заново искал среди ~5,5 тыс. пар,
-- чья машина Che168 ещё в продаже: на боевом сервере это удваивало подсчёт по всему
-- каталогу (0,16 → 0,35 с), а в параллельном плане каждый поток повторял поиск сам.
--
-- Правило то же, что в 039: Guazi скрыт, пока его пара активна и её источник включён.
-- Список держат триггеры, поэтому он меняется в той же транзакции, что и причина:
-- пара ушла из продажи, источник выключили, пересчёт дублей поменял пары. Сами
-- объявления не трогаются. Единственная щель — гонка двух транзакций: пару снимают
-- с продажи в ту же секунду, когда часовой пересчёт подтверждает пары. Тогда дубль
-- может остаться скрытым до следующего пересчёта: тот подтверждает все пары и
-- заново сверяет каждую.
CREATE TABLE IF NOT EXISTS catalog_hidden_duplicates (
  listing_id text PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE
);

-- Пересчитать скрытость для перечисленных дублей: лишние убрать, нужные добавить.
-- Без удаления и повторной вставки уже верных строк — пересчёт дублей раз в час
-- подтверждает все пары, и таблица не должна от этого пухнуть.
CREATE OR REPLACE FUNCTION catalog_hidden_sync(ids text[]) RETURNS void
LANGUAGE sql AS $$
  WITH wanted AS (
    SELECT d.duplicate_listing_id AS listing_id
    FROM catalog_duplicate_matches d
    JOIN listings canonical ON canonical.id=d.canonical_listing_id
    WHERE d.duplicate_listing_id = ANY(ids)
      AND canonical.status='active'
      AND NOT EXISTS (
        SELECT 1 FROM catalog_sources s
        WHERE s.source=canonical.source AND NOT s.enabled
      )
  ), dropped AS (
    DELETE FROM catalog_hidden_duplicates h
    WHERE h.listing_id = ANY(ids)
      AND NOT EXISTS (SELECT 1 FROM wanted w WHERE w.listing_id=h.listing_id)
  )
  INSERT INTO catalog_hidden_duplicates(listing_id)
  SELECT listing_id FROM wanted
  ON CONFLICT DO NOTHING;
$$;

-- Пары поменялись: пересчёт касается только затронутых дублей.
CREATE OR REPLACE FUNCTION catalog_hidden_on_matches() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM catalog_hidden_sync(ARRAY(SELECT duplicate_listing_id FROM changed_new));
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM catalog_hidden_sync(ARRAY(
      SELECT duplicate_listing_id FROM changed_new
      UNION SELECT duplicate_listing_id FROM changed_old));
  ELSE
    PERFORM catalog_hidden_sync(ARRAY(SELECT duplicate_listing_id FROM changed_old));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS catalog_hidden_matches_insert ON catalog_duplicate_matches;
CREATE TRIGGER catalog_hidden_matches_insert AFTER INSERT ON catalog_duplicate_matches
  REFERENCING NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_hidden_on_matches();
DROP TRIGGER IF EXISTS catalog_hidden_matches_update ON catalog_duplicate_matches;
CREATE TRIGGER catalog_hidden_matches_update AFTER UPDATE ON catalog_duplicate_matches
  REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_hidden_on_matches();
DROP TRIGGER IF EXISTS catalog_hidden_matches_delete ON catalog_duplicate_matches;
CREATE TRIGGER catalog_hidden_matches_delete AFTER DELETE ON catalog_duplicate_matches
  REFERENCING OLD TABLE AS changed_old
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_hidden_on_matches();

-- Машина-пара продана, вернулась в продажу или сменила источник. Построчный триггер
-- с условием WHEN: обычное обновление объявления (цена, дата проверки) функцию не
-- вызывает вовсе, а смена статуса стоит одного поиска по индексу пар.
CREATE OR REPLACE FUNCTION catalog_hidden_on_listing() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM catalog_duplicate_matches WHERE canonical_listing_id=NEW.id) THEN
    PERFORM catalog_hidden_sync(ARRAY(
      SELECT duplicate_listing_id FROM catalog_duplicate_matches WHERE canonical_listing_id=NEW.id));
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS catalog_hidden_listing_change ON listings;
CREATE TRIGGER catalog_hidden_listing_change AFTER UPDATE OF status, source ON listings
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.source IS DISTINCT FROM NEW.source)
  EXECUTE FUNCTION catalog_hidden_on_listing();

-- Источник включили или выключили: пересчитать все пары.
CREATE OR REPLACE FUNCTION catalog_hidden_on_sources() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM catalog_hidden_sync(ARRAY(SELECT duplicate_listing_id FROM catalog_duplicate_matches));
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS catalog_hidden_sources_change ON catalog_sources;
CREATE TRIGGER catalog_hidden_sources_change AFTER INSERT OR UPDATE OR DELETE ON catalog_sources
  FOR EACH STATEMENT EXECUTE FUNCTION catalog_hidden_on_sources();

SELECT catalog_hidden_sync(ARRAY(SELECT duplicate_listing_id FROM catalog_duplicate_matches));

-- Проверка источника обёрнута в «ни один источник не выключен ИЛИ …». Смысл тот же,
-- но планировщик больше не делит оценку каталога пополам: соединение по источнику он
-- считал отсевом половины машин даже при всех включённых, недооценивал выдачу вдвое
-- и шёл к машинам медленным путём — по одной на каждую из 80 тыс. Замер на боевой
-- базе 28.09.2026, счёт по маркам: 0,32–0,52 с было, ~0,2 с с этой записью.
CREATE OR REPLACE VIEW catalog_listings AS
SELECT l.*
FROM listings l
WHERE (
  NOT EXISTS (SELECT 1 FROM catalog_sources WHERE NOT enabled)
  OR NOT EXISTS (
    SELECT 1 FROM catalog_sources s
    WHERE s.source=l.source AND NOT s.enabled
  )
)
AND NOT EXISTS (
  SELECT 1 FROM catalog_hidden_duplicates h WHERE h.listing_id=l.id
);

ANALYZE catalog_sources;
ANALYZE catalog_hidden_duplicates;

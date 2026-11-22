ALTER TABLE analytics_events ADD COLUMN excluded_single_car_visit boolean NOT NULL DEFAULT false;

CREATE TABLE analytics_pending_events (LIKE analytics_events INCLUDING DEFAULTS);
ALTER TABLE analytics_pending_events ADD PRIMARY KEY (event_id);
CREATE INDEX analytics_pending_visitor_created_idx ON analytics_pending_events (visitor_id, created_at DESC);
CREATE INDEX analytics_pending_created_idx ON analytics_pending_events (created_at);

CREATE FUNCTION analytics_single_car_landing(landing text, props jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  -- Страны СНГ, включая страны-учредители без полного членства. Пустой код
  -- и legacy other не подтверждают, что человек находится за пределами СНГ.
  SELECT coalesce(
    split_part(split_part(landing, '?', 1), '#', 1) ~ '^/cars/[^/]+/?$'
    AND lower(props->>'entrySource') = 'direct'
    AND props->>'device' = 'desktop'
    AND props->>'country' ~ '^[A-Z]{2}$'
    AND props->>'country' NOT IN ('AM','AZ','BY','KG','KZ','MD','RU','TJ','TM','UA','UZ')
    AND coalesce(props->>'acquisition', 'organic') = 'organic'
    AND landing !~* '(^|[?&])((ysclid|yclid|gclid|gbraid|wbraid|utm_source)=[^&#]+|utm_medium=(cpc|ppc|cpm|cpa|paid|paid_search|paid_social|display|banner|search|rsya|rsy|yan|рся)(&|#|$))',
    false
  )
$$;

CREATE FUNCTION analytics_visit_cutoff(moment timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
  SELECT greatest(moment - interval '30 minutes',
    date_trunc('day', moment AT TIME ZONE 'Europe/Minsk') AT TIME ZONE 'Europe/Minsk')
$$;

-- Сохраняем исходные события истории. Открытый на момент миграции заход
-- переносим также в буфер, чтобы второй просмотр мог вернуть его в отчёт.
WITH candidates AS (
  SELECT DISTINCT visitor_id
  FROM analytics_events
  WHERE analytics_single_car_landing(path, properties)
), steps AS (
  SELECT e.*,
    lag(created_at) OVER (PARTITION BY e.visitor_id ORDER BY created_at, id) AS previous_at
  FROM candidates JOIN analytics_events e USING (visitor_id)
  WHERE path !~ '^/(analytics|partner)(/|[?]|$)'
    AND path !~* '(^|[?&])nocount=1(&|$)'
    AND event_id NOT IN ('969d1f39-be7a-4065-9a1f-7cdc7281ba03','43488ceb-6864-4c3b-aba5-4f1825f63d80')
), numbered AS (
  SELECT *, sum(CASE WHEN previous_at IS NULL OR previous_at < analytics_visit_cutoff(created_at)
    THEN 1 ELSE 0 END) OVER (PARTITION BY visitor_id ORDER BY created_at, id) AS visit
  FROM steps
), excluded AS (
  SELECT unnest(array_agg(id)) AS id, max(created_at) AS last_at
  FROM numbered
  GROUP BY visitor_id, visit
  HAVING count(*) FILTER (WHERE event_name = 'page_view') = 1
    AND (array_agg(analytics_single_car_landing(path, properties) ORDER BY created_at, id))[1]
), marked AS (
  UPDATE analytics_events e SET excluded_single_car_visit = true
  FROM excluded x WHERE e.id = x.id
  RETURNING e AS event, x.last_at
)
INSERT INTO analytics_pending_events
SELECT (event).* FROM marked WHERE last_at >= analytics_visit_cutoff(statement_timestamp());

-- Единственный способ переноса из буфера в историю. Сохраняем время, порядок
-- и подтверждения, включая исторические события с тем же event_id.
CREATE FUNCTION analytics_finish_pending_visit(visitor text, keep_visit boolean)
RETURNS void LANGUAGE sql AS $$
  WITH pending AS (
    DELETE FROM analytics_pending_events WHERE visitor_id = visitor RETURNING *
  )
  INSERT INTO analytics_events
    (id,event_id,visitor_id,session_id,event_name,path,listing_id,listing_title,properties,created_at,human,human_action)
  SELECT id,event_id,visitor_id,session_id,event_name,path,listing_id,listing_title,properties,created_at,human,human_action
  FROM pending WHERE keep_visit
  ON CONFLICT (event_id) DO UPDATE SET excluded_single_car_visit = false,
    human = analytics_events.human OR EXCLUDED.human,
    human_action = analytics_events.human_action OR EXCLUDED.human_action
  WHERE analytics_events.visitor_id = EXCLUDED.visitor_id AND analytics_events.excluded_single_car_visit
$$;

CREATE FUNCTION analytics_route_event()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  cutoff timestamptz;
  last_pending timestamptz;
  pending_views integer;
  active_visit boolean := true;
BEGIN
  -- Вложенная вставка восстанавливает исходные события из буфера.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  PERFORM pg_advisory_xact_lock_shared(7240153, 0);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.visitor_id, 7240153));
  NEW.created_at := clock_timestamp();
  cutoff := analytics_visit_cutoff(NEW.created_at);

  SELECT max(created_at), count(*) FILTER (WHERE event_name = 'page_view')
  INTO last_pending, pending_views FROM analytics_pending_events WHERE visitor_id = NEW.visitor_id;
  IF last_pending < cutoff THEN
    PERFORM analytics_finish_pending_visit(NEW.visitor_id, pending_views = 0);
    last_pending := NULL;
    pending_views := 0;
  END IF;

  -- Один дубль в пределах пяти секунд, даже если первый запрос ещё в буфере.
  IF EXISTS (SELECT 1 FROM analytics_events WHERE event_id = NEW.event_id)
    OR EXISTS (SELECT 1 FROM analytics_pending_events WHERE event_id = NEW.event_id)
    OR EXISTS (
      SELECT 1 FROM (
        SELECT event_name,path,listing_id,properties FROM analytics_events
          WHERE visitor_id = NEW.visitor_id AND created_at > NEW.created_at - interval '5 seconds'
        UNION ALL
        SELECT event_name,path,listing_id,properties FROM analytics_pending_events
          WHERE visitor_id = NEW.visitor_id AND created_at > NEW.created_at - interval '5 seconds'
      ) recent
      WHERE event_name = NEW.event_name AND listing_id IS NOT DISTINCT FROM NEW.listing_id
        AND (NEW.listing_id IS NOT NULL OR path = NEW.path)
        AND coalesce(properties->>'query','') = coalesce(NEW.properties->>'query','')
    )
  THEN RETURN NULL;
  END IF;

  IF last_pending IS NULL AND analytics_single_car_landing(NEW.path, NEW.properties) THEN
    SELECT EXISTS (SELECT 1 FROM analytics_events
      WHERE visitor_id = NEW.visitor_id AND created_at >= cutoff AND NOT excluded_single_car_visit)
    INTO active_visit;
  END IF;

  IF last_pending IS NOT NULL OR NOT active_visit THEN
    IF NEW.event_name = 'page_view' AND pending_views = 1 THEN
      PERFORM analytics_finish_pending_visit(NEW.visitor_id, true);
      RETURN NEW;
    END IF;
    INSERT INTO analytics_pending_events SELECT NEW.*
    ON CONFLICT (event_id) DO NOTHING;
    RETURN NULL;
  END IF;

  RETURN NEW;
END
$$;

-- Принимаем и запросы старого процесса между миграцией и его перезапуском.
-- Импорт истории и перенос из буфера передают своё время события.
CREATE TRIGGER analytics_route_live_event BEFORE INSERT ON analytics_events
FOR EACH ROW WHEN (NEW.created_at = transaction_timestamp())
EXECUTE FUNCTION analytics_route_event();

CREATE FUNCTION analytics_expire_pending_visits()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  cutoff timestamptz := analytics_visit_cutoff(statement_timestamp());
  visitor text;
  last_at timestamptz;
  views integer;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(7240153, 0);
  FOR visitor IN SELECT DISTINCT visitor_id FROM analytics_pending_events WHERE created_at < cutoff LOOP
    IF pg_try_advisory_xact_lock(hashtextextended(visitor, 7240153)) THEN
      SELECT max(created_at), count(*) FILTER (WHERE event_name = 'page_view') INTO last_at, views
      FROM analytics_pending_events WHERE visitor_id = visitor;
      IF last_at < cutoff THEN
        PERFORM analytics_finish_pending_visit(visitor, views = 0);
      END IF;
    END IF;
  END LOOP;
END
$$;

CREATE FUNCTION analytics_confirm_visit(p_visitor text, p_session text, p_action boolean)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  saved integer;
  pending integer;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(7240153, 0);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_visitor, 7240153));

  UPDATE analytics_events SET human = true, human_action = human_action OR p_action
  WHERE visitor_id = p_visitor AND session_id = p_session AND NOT (human AND (human_action OR NOT p_action))
    AND path !~ '^/(analytics|partner)(/|[?]|$)'
    AND event_id NOT IN ('969d1f39-be7a-4065-9a1f-7cdc7281ba03','43488ceb-6864-4c3b-aba5-4f1825f63d80')
    AND created_at > now() - interval '12 hours'
    AND NOT excluded_single_car_visit;
  GET DIAGNOSTICS saved = ROW_COUNT;

  UPDATE analytics_pending_events SET human = true, human_action = human_action OR p_action
  WHERE visitor_id = p_visitor AND session_id = p_session AND NOT (human AND (human_action OR NOT p_action))
    AND EXISTS (SELECT 1 FROM analytics_pending_events recent
      WHERE recent.visitor_id = p_visitor AND recent.created_at >= analytics_visit_cutoff(statement_timestamp()));
  GET DIAGNOSTICS pending = ROW_COUNT;

  RETURN saved + pending;
END
$$;

CREATE FUNCTION analytics_reset_events()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  deleted integer;
BEGIN
  PERFORM pg_advisory_xact_lock(7240153, 0);
  DELETE FROM analytics_pending_events;
  DELETE FROM analytics_events;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END
$$;

-- Поиск по всей карточке, а не только по марке и модели: название, комплектация,
-- город и все характеристики машины складываются в одну строку у объявления.
-- Строка лежит рядом с объявлением, потому что искать по двум таблицам сразу
-- нечем: указатель строится по одной. Без указателя такой поиск по каталогу
-- занимал 0,44 секунды на каждый запрос.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE listings ADD COLUMN IF NOT EXISTS search_text text;

-- Числа целиком (мощность, момент, разгон, диаметр диска) в строку не попадают:
-- для них есть свои фильтры, а «500» внутри «1500» и «4500» давало бы случайные
-- совпадения. Числа внутри слов остаются: «401KM», «1.3T», «215/65 R16».
CREATE OR REPLACE FUNCTION listing_search_text(
  p_title text,
  p_description text,
  p_city text,
  p_brand text,
  p_model text,
  p_specs jsonb
) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(
    lower(
      concat_ws(' ',
        p_brand,
        p_model,
        p_title,
        p_description,
        p_city,
        (SELECT string_agg(value, ' ')
           FROM jsonb_each_text(COALESCE(p_specs, '{}'::jsonb))
          WHERE value IS NOT NULL
            AND value <> ''
            AND value !~ '^[0-9]+([.,][0-9]+)?$')
      )
    ),
    'ё', 'е')
$$;

CREATE OR REPLACE FUNCTION listings_fill_search_text() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE car RECORD;
BEGIN
  SELECT brand, model, specifications INTO car FROM vehicles WHERE id = NEW.vehicle_id;
  NEW.search_text := listing_search_text(NEW.title, NEW.description, NEW.city, car.brand, car.model, car.specifications);
  RETURN NEW;
END $$;

-- Характеристики живут у машины, а строка поиска — у объявления, поэтому пересчёт
-- идёт с двух сторон: при записи объявления и при изменении характеристик машины
-- (их переписывает `npm run db:respec`). Иначе строка молча устаревала бы.
CREATE OR REPLACE FUNCTION vehicles_refresh_search_text() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE listings
     SET search_text = listing_search_text(title, description, city, NEW.brand, NEW.model, NEW.specifications)
   WHERE vehicle_id = NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS listings_search_text_write ON listings;
CREATE TRIGGER listings_search_text_write
  BEFORE INSERT OR UPDATE OF title, description, city, vehicle_id ON listings
  FOR EACH ROW EXECUTE FUNCTION listings_fill_search_text();

DROP TRIGGER IF EXISTS vehicles_search_text_refresh ON vehicles;
CREATE TRIGGER vehicles_search_text_refresh
  AFTER UPDATE ON vehicles
  FOR EACH ROW
  WHEN (OLD.brand IS DISTINCT FROM NEW.brand
     OR OLD.model IS DISTINCT FROM NEW.model
     OR OLD.specifications IS DISTINCT FROM NEW.specifications)
  EXECUTE FUNCTION vehicles_refresh_search_text();

UPDATE listings l
   SET search_text = listing_search_text(l.title, l.description, l.city, v.brand, v.model, v.specifications)
  FROM vehicles v
 WHERE v.id = l.vehicle_id;

CREATE INDEX IF NOT EXISTS listings_search_text_idx ON listings USING gin (search_text gin_trgm_ops);

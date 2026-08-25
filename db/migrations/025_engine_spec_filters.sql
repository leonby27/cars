-- Объём мотора, мощность и тип коробки как отдельные значения характеристик.
-- Источник присылает их описанием («1.4T 150HP L4», «7-speed wet dual-clutch»),
-- и разбирать эти строки прямо в отборе каталога дорого: на полном каталоге такой
-- запрос занимал полсекунды вместо восьмидесяти миллисекунд. Правила разбора те же,
-- что в src/engine-spec.js; при импорте значения пишутся сразу (server/repository.mjs),
-- здесь они досчитываются для уже загруженных машин.
UPDATE vehicles SET specifications = specifications || jsonb_strip_nulls(jsonb_build_object(
  'engineVolume', (
    SELECT CASE WHEN value >= 0.5 AND value <= 8 THEN to_jsonb(value) END
    FROM (SELECT NULLIF(substring(upper(coalesce(specifications->>'engine','')) from '([0-9]+\.?[0-9]*) ?[LT]'),'')::numeric AS value) parsed
  ),
  'enginePower', (
    SELECT CASE WHEN value >= 30 AND value <= 2000 THEN to_jsonb(value) END
    FROM (SELECT NULLIF(substring(upper(coalesce(specifications->>'engine','')) from '([0-9]{2,4}) ?-? ?(HP|HORSEPOWER)'),'')::numeric AS value) parsed
  ),
  'gearbox', to_jsonb(NULLIF(CASE
    WHEN btrim(lower(coalesce(specifications->>'transmission',''))) ~ 'dual.?clutch|dct|dsg' THEN 'Робот'
    WHEN btrim(lower(coalesce(specifications->>'transmission',''))) ~ 'cvt|continuously variable' THEN 'Вариатор'
    WHEN btrim(lower(coalesce(specifications->>'transmission',''))) ~ 'automatic|dht' OR btrim(lower(coalesce(specifications->>'transmission','')))='at' THEN 'Автомат'
    WHEN btrim(lower(coalesce(specifications->>'transmission',''))) ~ 'manual' OR btrim(lower(coalesce(specifications->>'transmission','')))='mt' THEN 'Механика'
    ELSE '' END, ''))
))
WHERE coalesce(specifications->>'engine','') <> '' OR coalesce(specifications->>'transmission','') <> '';

CREATE INDEX IF NOT EXISTS vehicles_engine_volume_idx ON vehicles ((NULLIF(specifications->>'engineVolume','')::numeric));
CREATE INDEX IF NOT EXISTS vehicles_engine_power_idx ON vehicles ((NULLIF(specifications->>'enginePower','')::numeric));
CREATE INDEX IF NOT EXISTS vehicles_gearbox_idx ON vehicles ((specifications->>'gearbox'));

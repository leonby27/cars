-- Топливо машины отдельным значением характеристик. Источник называет его словами
-- в карточке («Gasoline», «Diesel», «Gasoline + 48V Mild Hybrid System»), мы это
-- всегда сохраняли в исходных данных объявления, но отобрать по нему не могли.
-- Правила разбора те же, что в src/engine-spec.js; при импорте значение пишется
-- сразу (server/repository.mjs), здесь оно досчитывается для уже загруженных машин.
UPDATE vehicles v SET specifications = v.specifications || jsonb_build_object('fuelType', to_jsonb(source.kind))
FROM (
  SELECT l.vehicle_id,
    CASE
      WHEN lower(coalesce(l.source_payload->>'sourceFuelType','')) LIKE '%diesel%' THEN 'Дизель'
      WHEN lower(coalesce(l.source_payload->>'sourceFuelType','')) LIKE '%gasoline%'
        OR lower(coalesce(l.source_payload->>'sourceFuelType','')) LIKE '%petrol%' THEN 'Бензин'
    END AS kind
  FROM listings l
) source
WHERE source.vehicle_id = v.id AND source.kind IS NOT NULL;

CREATE INDEX IF NOT EXISTS vehicles_fuel_type_idx ON vehicles ((specifications->>'fuelType'));

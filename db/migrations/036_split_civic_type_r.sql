-- Отделяем Type R от обычного Civic также в уже импортированных объявлениях.
-- Условия соответствуют canonicalImportName: Honda + Civic/思域 + явный Type R.
-- Не определяем спортивную версию по цене, мощности, мотору или слову Import.
UPDATE vehicles v
SET model = 'Civic Type R', updated_at = now()
WHERE v.brand = 'Honda'
  AND v.model <> 'Civic Type R'
  AND EXISTS (
    SELECT 1 FROM listings l WHERE l.vehicle_id = v.id
      AND concat_ws(' ', v.model, l.source_payload->>'rawSeries') ~* '\mcivic\M|思域'
      AND concat_ws(' ', v.model, l.source_payload->>'rawSeries',
        COALESCE(NULLIF(l.source_payload->>'rawModel', ''), l.description))
        ~* '\mtype[[:space:]‐‑–—-]*r\M'
  );

-- Триггеры из 035 одновременно обновят поисковую строку. ID, ссылки, исходная
-- комплектация, фотографии, цены и история автомобиля остаются прежними.
UPDATE listings l
SET title = concat_ws(' ', v.brand, v.model, v.model_year),
    source_payload = COALESCE(l.source_payload, '{}'::jsonb) || jsonb_build_object(
      'brand', v.brand, 'model', v.model,
      'title', concat_ws(' ', v.brand, v.model, v.model_year)),
    content_changed_at = now()
FROM vehicles v
WHERE l.vehicle_id = v.id AND v.brand = 'Honda' AND v.model = 'Civic Type R'
  AND (l.title IS DISTINCT FROM concat_ws(' ', v.brand, v.model, v.model_year)
    OR l.source_payload->>'model' IS DISTINCT FROM v.model);

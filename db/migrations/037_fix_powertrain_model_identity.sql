-- У Che168 электрический Song PLUS лежит внутри серии с ошибочной подписью PHEV.
-- Точный тип топлива и комплектация при этом однозначны: Pure Electric / EV.
-- Отделяем такие машины от гибридного Song PLUS DM-i, сохраняя ID и исходные поля.
UPDATE vehicles v
SET model = 'Song PLUS EV', powertrain = 'Электромобиль', updated_at = now()
WHERE v.brand = 'BYD'
  AND v.model = 'Song PLUS DM-i'
  AND EXISTS (
    SELECT 1 FROM listings l
    WHERE l.vehicle_id = v.id
      AND COALESCE(l.source_payload->>'sourceFuelType', '') ~* 'pure electric|battery electric|^bev$|^ev$'
      AND COALESCE(l.source_payload->>'rawModel', l.description, '') ~* '(^|[^A-Z])EV([^A-Z]|$)|pure electric|battery electric'
  );

-- Те же коллизии нашлись ещё у двух моделей: тип двигателя в источнике точный,
-- а общее имя серии содержит неверный суффикс.
UPDATE vehicles v
SET model = 'Emgrand EV', updated_at = now()
WHERE v.brand = 'Geely'
  AND v.model = 'Emgrand PHEV'
  AND v.powertrain = 'Электромобиль'
  AND EXISTS (
    SELECT 1 FROM listings l
    WHERE l.vehicle_id = v.id
      AND COALESCE(l.source_payload->>'sourceFuelType', '') ~* 'pure electric|battery electric|^bev$|^ev$'
  );

UPDATE vehicles v
SET model = 'Tiggo 8 PRO PHEV', updated_at = now()
WHERE v.brand = 'Chery'
  AND v.model = 'Tiggo 8 PRO EV'
  AND v.powertrain = 'Гибрид'
  AND EXISTS (
    SELECT 1 FROM listings l
    WHERE l.vehicle_id = v.id
      AND COALESCE(l.source_payload->>'sourceFuelType', '') ~* 'plug[- ]in|hybrid|phev|подключаем'
  );

UPDATE listings l
SET title = concat_ws(' ', v.brand, v.model, v.model_year),
    source_payload = COALESCE(l.source_payload, '{}'::jsonb) || jsonb_build_object(
      'brand', v.brand,
      'model', v.model,
      'type', v.powertrain,
      'title', concat_ws(' ', v.brand, v.model, v.model_year)),
    content_changed_at = now()
FROM vehicles v
WHERE l.vehicle_id = v.id
  AND ((v.brand = 'BYD' AND v.model = 'Song PLUS EV')
    OR (v.brand = 'Geely' AND v.model = 'Emgrand EV')
    OR (v.brand = 'Chery' AND v.model = 'Tiggo 8 PRO PHEV'))
  AND (l.title IS DISTINCT FROM concat_ws(' ', v.brand, v.model, v.model_year)
    OR l.source_payload->>'model' IS DISTINCT FROM v.model
    OR l.source_payload->>'type' IS DISTINCT FROM v.powertrain);

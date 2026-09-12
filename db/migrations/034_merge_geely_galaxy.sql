-- Galaxy is a Geely model line. Keep model names intact, but use one catalog
-- brand for filters, counts, landing pages, refreshes, and future imports.
UPDATE vehicles
SET brand = 'Geely', updated_at = now()
WHERE brand = 'Geely Galaxy';

UPDATE listings AS l
SET title = concat_ws(' ', v.brand, v.model, v.model_year),
    source_payload = jsonb_set(
      jsonb_set(l.source_payload, '{brand}', to_jsonb(v.brand), true),
      '{title}',
      to_jsonb(concat_ws(' ', v.brand, v.model, v.model_year)),
      true
    )
FROM vehicles AS v
WHERE v.id = l.vehicle_id
  AND v.brand = 'Geely'
  AND l.source_payload->>'brand' = 'Geely Galaxy';

import crypto from "node:crypto";
import { pool, withTransaction } from "./db.mjs";
import { estimateLandedCost } from "../src/pricing.js";
import { normalizeBodyType } from "../src/body-types.js";

const normalizeScore = (value) => Number(value) > 100 ? Number(String(value).slice(0, 2)) : Number(value) || null;
const contentHash = (car) => crypto.createHash("sha256").update(JSON.stringify({ price:car.chinaPrice, mileage:car.mileage, status:car.status, description:car.description, images:car.images })).digest("hex");

export function normalizeCar(car) {
  const electricRange = car.electricRange ?? (Number(car.description?.match(/纯电续航\s*(\d+)/)?.[1]) || null);
  const combinedRange = car.combinedRange ?? (Number(car.description?.match(/综合续航\s*(\d+)/)?.[1]) || null);
  const model = car.brand === "Deepal" ? String(car.model).replace(/^深蓝/, "") : car.model;
  return { ...car, model, title:`${car.brand} ${model} ${car.year}`, bodyType:normalizeBodyType({ ...car, model }), appearanceScore:normalizeScore(car.appearanceScore), electricRange, combinedRange, range:car.range || electricRange || combinedRange };
}

export async function upsertCar(car, client = pool) {
  const item = normalizeCar(car);
  const checkedAt = item.checkedAt || item.importedAt || new Date().toISOString();
  const estimatedTotalUsd = estimateLandedCost(item).totalUsd;
  await client.query(`INSERT INTO vehicles (id, brand, model, model_year, powertrain, drivetrain, battery_kwh, electric_range_km, combined_range_km, specifications, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    ON CONFLICT (id) DO UPDATE SET brand=EXCLUDED.brand, model=EXCLUDED.model, model_year=EXCLUDED.model_year, powertrain=EXCLUDED.powertrain, drivetrain=EXCLUDED.drivetrain, battery_kwh=EXCLUDED.battery_kwh, electric_range_km=EXCLUDED.electric_range_km, combined_range_km=EXCLUDED.combined_range_km, specifications=EXCLUDED.specifications, updated_at=now()`,
    [item.id,item.brand,item.model,item.year,item.type,item.drive,item.battery,item.electricRange,item.combinedRange,JSON.stringify({ bodyType:item.bodyType,bodyStructure:item.bodyStructure,batteryType:item.batteryType,batteryBrand:item.batteryBrand,batteryHealth:item.batteryHealth,engine:item.engine,transmission:item.transmission,bodyColor:item.bodyColor,vehicleClass:item.vehicleClass,driverAssistance:item.driverAssistance,infotainmentChip:item.infotainmentChip,assistanceLevel:item.assistanceLevel,radarCount:item.radarCount,cameraCount:item.cameraCount,ultrasonicCount:item.ultrasonicCount,warranty:item.warranty,inspectionGrade:item.inspectionGrade,powertrainInspection:item.powertrainInspection,bodyInspection:item.bodyInspection,interiorInspection:item.interiorInspection,structureInspection:item.structureInspection,engineBayInspection:item.engineBayInspection,batteryProtection:item.batteryProtection })]);
  await client.query(`INSERT INTO listings (id, vehicle_id, source, external_id, source_url, title, city, first_registration, mileage_km, price_cny, guide_price_cny, owners, transfers, condition_grade, appearance_score, claims, description, status, content_hash, source_payload, last_seen_at, last_checked_at, imported_at, estimated_total_usd)
    VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',$17,$18,now(),$19,$20,$21)
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, city=EXCLUDED.city, first_registration=EXCLUDED.first_registration, mileage_km=EXCLUDED.mileage_km, price_cny=EXCLUDED.price_cny, guide_price_cny=EXCLUDED.guide_price_cny, owners=EXCLUDED.owners, transfers=EXCLUDED.transfers, condition_grade=EXCLUDED.condition_grade, appearance_score=EXCLUDED.appearance_score, claims=EXCLUDED.claims, description=EXCLUDED.description, status='active', content_hash=EXCLUDED.content_hash, source_payload=EXCLUDED.source_payload, last_seen_at=now(), last_checked_at=EXCLUDED.last_checked_at, imported_at=EXCLUDED.imported_at, estimated_total_usd=EXCLUDED.estimated_total_usd`,
    [item.id,item.source,item.externalId,item.sourceUrl,item.title,item.city,item.firstRegistration,item.mileage,item.chinaPrice,item.guidePriceCny,item.owners,item.transfers,item.conditionGrade,item.appearanceScore,item.claims || item.incident,item.description,contentHash(item),JSON.stringify(item),checkedAt,item.importedAt || checkedAt,estimatedTotalUsd]);
  await client.query("DELETE FROM listing_media WHERE listing_id=$1", [item.id]);
  const images = (item.images || [item.image]).filter(Boolean);
  if (images.length) await client.query(`INSERT INTO listing_media (listing_id, position, url)
    SELECT $1, ordinal::int - 1, url FROM unnest($2::text[]) WITH ORDINALITY AS media(url, ordinal)`, [item.id,images]);
  const history = item.priceHistory || [{ at:checkedAt, priceCny:item.chinaPrice }];
  if (history.length) await client.query(`INSERT INTO price_history (listing_id, observed_at, price_cny)
    SELECT $1, point.at, point.price_cny FROM jsonb_to_recordset($2::jsonb) AS point(at timestamptz, price_cny integer)
    ON CONFLICT DO NOTHING`, [item.id,JSON.stringify(history.map((point) => ({ at:point.at, price_cny:point.priceCny })))]);
  return item;
}

export async function importCars(cars, batchSize = 250) {
  for (let offset = 0; offset < cars.length; offset += batchSize) {
    const batch = cars.slice(offset, offset + batchSize);
    await withTransaction(async (client) => { for (const car of batch) await upsertCar(car, client); });
  }
  return cars.length;
}

const carSelect = `SELECT l.*, v.brand, v.model, v.model_year, v.powertrain, v.drivetrain, v.battery_kwh, v.electric_range_km, v.combined_range_km, v.specifications,
  COALESCE((SELECT json_agg(m.url ORDER BY m.position) FROM listing_media m WHERE m.listing_id=l.id), '[]'::json) AS images`;

export function buildCarFilters(searchParams) {
  const clauses = ["l.status='active'"];
  const values = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
  if (searchParams.get("type") && searchParams.get("type") !== "Все") add("v.powertrain=?", searchParams.get("type"));
  if (searchParams.get("brand") && searchParams.get("brand") !== "Все марки") add("v.brand=?", searchParams.get("brand"));
  if (searchParams.get("model") && searchParams.get("model") !== "Все модели") add("v.model=?", searchParams.get("model"));
  if (searchParams.get("bodyType") && searchParams.get("bodyType") !== "Все кузова") add("v.specifications->>'bodyType'=?", searchParams.get("bodyType"));
  if (searchParams.get("drive") && searchParams.get("drive") !== "Любой привод") add("v.drivetrain=?", searchParams.get("drive"));
  if (Number(searchParams.get("ownersMax"))) add("l.owners<=?", Number(searchParams.get("ownersMax")));
  if (searchParams.get("noClaims") === "1") clauses.push("COALESCE(l.claims, l.source_payload->>'claims', l.source_payload->>'incident') ~ '(0\\s*次理赔|理赔\\s*0\\s*次)'");
  if (["S", "A", "B", "C", "D"].includes(searchParams.get("conditionGrade"))) add("l.condition_grade=?", searchParams.get("conditionGrade"));
  if (Number(searchParams.get("yearMin"))) add("v.model_year>=?", Number(searchParams.get("yearMin")));
  if (Number(searchParams.get("mileageMax"))) add("l.mileage_km<=?", Number(searchParams.get("mileageMax")));
  if (Number(searchParams.get("priceCnyMax"))) add("l.price_cny<=?", Number(searchParams.get("priceCnyMax")));
  if (Number(searchParams.get("landedMax"))) add("l.estimated_total_usd<=?", Number(searchParams.get("landedMax")));
  return { where:`WHERE ${clauses.join(" AND ")}`, values };
}

export function buildCarOrder(searchParams) {
  const orders = {
    newest:"COALESCE(NULLIF(l.source_payload->>'sourceListedAt','')::timestamptz, l.first_seen_at) DESC NULLS LAST, l.id",
    price:"l.estimated_total_usd ASC NULLS LAST, l.id",
    price_asc:"l.estimated_total_usd ASC NULLS LAST, l.id",
    price_desc:"l.estimated_total_usd DESC NULLS LAST, l.id",
    mileage_asc:"l.mileage_km ASC NULLS LAST, l.id",
    range_desc:"COALESCE(v.electric_range_km, v.combined_range_km) DESC NULLS LAST, l.id",
    year_desc:"v.model_year DESC NULLS LAST, l.id",
    year_asc:"v.model_year ASC NULLS LAST, l.id",
  };
  return orders[searchParams.get("sort")] || orders.newest;
}

export function rowToCar(row) {
  const raw = row.source_payload || {};
  return normalizeCar({ ...raw, id:row.id, externalId:row.external_id, source:row.source, sourceUrl:row.source_url, title:row.title, brand:row.brand, model:row.model, year:row.model_year, type:row.powertrain, drive:row.drivetrain, battery:Number(row.battery_kwh) || null, electricRange:row.electric_range_km, combinedRange:row.combined_range_km, city:row.city, firstRegistration:row.first_registration, mileage:row.mileage_km, chinaPrice:row.price_cny, guidePriceCny:row.guide_price_cny, owners:row.owners, transfers:row.transfers, conditionGrade:row.condition_grade, appearanceScore:Number(row.appearance_score) || null, claims:row.claims, description:row.description, status:"Карточка доступна", statusTone:"green", images:row.images, image:row.images?.[0], checkedAt:row.last_checked_at, importedAt:row.imported_at, firstSeenAt:row.first_seen_at, sourceId:raw.sourceId || `${row.source === "Che168" ? "CH" : "GZ"}-${row.external_id}`, ...row.specifications });
}

export function withoutDetailPayload(car) {
  const { technicalSpecs, ...summary } = car;
  return summary;
}

export async function listCars(searchParams) {
  const { where, values } = buildCarFilters(searchParams);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 24));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const order = buildCarOrder(searchParams);
  const [itemsResult, countResult] = await Promise.all([
    pool.query(`${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values,limit,offset]),
    pool.query(`SELECT count(*)::int AS total FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values),
  ]);
  return { items:itemsResult.rows.map((row) => withoutDetailPayload(rowToCar(row))), total:countResult.rows[0].total, limit, offset };
}

export async function getCar(id) {
  const result = await pool.query(`${carSelect}, COALESCE((SELECT json_agg(json_build_object('at',p.observed_at,'priceCny',p.price_cny) ORDER BY p.observed_at) FROM price_history p WHERE p.listing_id=l.id), '[]'::json) AS price_history FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id=$1`, [id]);
  return result.rows[0] ? { ...rowToCar(result.rows[0]), priceHistory:result.rows[0].price_history } : null;
}

export async function getCatalogMeta(type, brand, bodyType) {
  const values = [];
  const filters = ["l.status='active'"];
  if (type && type !== "Все") { values.push(type); filters.push(`v.powertrain=$${values.length}`); }
  const brandValues = [...values];
  const brandFilters = [...filters];
  if (bodyType && bodyType !== "Все кузова") { brandValues.push(bodyType); brandFilters.push(`v.specifications->>'bodyType'=$${brandValues.length}`); }
  if (brand && brand !== "Все марки") { values.push(brand); filters.push(`v.brand=$${values.length}`); }
  const bodyFilters = [...filters];
  const bodyValues = [...values];
  if (bodyType && bodyType !== "Все кузова") { bodyValues.push(bodyType); bodyFilters.push(`v.specifications->>'bodyType'=$${bodyValues.length}`); }
  const where = `WHERE ${filters.join(" AND ")}`;
  const bodyWhere = `WHERE ${bodyFilters.join(" AND ")}`;
  const brandWhere = `WHERE ${brandFilters.join(" AND ")}`;
  const [count, brands, models, bodyTypes, drives, availability] = await Promise.all([
    pool.query(`SELECT count(*)::int total FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${bodyWhere}`, bodyValues),
    pool.query(`SELECT v.brand, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${brandWhere} GROUP BY v.brand ORDER BY v.brand`, brandValues),
    pool.query(`SELECT v.model, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${bodyWhere} GROUP BY v.model ORDER BY v.model`, bodyValues),
    pool.query(`SELECT v.specifications->>'bodyType' body_type, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} AND v.specifications->>'bodyType' IS NOT NULL AND v.specifications->>'bodyType'<>'Не определён' GROUP BY body_type ORDER BY count DESC, body_type`, values),
    pool.query("SELECT v.drivetrain drive, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active' AND v.drivetrain IS NOT NULL AND v.drivetrain<>'Не указан' GROUP BY v.drivetrain ORDER BY v.drivetrain"),
    pool.query("SELECT count(v.drivetrain)::int drive, count(l.owners)::int owners, count(l.claims)::int claims, count(l.condition_grade)::int condition FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active'"),
  ]);
  return { total:count.rows[0].total, brands:brands.rows, models:models.rows, bodyTypes:bodyTypes.rows, drives:drives.rows, availability:availability.rows[0] };
}

export async function createOrderDraft({ listingId, name = null, contact, calculation = {} }) {
  const result = await pool.query("INSERT INTO order_drafts (listing_id, customer_name, contact, calculation) VALUES ($1,$2,$3,$4) RETURNING id, listing_id, status, created_at", [listingId,name,contact,JSON.stringify(calculation)]);
  await pool.query(`INSERT INTO crawl_jobs (source, listing_id, job_type, url, priority)
    SELECT source, id, 'refresh_listing', source_url, 100 FROM listings WHERE id=$1
    ON CONFLICT (job_type, listing_id) WHERE status IN ('queued','running') DO UPDATE SET priority=GREATEST(crawl_jobs.priority,100), available_at=LEAST(crawl_jobs.available_at,now())`, [listingId]);
  return result.rows[0];
}

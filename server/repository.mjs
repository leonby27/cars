import crypto from "node:crypto";
import { canonicalImportModel } from "../config/import-policy.mjs";
import { pool, withTransaction } from "./db.mjs";
import { estimateLandedCost } from "../src/pricing.js";
import { normalizeBodyType } from "../src/body-types.js";
import { DRIVE_TYPES, normalizeDrive, orderDrives, UNKNOWN_DRIVE } from "../src/drive-types.js";

const normalizeScore = (value) => Number(value) > 100 ? Number(String(value).slice(0, 2)) : Number(value) || null;
const contentHash = (car) => crypto.createHash("sha256").update(JSON.stringify({ price:car.chinaPrice, mileage:car.mileage, status:car.status, description:car.description, images:car.images })).digest("hex");

export function normalizeCar(car) {
  const electricRange = car.electricRange ?? (Number(car.description?.match(/纯电续航\s*(\d+)/)?.[1]) || null);
  const combinedRange = car.combinedRange ?? (Number(car.description?.match(/综合续航\s*(\d+)/)?.[1]) || null);
  const model = canonicalImportModel(car.brand, car.model);
  return { ...car, model, title:`${car.brand} ${model} ${car.year}`, bodyType:normalizeBodyType({ ...car, model }), drive:normalizeDrive(car.drive), appearanceScore:normalizeScore(car.appearanceScore), electricRange, combinedRange, range:car.range || electricRange || combinedRange };
}

export async function upsertCar(car, client = pool) {
  const item = normalizeCar(car);
  const checkedAt = item.checkedAt || item.importedAt || new Date().toISOString();
  const estimatedTotalUsd = estimateLandedCost(item).totalUsd;
  await client.query(`INSERT INTO vehicles (id, brand, model, model_year, powertrain, drivetrain, battery_kwh, electric_range_km, combined_range_km, specifications, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    ON CONFLICT (id) DO UPDATE SET brand=EXCLUDED.brand, model=EXCLUDED.model, model_year=EXCLUDED.model_year, powertrain=EXCLUDED.powertrain, drivetrain=EXCLUDED.drivetrain, battery_kwh=EXCLUDED.battery_kwh, electric_range_km=EXCLUDED.electric_range_km, combined_range_km=EXCLUDED.combined_range_km, specifications=EXCLUDED.specifications, updated_at=now()`,
    [item.id,item.brand,item.model,item.year,item.type,item.drive,item.battery,item.electricRange,item.combinedRange,JSON.stringify({ bodyType:item.bodyType,bodyStructure:item.bodyStructure,batteryType:item.batteryType,batteryBrand:item.batteryBrand,batteryHealth:item.batteryHealth,engine:item.engine,transmission:item.transmission,bodyColor:item.bodyColor,acceleration:item.acceleration,torqueNm:item.torqueNm,tireSizeFront:item.tireSizeFront,tireRim:item.tireRim,vehicleClass:item.vehicleClass,driverAssistance:item.driverAssistance,infotainmentChip:item.infotainmentChip,assistanceLevel:item.assistanceLevel,radarCount:item.radarCount,cameraCount:item.cameraCount,ultrasonicCount:item.ultrasonicCount,warranty:item.warranty,inspectionGrade:item.inspectionGrade,powertrainInspection:item.powertrainInspection,bodyInspection:item.bodyInspection,interiorInspection:item.interiorInspection,structureInspection:item.structureInspection,engineBayInspection:item.engineBayInspection,batteryProtection:item.batteryProtection })]);
  await client.query(`INSERT INTO listings (id, vehicle_id, source, external_id, source_url, title, city, first_registration, mileage_km, price_cny, guide_price_cny, owners, transfers, condition_grade, appearance_score, claims, description, status, content_hash, source_payload, last_seen_at, last_checked_at, imported_at, estimated_total_usd, listed_at)
    VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',$17,$18,now(),$19,$20,$21,COALESCE(NULLIF($18::jsonb->>'sourceListedAt','')::timestamptz, now()))
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, city=EXCLUDED.city, first_registration=EXCLUDED.first_registration, mileage_km=EXCLUDED.mileage_km, price_cny=EXCLUDED.price_cny, guide_price_cny=EXCLUDED.guide_price_cny, owners=EXCLUDED.owners, transfers=EXCLUDED.transfers, condition_grade=EXCLUDED.condition_grade, appearance_score=EXCLUDED.appearance_score, claims=EXCLUDED.claims, description=EXCLUDED.description, status='active', content_hash=EXCLUDED.content_hash, source_payload=EXCLUDED.source_payload, last_seen_at=now(), last_checked_at=EXCLUDED.last_checked_at, imported_at=EXCLUDED.imported_at, estimated_total_usd=EXCLUDED.estimated_total_usd, listed_at=COALESCE(NULLIF(EXCLUDED.source_payload->>'sourceListedAt','')::timestamptz, listings.first_seen_at), previous_price_usd=CASE WHEN abs(listings.price_cny - EXCLUDED.price_cny) >= 700 THEN COALESCE((listings.source_payload->>'usdPrice')::numeric, round(listings.price_cny / 7.15)) ELSE listings.previous_price_usd END, price_changed_at=CASE WHEN abs(listings.price_cny - EXCLUDED.price_cny) >= 700 THEN now() ELSE listings.price_changed_at END, content_changed_at=CASE WHEN listings.content_hash IS DISTINCT FROM EXCLUDED.content_hash THEN now() ELSE listings.content_changed_at END`,
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

// Кузов и модель приходят мультивыбором: несколько одноимённых параметров.
// Для кузова дополнительно принимаем список через запятую — названия там фиксированы,
// у моделей запятая может быть частью имени, поэтому их не режем.
export function multiParamValues(input, anyLabel, { splitCommas = false } = {}) {
  const raw = input == null ? [] : Array.isArray(input) ? input : [input];
  const items = raw.map((item) => String(item));
  const parts = splitCommas ? items.flatMap((item) => item.split(",")) : items;
  return [...new Set(parts.map((item) => item.trim()).filter((item) => item && item !== anyLabel))];
}

export function buildCarFilters(searchParams) {
  const clauses = ["l.status='active'"];
  const values = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
  if (searchParams.get("type") && searchParams.get("type") !== "Все") add("v.powertrain=?", searchParams.get("type"));
  if (searchParams.get("brand") && searchParams.get("brand") !== "Все марки") add("v.brand=?", searchParams.get("brand"));
  const models = multiParamValues(searchParams.getAll("model"), "Все модели");
  if (models.length) add("v.model=ANY(?)", models);
  const bodyTypes = multiParamValues(searchParams.getAll("bodyType"), "Все кузова", { splitCommas:true });
  if (bodyTypes.length) add("v.specifications->>'bodyType'=ANY(?)", bodyTypes);
  // Цвет кузова хранится нормализованными английскими значениями (Black, Silver…) —
  // клиент переводит русские подписи фильтра в них сам.
  const colors = multiParamValues(searchParams.getAll("color"), "Все цвета", { splitCommas:true });
  if (colors.length) add("v.specifications->>'bodyColor'=ANY(?)", colors);
  if (DRIVE_TYPES.includes(searchParams.get("drive"))) add("v.drivetrain=?", searchParams.get("drive"));
  if (Number(searchParams.get("ownersMax"))) add("l.owners<=?", Number(searchParams.get("ownersMax")));
  if (searchParams.get("noClaims") === "1") clauses.push("COALESCE(l.claims, l.source_payload->>'claims', l.source_payload->>'incident') ~ '(0\\s*次理赔|理赔\\s*0\\s*次)'");
  if (["S", "A", "B", "C", "D"].includes(searchParams.get("conditionGrade"))) add("l.condition_grade=?", searchParams.get("conditionGrade"));
  if (Number(searchParams.get("yearMin"))) add("v.model_year>=?", Number(searchParams.get("yearMin")));
  if (Number(searchParams.get("yearMax"))) add("v.model_year<=?", Number(searchParams.get("yearMax")));
  if (Number(searchParams.get("mileageMax"))) add("l.mileage_km<=?", Number(searchParams.get("mileageMax")));
  if (Number(searchParams.get("mileageMin"))) add("l.mileage_km>=?", Number(searchParams.get("mileageMin")));
  if (Number(searchParams.get("priceCnyMax"))) add("l.price_cny<=?", Number(searchParams.get("priceCnyMax")));
  if (Number(searchParams.get("landedMax"))) add("l.estimated_total_usd<=?", Number(searchParams.get("landedMax")));
  if (Number(searchParams.get("landedMin"))) add("l.estimated_total_usd>=?", Number(searchParams.get("landedMin")));
  if (Number(searchParams.get("batteryMin"))) add("v.battery_kwh>=?", Number(searchParams.get("batteryMin")));
  // Запас хода: у гибридов заявлен общий, у электромобилей — электрический;
  // сравниваем с тем, что показывает карточка, и тем же, по чему идёт сортировка.
  if (Number(searchParams.get("rangeMin"))) add("COALESCE(v.electric_range_km, v.combined_range_km)>=?", Number(searchParams.get("rangeMin")));
  // Разгон, момент и шины перенесены из полной техкарты в specifications
  // скриптом backfill-spec-filters.mjs и пишутся туда же при импорте; машины
  // без значения фильтр честно отсеивает.
  if (Number(searchParams.get("accelMax"))) add("(v.specifications->>'acceleration')::numeric<=?", Number(searchParams.get("accelMax")));
  if (Number(searchParams.get("torqueMin"))) add("(v.specifications->>'torqueNm')::numeric>=?", Number(searchParams.get("torqueMin")));
  if (Number(searchParams.get("tireRimMin"))) add("(v.specifications->>'tireRim')::numeric>=?", Number(searchParams.get("tireRimMin")));
  // Исключения из строки поиска («зикр кроме 001», «электро кроме белых»).
  // COALESCE обязателен: без него машина с пустым кузовом или цветом выпадала бы
  // из выдачи — сравнение с NULL не истинно и не ложно.
  const brandsNot = multiParamValues(searchParams.getAll("brandNot"), "", { splitCommas:true });
  if (brandsNot.length) add("v.brand<>ALL(?)", brandsNot);
  const modelsNot = multiParamValues(searchParams.getAll("modelNot"), "", { splitCommas:true });
  if (modelsNot.length) add("v.model<>ALL(?)", modelsNot);
  const typesNot = multiParamValues(searchParams.getAll("typeNot"), "", { splitCommas:true });
  if (typesNot.length) add("COALESCE(v.powertrain,'')<>ALL(?)", typesNot);
  const drivesNot = multiParamValues(searchParams.getAll("driveNot"), "", { splitCommas:true });
  if (drivesNot.length) add("COALESCE(v.drivetrain,'')<>ALL(?)", drivesNot);
  const bodyTypesNot = multiParamValues(searchParams.getAll("bodyTypeNot"), "", { splitCommas:true });
  if (bodyTypesNot.length) add("COALESCE(v.specifications->>'bodyType','')<>ALL(?)", bodyTypesNot);
  const colorsNot = multiParamValues(searchParams.getAll("colorNot"), "", { splitCommas:true });
  if (colorsNot.length) add("COALESCE(v.specifications->>'bodyColor','')<>ALL(?)", colorsNot);
  return { where:`WHERE ${clauses.join(" AND ")}`, values };
}

export function buildCarOrder(searchParams) {
  const orders = {
    newest:"l.listed_at DESC NULLS LAST, l.id",
    price:"l.estimated_total_usd ASC NULLS LAST, l.id",
    price_asc:"l.estimated_total_usd ASC NULLS LAST, l.id",
    price_desc:"l.estimated_total_usd DESC NULLS LAST, l.id",
    mileage_asc:"l.mileage_km ASC NULLS LAST, l.id",
    range_desc:"COALESCE(v.electric_range_km, v.combined_range_km) DESC NULLS LAST, l.id",
    // Разгон лежит в характеристиках строкой: пустое значение приводим к NULL,
    // иначе приведение к числу падало бы на машинах без замера.
    accel_asc:"NULLIF(v.specifications->>'acceleration','')::numeric ASC NULLS LAST, l.id",
    year_desc:"v.model_year DESC NULLS LAST, l.id",
    year_asc:"v.model_year ASC NULLS LAST, l.id",
  };
  // The catalog pages by offset, so the default shuffle has to stay the same
  // between "показать ещё" requests: the client sends one seed per catalog
  // session and the seed is hashed into the row order.
  if (searchParams.get("sort") === "default") {
    const seed = String(searchParams.get("seed") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32) || "catalog";
    return `md5(l.id::text || '${seed}'), l.id`;
  }
  return orders[searchParams.get("sort")] || orders.newest;
}

export function rowToCar(row) {
  const raw = row.source_payload || {};
  return normalizeCar({ ...raw, id:row.id, externalId:row.external_id, source:row.source, sourceUrl:row.source_url, title:row.title, brand:row.brand, model:row.model, year:row.model_year, type:row.powertrain, drive:row.drivetrain, battery:Number(row.battery_kwh) || null, electricRange:row.electric_range_km, combinedRange:row.combined_range_km, city:row.city, firstRegistration:row.first_registration, mileage:row.mileage_km, chinaPrice:row.price_cny, guidePriceCny:row.guide_price_cny, owners:row.owners, transfers:row.transfers, conditionGrade:row.condition_grade, appearanceScore:Number(row.appearance_score) || null, claims:row.claims, description:row.description, status:"Карточка доступна", statusTone:"green", images:row.images, image:row.images?.[0], checkedAt:row.last_checked_at, importedAt:row.imported_at, firstSeenAt:row.first_seen_at, previousPriceUsd:Number(row.previous_price_usd) || null, priceChangedAt:row.price_changed_at, sourceId:raw.sourceId || `${row.source === "Che168" ? "CH" : "GZ"}-${row.external_id}`, ...row.specifications });
}

export function withoutDetailPayload(car) {
  // Список отдаёт карточку без тяжёлой технической карты. Флаг _summary говорит
  // клиенту, что при открытии страницы машины полную версию надо дозапросить —
  // без него из каталога открывалась урезанная карточка без «Полных характеристик».
  const { technicalSpecs, ...summary } = car;
  return { ...summary, _summary: true };
}

// Глубже этой позиции каталог не листается. Посетитель берёт по 99 карточек, то есть
// потолок наступает после полусотни нажатий «Подгрузить ещё»; выкачка всех 33 тысяч
// объявлений постраничным перебором на этом заканчивается. Ответ всегда несёт
// `hasMore`, поэтому приложение узнаёт про упор в потолок и прекращает подгрузку,
// вместо того чтобы сравнивать загруженное с общим числом и биться в пустые страницы.
export const maxOffset = 5000;

// Расчёт страницы держим отдельной функцией: потолок глубины — то место, где легко
// незаметно отрезать живым посетителям часть каталога, поэтому он проверяется тестами
// без обращения к базе.
export function catalogPaging(searchParams) {
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 24));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  // За потолком страницу не выбираем вовсе: обрезать `offset` вниз нельзя — тогда
  // ответ повторил бы уже показанные карточки вместо признака конца списка.
  return { limit, offset, beyondCap:offset >= maxOffset };
}

// «Есть ещё» ограничено и общим числом, и потолком: на потолке подгрузка обязана
// остановиться, иначе прокрутка будет бесконечно просить страницы, которых не будет.
export const catalogHasMore = (offset, count, total) => offset + count < Math.min(total, maxOffset);

export async function listCars(searchParams) {
  const { where, values } = buildCarFilters(searchParams);
  const { limit, offset, beyondCap } = catalogPaging(searchParams);
  const order = buildCarOrder(searchParams);
  // `sort=variety` feeds the home showcase: one random listing per model, then a
  // random order over those. Ordinary sorting cannot do this — the newest page is
  // whatever an import just wrote, so a single model can fill the whole block.
  if (searchParams.get("sort") === "variety") {
    // Sample by id, not by full row: deduplicating over the selected columns made DISTINCT ON
    // sort every active listing together with its source_payload (~950 ms). Sorting the narrow
    // (brand, model, id) tuples and materialising full rows only for the chosen page is ~140 ms.
    const [itemsResult, countResult] = await Promise.all([
      pool.query(`WITH sample AS (
        SELECT DISTINCT ON (v.brand, v.model) l.id
        FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}
        ORDER BY v.brand, v.model, random()
      ), picked AS (SELECT id FROM sample ORDER BY random() LIMIT $${values.length + 1})
      ${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id JOIN picked p ON p.id=l.id ORDER BY random()`, [...values, limit]),
      pool.query(`SELECT count(*)::int AS total, max(l.last_seen_at) AS refreshed_at FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values),
    ]);
    // Витрина главной — одна выдача без листания: следующей страницы у неё нет.
    return { items:itemsResult.rows.map((row) => withoutDetailPayload(rowToCar(row))), total:countResult.rows[0].total, refreshedAt:countResult.rows[0].refreshed_at, limit, offset:0, hasMore:false };
  }
  const [itemsResult, countResult] = await Promise.all([
    beyondCap
      ? Promise.resolve({ rows:[] })
      : pool.query(`${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values,limit,offset]),
    // max(last_seen_at) едет в том же скане, что и count(*): отдельного запроса дата не стоит.
    pool.query(`SELECT count(*)::int AS total, max(l.last_seen_at) AS refreshed_at FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values),
  ]);
  const total = countResult.rows[0].total;
  const items = itemsResult.rows.map((row) => withoutDetailPayload(rowToCar(row)));
  return { items, total, refreshedAt:countResult.rows[0].refreshed_at, limit, offset, hasMore:catalogHasMore(offset, items.length, total) };
}

// Адрес карточки несёт короткий номер объявления («/cars/59334290»), а идентификатор
// в базе — с приставкой источника («che168-59334290»). Ищем по обоим: короткий номер
// приходит из новых ссылок, полный — из старых, из закладок и из заказов.
/**
 * Узкая выборка для страниц-списков, которые сервер собирает для поисковика: там из
 * машины нужны только название, пробег и адрес. Обычная `listCars` берёт строку
 * целиком вместе с `source_payload` — всем исходным ответом источника, — и на глубоких
 * страницах раздела это стоило дорого: «страница 50» отвечала 1,5 секунды против
 * 70 миллисекунд узкой выборки. Постраничный обход раздела должен быть дешёвым:
 * страниц по всем разделам больше двух тысяч.
 *
 * Потолка глубины здесь нет намеренно: `catalogPaging` бережёт живого посетителя от
 * бесконечной подгрузки, а поисковику нужен путь до последней машины в разделе.
 */
export async function listCarPage(searchParams, { limit = 100, offset = 0 } = {}) {
  const { where, values } = buildCarFilters(searchParams);
  const order = buildCarOrder(searchParams);
  const [itemsResult, countResult] = await Promise.all([
    pool.query(`SELECT l.id, l.title, l.mileage_km, v.brand, v.model, v.model_year
      FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}
      ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]),
    pool.query(`SELECT count(*)::int AS total FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values),
  ]);
  return {
    items: itemsResult.rows.map((row) => ({ id:row.id, title:row.title, brand:row.brand, model:row.model, year:row.model_year, mileage:row.mileage_km })),
    total: countResult.rows[0].total,
  };
}

/** Сколько машин в разделе. Нужно сборке: по этому числу в карту сайта попадают страницы раздела. */
export async function countCars(searchParams) {
  const { where, values } = buildCarFilters(searchParams);
  const result = await pool.query(`SELECT count(*)::int AS total FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values);
  return result.rows[0].total;
}

/**
 * Самая дешёвая и самая дорогая машина набора — чтобы показать вилку цен: «в наличии
 * 5 673 автомобиля, от 14 900 до 78 300 $». Цену считаем тем же `estimateLandedCost`,
 * что и карточка, поэтому берём строки целиком, а не столбец `estimated_total_usd`:
 * тот пересчитывается только при обновлении объявления, и после смены правил расчёта
 * (пошлина на последовательные гибриды, курс) он какое-то время отстаёт. Публиковать
 * в разметке цену ниже той, что человек увидит на странице машины, нельзя.
 *
 * Обе строки достаём одним запросом: условия отбора в обеих половинах те же самые,
 * поэтому и подстановки одни и те же.
 */
export async function priceEdges(searchParams) {
  const { where, values } = buildCarFilters(searchParams);
  const half = (direction) => `(${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} ORDER BY l.estimated_total_usd ${direction} NULLS LAST, l.id LIMIT 1)`;
  const result = await pool.query(`${half("ASC")} UNION ALL ${half("DESC")}`, values);
  const cars = result.rows.map((row) => withoutDetailPayload(rowToCar(row)));
  return { cheapest: cars[0] || null, dearest: cars[1] || cars[0] || null };
}

/**
 * Машины по списку номеров, в том же порядке. Нужно страницам-спискам: сам список
 * собирается узкой выборкой (без исходного ответа источника — иначе глубокие страницы
 * стоят полторы секунды), а для разметки цен у первых двух десятков нужны все поля,
 * из которых считается стоимость до Минска. Поиск по номерам идёт по ключу и от
 * глубины страницы не зависит.
 */
export async function carsByIds(ids) {
  const list = [...new Set((ids || []).map((id) => String(id)))];
  if (!list.length) return [];
  const result = await pool.query(`${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id = ANY($1)`, [list]);
  const cars = new Map(result.rows.map((row) => [String(row.id), withoutDetailPayload(rowToCar(row))]));
  return list.map((id) => cars.get(id)).filter(Boolean);
}

export async function getCar(id) {
  const result = await pool.query(`${carSelect}, COALESCE((SELECT json_agg(json_build_object('at',p.observed_at,'priceCny',p.price_cny) ORDER BY p.observed_at) FROM price_history p WHERE p.listing_id=l.id), '[]'::json) AS price_history FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id=$1 OR l.external_id=$1 ORDER BY (l.id=$1) DESC LIMIT 1`, [id]);
  return result.rows[0] ? { ...rowToCar(result.rows[0]), priceHistory:result.rows[0].price_history } : null;
}

export async function getCatalogMeta(type, brand, bodyType) {
  const selectedBodyTypes = multiParamValues(bodyType, "Все кузова", { splitCommas:true });
  const values = [];
  const filters = ["l.status='active'"];
  if (type && type !== "Все") { values.push(type); filters.push(`v.powertrain=$${values.length}`); }
  const brandValues = [...values];
  const brandFilters = [...filters];
  if (selectedBodyTypes.length) { brandValues.push(selectedBodyTypes); brandFilters.push(`v.specifications->>'bodyType'=ANY($${brandValues.length})`); }
  if (brand && brand !== "Все марки") { values.push(brand); filters.push(`v.brand=$${values.length}`); }
  const bodyFilters = [...filters];
  const bodyValues = [...values];
  if (selectedBodyTypes.length) { bodyValues.push(selectedBodyTypes); bodyFilters.push(`v.specifications->>'bodyType'=ANY($${bodyValues.length})`); }
  const where = `WHERE ${filters.join(" AND ")}`;
  const bodyWhere = `WHERE ${bodyFilters.join(" AND ")}`;
  const brandWhere = `WHERE ${brandFilters.join(" AND ")}`;
  const [count, brands, models, bodyTypes, drives, availability] = await Promise.all([
    pool.query(`SELECT count(*)::int total FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${bodyWhere}`, bodyValues),
    pool.query(`SELECT v.brand, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${brandWhere} GROUP BY v.brand ORDER BY v.brand`, brandValues),
    pool.query(`SELECT v.model, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${bodyWhere} GROUP BY v.model ORDER BY v.model`, bodyValues),
    pool.query(`SELECT v.specifications->>'bodyType' body_type, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} AND v.specifications->>'bodyType' IS NOT NULL AND v.specifications->>'bodyType'<>'Не определён' GROUP BY body_type ORDER BY count DESC, body_type`, values),
    pool.query("SELECT v.drivetrain drive, count(*)::int count FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active' AND v.drivetrain IS NOT NULL AND v.drivetrain<>'Не указан' GROUP BY v.drivetrain ORDER BY v.drivetrain"),
    pool.query("SELECT count(v.drivetrain)::int drive, count(l.owners)::int owners, count(v.battery_kwh)::int battery, count(l.condition_grade)::int condition FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active'"),
  ]);
  const driveCounts = drives.rows.reduce((totals, row) => {
    const drive = normalizeDrive(row.drive);
    return drive === UNKNOWN_DRIVE ? totals : totals.set(drive, (totals.get(drive) || 0) + Number(row.count));
  }, new Map());
  const driveRows = orderDrives([...driveCounts.keys()]).map((drive) => ({ drive, count:driveCounts.get(drive) }));
  return { total:count.rows[0].total, brands:brands.rows, models:models.rows, bodyTypes:bodyTypes.rows, drives:driveRows, availability:availability.rows[0] };
}

// Список обзоров на странице «О моделях авто» показывает по каждой модели фото,
// число машин в наличии, цену, разгон и запас хода. Раньше страница спрашивала это
// по одной модели за раз — сто тридцать обращений к каталогу, каждое со своим
// пересчётом количества, из-за чего фотографии проявлялись десятками секунд. Здесь
// всё считается одним проходом по активным объявлениям: цены и характеристики берём
// сводкой по модели, фото — с самой доступной машины, то есть с той же, что и раньше.
export async function getModelFacts() {
  const result = await pool.query(`WITH active AS (
      SELECT l.id, v.brand, v.model, l.estimated_total_usd AS price,
        NULLIF(v.specifications->>'acceleration','')::numeric AS accel,
        COALESCE(v.electric_range_km, v.combined_range_km) AS range
      FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active'
    ), summary AS (
      SELECT brand, model, count(*)::int AS count, min(price) AS price_min, max(price) AS price_max,
        min(accel) AS accel, max(range) AS range
      FROM active GROUP BY brand, model
    ), cheapest AS (
      SELECT DISTINCT ON (brand, model) brand, model, id
      FROM active ORDER BY brand, model, price ASC NULLS LAST, id
    )
    SELECT s.brand, s.model, s.count, s.price_min, s.price_max, s.accel, s.range,
      (SELECT m.url FROM listing_media m WHERE m.listing_id=c.id ORDER BY m.position LIMIT 1) AS image
    FROM summary s LEFT JOIN cheapest c ON c.brand=s.brand AND c.model=s.model
    ORDER BY s.brand, s.model`);
  return { models:result.rows.map((row) => ({
    brand:row.brand,
    model:row.model,
    count:row.count,
    priceMin:Number(row.price_min) || null,
    priceMax:Number(row.price_max) || null,
    accel:Number(row.accel) || null,
    range:Number(row.range) || null,
    image:row.image || null,
  })) };
}

export async function createOrderDraft({ listingId, name = null, contact, calculation = {} }) {
  const result = await pool.query("INSERT INTO order_drafts (listing_id, customer_name, contact, calculation) VALUES ($1,$2,$3,$4) RETURNING id, listing_id, status, created_at", [listingId,name,contact,JSON.stringify(calculation)]);
  await pool.query(`INSERT INTO crawl_jobs (source, listing_id, job_type, url, priority)
    SELECT source, id, 'refresh_listing', source_url, 100 FROM listings WHERE id=$1
    ON CONFLICT (job_type, listing_id) WHERE status IN ('queued','running') DO UPDATE SET priority=GREATEST(crawl_jobs.priority,100), available_at=LEAST(crawl_jobs.available_at,now())`, [listingId]);
  return result.rows[0];
}

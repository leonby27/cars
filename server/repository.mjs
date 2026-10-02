import {cachedCatalogRead,cachedCatalogValue,clearCatalogReadCache} from "./catalog-read-cache.mjs";
import { readFileSync } from "node:fs";
import { createAsyncCache } from "./async-cache.mjs";
import { createInputAwareCache } from "./input-aware-cache.mjs";
import { repairVerifiedDrive, driveConflicts } from "../src/vehicle-spec-integrity.js";
import crypto from "node:crypto";
import { canonicalImportName, uniquePhotos } from "../config/import-policy.mjs";
import { pool, withTransaction } from "./db.mjs";
// Страна машины по имени источника: карточка говорит «из Кореи» для Encar и «из Китая»
// для остальных, общие страницы — фразу сайта (см. src/origin.js).
import { ORIGIN_SOURCES, originForSource, originFromParam } from "../src/origin.js";
import { koreanListingId } from "../src/listing-id.js";
import { notifyLead } from "./lead-notify.mjs";
import { estimateMarketOffer } from "../src/markets/estimate-offer.js";
import { SITE } from "../src/site-profile.js";
import { marketPriceStatsFromRowsAsync } from "./market-price-stats.mjs";
import { searchTextWords, searchWordStem } from "../src/car-search-text.js";
import { normalizeBodyType } from "../src/body-types.js";
import { carTitle } from "../src/car-title.js";
import { DRIVE_TYPES, normalizeDrive, orderDrives, UNKNOWN_DRIVE } from "../src/drive-types.js";
import { FUEL_TYPES, GEARBOX_TYPES, enginePower, engineVolume, fuelType, gearboxType } from "../src/engine-spec.js";

const normalizeScore = (value) => Number(value) > 100 ? Number(String(value).slice(0, 2)) : Number(value) || null;
// Include imported quote inputs that are not all stored in vehicles. Run times
// and importer bookkeeping are deliberately absent: rechecking is not a change.
const quoteInputFields = ['city','sourceCurrency','sourcePrice','usdPrice','priceBasis','fobPriceUsd','fobPort',
  'manufactureDate','dimensions','curbWeight','technicalSpecs','sourceFuelType','fuelType','engine','transmission',
  'engineCc','engineVolume','enginePower','enginePowerKw','engineHorsepower','engineNetPowerKw',
  'motorPowerKw','motorHorsepower','horsepower','motorThirtyMinutePowerKw','motorModel','motorCount',
  'modification','trim','rawModel','rawSeries','drive','driveType','battery','batteryCapacity'];
export const importedContentHash = car => crypto.createHash("sha256").update(JSON.stringify({
  price:car.sourcePrice ?? car.chinaPrice, mileage:car.mileage, status:car.status, description:car.description, images:car.images,
  quoteInputs:Object.fromEntries(quoteInputFields.map(key=>[key,car[key]])),
})).digest("hex");
export const SOLD_LISTING_RETENTION_MS = 14 * 86400_000;

// Проданная машина ещё две недели открывается из избранного и по старой ссылке.
// После этого она снова становится обычной исчезнувшей карточкой (404), чтобы
// старые объявления не копились в выдаче поисковиков и в аккаунтах без срока.
export function soldListingVisible(car, now = Date.now()) {
  if (!car || car.available !== false) return Boolean(car);
  const soldAt = new Date(car.soldAt || car.checkedAt || "").getTime();
  return Number.isFinite(soldAt) && now - soldAt < SOLD_LISTING_RETENTION_MS;
}

export function normalizeCar(car) {
  car = repairVerifiedDrive(car);
  const electricRange = car.electricRange ?? (Number(car.description?.match(/纯电续航\s*(\d+)/)?.[1]) || null);
  const combinedRange = car.combinedRange ?? (Number(car.description?.match(/综合续航\s*(\d+)/)?.[1]) || null);
  // Марка и модель приводятся вместе: часть машин при переименовании на беларуское имя
  // заодно меняет марку (银河E5 → Geely EX5, модели альянса Huawei → AITO, Luxeed и далее).
  const { brand, model } = canonicalImportName(car.brand, car.model, car.type, car);
  // Повторы фотографий убираем здесь, потому что через эту воронку проходит и
  // запись при импорте, и каждое чтение из базы: чинится и то, что уже лежит.
  const photos = car.images ? uniquePhotos(car.images) : null;
  return { ...car, specWarnings: driveConflicts(car), ...(photos?.length ? { images: photos, image: photos[0] } : {}), brand, model, title:carTitle(brand, model, car.year), bodyType:normalizeBodyType({ ...car, brand, model }), drive:normalizeDrive(car.drive), appearanceScore:normalizeScore(car.appearanceScore), electricRange, combinedRange, range:car.range || electricRange || combinedRange };
}

// Характеристики машины одним объектом: их пишет и обычная запись машины, и
// пересчёт уже заведённых (`npm run db:respec`). Собраны в одном месте, чтобы
// пересчёт не разошёлся с импортом — иначе после него часть полей молча пропала бы.
export const vehicleSpecifications = (item) => ({ bodyType:item.bodyType,bodyStructure:item.bodyStructure,batteryType:item.batteryType,batteryBrand:item.batteryBrand,batteryHealth:item.batteryHealth,engine:item.engine,transmission:item.transmission,engineVolume:engineVolume(item),enginePower:enginePower(item),gearbox:gearboxType(item) || null,fuelType:fuelType(item) || null,bodyColor:item.bodyColor,acceleration:item.acceleration,torqueNm:item.torqueNm,tireSizeFront:item.tireSizeFront,tireRim:item.tireRim,vehicleClass:item.vehicleClass,driverAssistance:item.driverAssistance,infotainmentChip:item.infotainmentChip,assistanceLevel:item.assistanceLevel,radarCount:item.radarCount,cameraCount:item.cameraCount,ultrasonicCount:item.ultrasonicCount,warranty:item.warranty,inspectionGrade:item.inspectionGrade,powertrainInspection:item.powertrainInspection,bodyInspection:item.bodyInspection,interiorInspection:item.interiorInspection,structureInspection:item.structureInspection,engineBayInspection:item.engineBayInspection,batteryProtection:item.batteryProtection });

// Колонка `price_cny` хранит цену в валюте продавца: юани у Китая, воны у Кореи (имя
// историческое). Импортёр пишет `sourcePrice` + `sourceCurrency` (+ `usdPrice`), старые
// записи — `chinaPrice`; валюта при чтении берётся из полезной нагрузки, а без неё — по
// источнику (src/pricing.js sourceCurrencyOf).
// Порог «цена изменилась» — в валюте продавца: 700 ¥ или 140 000 ₩ (≈ 100 $ и там, и там);
// запасной пересчёт «прошлой цены» в доллары — по грубому курсу валюты (7,15 ¥, 1 354 ₩),
// когда в объявлении нет `usdPrice`. Импортёр Encar обязан писать `usdPrice` — тогда и
// стрелка цены на карточке, и прошлая цена считаются точно.
export async function upsertCar(car, client = pool) {
  const item = normalizeCar(car);
  const checkedAt = item.checkedAt || item.importedAt || new Date().toISOString();
  // This column remains BY-only until market_offers is introduced. The explicit
  // site context prevents a future RU importer from silently reusing its price.
  const offer = estimateMarketOffer(item, { siteId: SITE.id });
  if (offer.status !== "estimated") throw new Error("Stored market price is not available");
  const estimatedTotalUsd = offer.calculation.totalUsd;
  await client.query(`INSERT INTO vehicles (id, brand, model, model_year, powertrain, drivetrain, battery_kwh, electric_range_km, combined_range_km, specifications, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
    ON CONFLICT (id) DO UPDATE SET brand=EXCLUDED.brand, model=EXCLUDED.model, model_year=EXCLUDED.model_year, powertrain=EXCLUDED.powertrain, drivetrain=EXCLUDED.drivetrain, battery_kwh=EXCLUDED.battery_kwh, electric_range_km=EXCLUDED.electric_range_km, combined_range_km=EXCLUDED.combined_range_km, specifications=EXCLUDED.specifications,
      updated_at=CASE WHEN ROW(vehicles.brand,vehicles.model,vehicles.model_year,vehicles.powertrain,vehicles.drivetrain,vehicles.battery_kwh,vehicles.electric_range_km,vehicles.combined_range_km,vehicles.specifications)
        IS DISTINCT FROM ROW(EXCLUDED.brand,EXCLUDED.model,EXCLUDED.model_year,EXCLUDED.powertrain,EXCLUDED.drivetrain,EXCLUDED.battery_kwh,EXCLUDED.electric_range_km,EXCLUDED.combined_range_km,EXCLUDED.specifications)
        THEN now() ELSE vehicles.updated_at END`,
    [item.id,item.brand,item.model,item.year,item.type,item.drive,item.battery,item.electricRange,item.combinedRange,JSON.stringify(vehicleSpecifications(item))]);
  await client.query(`INSERT INTO listings (id, vehicle_id, source, external_id, source_url, title, city, first_registration, mileage_km, price_cny, guide_price_cny, owners, transfers, condition_grade, appearance_score, claims, description, status, content_hash, source_payload, last_seen_at, last_checked_at, imported_at, estimated_total_usd, listed_at, sold_at)
    VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'active',$17,$18,now(),$19,$20,$21,COALESCE(NULLIF($18::jsonb->>'sourceListedAt','')::timestamptz, now()),NULL)
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, city=EXCLUDED.city, first_registration=EXCLUDED.first_registration, mileage_km=EXCLUDED.mileage_km, price_cny=EXCLUDED.price_cny, guide_price_cny=EXCLUDED.guide_price_cny, owners=EXCLUDED.owners, transfers=EXCLUDED.transfers, condition_grade=EXCLUDED.condition_grade, appearance_score=EXCLUDED.appearance_score, claims=EXCLUDED.claims, description=EXCLUDED.description, status='active', sold_at=NULL, content_hash=EXCLUDED.content_hash, source_payload=EXCLUDED.source_payload, last_seen_at=now(), last_checked_at=EXCLUDED.last_checked_at, imported_at=EXCLUDED.imported_at, estimated_total_usd=EXCLUDED.estimated_total_usd, listed_at=COALESCE(NULLIF(EXCLUDED.source_payload->>'sourceListedAt','')::timestamptz, listings.first_seen_at), previous_price_usd=CASE WHEN abs(listings.price_cny - EXCLUDED.price_cny) >= CASE WHEN EXCLUDED.source='Encar' THEN 140000 ELSE 700 END THEN COALESCE((listings.source_payload->>'usdPrice')::numeric, round(listings.price_cny / CASE WHEN listings.source='Encar' THEN 1354 ELSE 7.15 END)) ELSE listings.previous_price_usd END, price_changed_at=CASE WHEN abs(listings.price_cny - EXCLUDED.price_cny) >= CASE WHEN EXCLUDED.source='Encar' THEN 140000 ELSE 700 END THEN now() ELSE listings.price_changed_at END, content_changed_at=CASE WHEN listings.content_hash IS DISTINCT FROM EXCLUDED.content_hash OR listings.status IS DISTINCT FROM 'active' THEN now() ELSE listings.content_changed_at END`,
    [item.id,item.source,item.externalId,item.sourceUrl,item.title,item.city,item.firstRegistration,item.mileage,item.sourcePrice ?? item.chinaPrice,item.guidePriceCny,item.owners,item.transfers,item.conditionGrade,item.appearanceScore,item.claims || item.incident,item.description,importedContentHash(item),JSON.stringify(item),checkedAt,item.importedAt || checkedAt,estimatedTotalUsd]);
  await client.query("DELETE FROM listing_media WHERE listing_id=$1", [item.id]);
  const images = (item.images || [item.image]).filter(Boolean);
  if (images.length) await client.query(`INSERT INTO listing_media (listing_id, position, url)
    SELECT $1, ordinal::int - 1, url FROM unnest($2::text[]) WITH ORDINALITY AS media(url, ordinal)`, [item.id,images]);
  const history = item.priceHistory || [{ at:checkedAt, priceCny:item.sourcePrice ?? item.chinaPrice }];
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

import { buildCarFilters, buildCarOrder, multiParamValues, searchTerms, queryCatalogMeta } from "./catalog-query.mjs";
export { buildCarFilters, buildCarOrder, multiParamValues, searchTerms } from "./catalog-query.mjs";
const ENGINE_VOLUME_SQL = "NULLIF(v.specifications->>'engineVolume','')::numeric";
const ENGINE_POWER_SQL = "NULLIF(v.specifications->>'enginePower','')::numeric";
const GEARBOX_SQL = "v.specifications->>'gearbox'";
const FUEL_SQL = "v.specifications->>'fuelType'";

// Короткая метка источника в номере машины: Che168 → CH, Guazi → GZ, Encar → KR.
const SOURCE_CODES = { Che168: "CH", Guazi: "GZ", Encar: "KR" };

export function rowToCar(row) {
  const raw = row.source_payload || {};
  // Проданное объявление тоже доходит сюда: карточку по номеру спрашивают заявки и
  // служебные скрипты, поэтому `getCar` не фильтрует по состоянию. Признаки
  // `available` и `soldAt` позволяют внешним страницам оставить его на две недели.
  // Строка без столбца состояния (узкие выборки) считается живой.
  const available = row.status === undefined || row.status === "active";
  const soldAt = available ? null : row.sold_at || row.last_checked_at || row.last_seen_at || null;
  return normalizeCar({ ...raw, available, soldAt, id:row.id, externalId:row.external_id, source:row.source, origin:originForSource(row.source), sourceUrl:row.source_url, title:row.title, brand:row.brand, model:row.model, year:row.model_year, type:row.powertrain, drive:row.drivetrain, battery:Number(row.battery_kwh) || null, electricRange:row.electric_range_km, combinedRange:row.combined_range_km, city:row.city, firstRegistration:row.first_registration, mileage:row.mileage_km, chinaPrice:row.price_cny, guidePriceCny:row.guide_price_cny, owners:row.owners, transfers:row.transfers, conditionGrade:row.condition_grade, appearanceScore:Number(row.appearance_score) || null, claims:row.claims, description:row.description, status:available ? "Карточка доступна" : "Продано", statusTone:available ? "green" : "red", images:row.images, image:row.images?.[0], checkedAt:row.last_checked_at, importedAt:row.imported_at, firstSeenAt:row.first_seen_at, previousPriceUsd:Number(row.previous_price_usd) || null, priceChangedAt:row.price_changed_at, sourceId:raw.sourceId || `${SOURCE_CODES[row.source] || "GZ"}-${row.external_id}`, ...row.specifications });
}

export function withoutDetailPayload(car) {
  // Список отдаёт карточку без тяжёлой технической карты. Флаг _summary говорит
  // клиенту, что при открытии страницы машины полную версию надо дозапросить —
  // без него из каталога открывалась урезанная карточка без «Полных характеристик».
  const { technicalSpecs, ...summary } = car;
  return { ...summary, _summary: true };
}

// Глубже этой позиции каталог не листается. Посетитель берёт по 48 карточек, то есть
// потолок наступает после сотни нажатий «Подгрузить ещё»; выкачка всех 33 тысяч
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

/**
 * Слово из запроса, которого нет ни в одной карточке, обнуляет выдачу — и так и
 * надо: показать вместо него что-то похожее значит выдать чужой ответ за нужный.
 * Единственная поблажка — написание: у источника одна и та же комплектация
 * называется «Surpass» в объявлении и «Surpassing» в чужом каталоге, откуда
 * запрос копируют, поэтому вторым заходом слова ищутся по основе.
 */
export async function listCars(searchParams) {
  const words = searchTextWords(searchParams.get("text"));
  const answer = await listCarsPage(searchParams);
  if (answer.total || !words.length) return answer;
  const stems = words.map(searchWordStem);
  if (!stems.some((stem, at) => stem !== words[at])) return answer;
  const relaxed = new URLSearchParams(searchParams);
  relaxed.set("text", stems.join(" "));
  const retry = await listCarsPage(relaxed);
  return retry.total ? retry : answer;
}

async function listCarsPage(searchParams) {
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
        FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}
        ORDER BY v.brand, v.model, random()
      ), picked AS (SELECT id FROM sample ORDER BY random() LIMIT $${values.length + 1})
      ${carSelect} FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id JOIN picked p ON p.id=l.id ORDER BY random()`, [...values, limit]),
      pool.query(`SELECT count(*)::int AS total, max(l.last_seen_at) AS refreshed_at FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values),
    ]);
    // Витрина главной — одна выдача без листания: следующей страницы у неё нет.
    return { items:itemsResult.rows.map((row) => withoutDetailPayload(rowToCar(row))), total:countResult.rows[0].total, refreshedAt:countResult.rows[0].refreshed_at, limit, offset:0, hasMore:false };
  }
  const [itemsResult, countResult] = await Promise.all([
    beyondCap
      ? Promise.resolve({ rows:[] })
      // Сортируем только номера, строки целиком берём для выбранной страницы. Иначе база
      // перекладывает каждую машину вместе с source_payload: на 80 тыс. машин сортировка
      // «по умолчанию» не влезала в память и писала на диск ~48 МБ на каждый запрос.
      // Порядок у всех сортировок завершается l.id, поэтому внешний ORDER BY его повторяет.
      : pool.query(`WITH picked AS (
          SELECT l.id FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}
          ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}
        )
        ${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id JOIN picked p ON p.id=l.id ORDER BY ${order}`, [...values,limit,offset]),
    // max(last_seen_at) едет в том же скане, что и count(*): отдельного запроса дата не стоит.
    pool.query(`SELECT count(*)::int AS total, max(l.last_seen_at) AS refreshed_at, ${SECTION_CHANGED_AT} AS changed_at FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values),
  ]);
  const total = countResult.rows[0].total;
  const items = itemsResult.rows.map((row) => withoutDetailPayload(rowToCar(row)));
  return { items, total, refreshedAt:countResult.rows[0].refreshed_at, changedAt:countResult.rows[0].changed_at || null, limit, offset, hasMore:catalogHasMore(offset, items.length, total) };
}

// Related cards need a small list, never total counts or refresh timestamps.
// All cars of one model share the same prepared selection for up to one minute.
export async function relatedCarCandidates(brand,model,limit=13) {
  const params=new URLSearchParams({brand,model,sort:"price_asc"});
  const {where,values}=buildCarFilters(params);
  const order=buildCarOrder(params);
  return cachedCatalogValue(pool,["related",brand,model,limit],async()=>{
  const result=await pool.query(`WITH picked AS (
    SELECT l.id FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}
    ORDER BY ${order} LIMIT $${values.length+1}
  ) ${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id JOIN picked p ON p.id=l.id ORDER BY ${order}`,[...values,limit]);
  return result.rows.map(row=>withoutDetailPayload(rowToCar(row)));
  });
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
    // Главный снимок объявления берётся отдельным подзапросом по ключу
    // (listing_id, position) — это уникальный индекс таблицы, поэтому строка находится
    // за один поиск и на времени страницы не сказывается (замер на 50-й странице
    // каталога: 26–52 мс против 37 мс без снимка). Целиком список фотографий здесь
    // не нужен: в списке показывается один кадр на машину.
    pool.query(`SELECT l.id, l.title, l.mileage_km, v.brand, v.model, v.model_year,
      (SELECT m.url FROM listing_media m WHERE m.listing_id=l.id AND m.position=0) AS image
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}
      ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]),
    // Дата последнего изменения набора едет в том же скане, что и подсчёт: страница
    // раздела показывает её подписью и отдаёт в карту сайта, а отдельного запроса
    // она не стоит.
    pool.query(`SELECT count(*)::int AS total, ${SECTION_CHANGED_AT} AS changed_at FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values),
  ]);
  return {
    items: itemsResult.rows.map((row) => ({ id:row.id, title:row.title, brand:row.brand, model:row.model, year:row.model_year, mileage:row.mileage_km, image:row.image || null })),
    total: countResult.rows[0].total,
    changedAt: countResult.rows[0].changed_at || null,
  };
}

/**
 * Сводка по набору машин одним запросом: сколько их, какие годы, какой лучший запас
 * хода, самая большая батарея, самый мощный мотор и так далее. Нужна сравнениям
 * в журнале: таблица различий там на десяток строк, и вытаскивать каждую крайнюю
 * машину отдельным запросом значило бы два десятка запросов на страницу.
 *
 * Пустые значения источника (ноль пробега, пустая строка в характеристиках) в расчёт
 * не идут: ноль пробега в объявлении — это пробел в данных продавца, а не машина без
 * единого километра, и «пробег от 0 км» было бы враньём.
 *
 * Цены здесь нет намеренно: столбец `estimated_total_usd` пересчитывается при
 * обновлении объявления и после смены правил расчёта какое-то время отстаёт, поэтому
 * цену по-прежнему берут из самой дешёвой строки целиком (см. `priceEdges`).
 */
export async function modelSummary(searchParams) {
  const { where, values } = buildCarFilters(searchParams);
  // Характеристики лежат текстом, и у части объявлений там не число, а прочерк или
  // «нет данных». Приводим к числу только то, что числом и записано: иначе один
  // кривой ряд ронял бы весь запрос.
  const numeric = (source) => `(CASE WHEN ${source} ~ '^[0-9]+([.,][0-9]+)?$' THEN replace(${source}, ',', '.')::numeric END)`;
  const spec = (name) => numeric(`v.specifications->>'${name}'`);
  // Мощность лежит в двух разных местах, и это не прихоть: у электромобилей и
  // гибридов источник отдаёт её в исходном ответе, у бензиновых машин — в разобранных
  // характеристиках. Пока читали только первое, у 70 тысяч бензиновых машин строка
  // «Мощность» на обзоре модели и в сравнении стояла прочерком, хотя данные были.
  const payload = (name) => numeric(`l.source_payload->>'${name}'`);
  const powerSql = `COALESCE(${payload("horsepower")}, ${numeric("v.specifications->>'enginePower'")})`;
  const result = await pool.query(`SELECT count(*)::int AS total,
      max(l.last_seen_at) AS refreshed_at, ${SECTION_CHANGED_AT} AS changed_at,
      min(v.model_year)::int AS year_min, max(v.model_year)::int AS year_max,
      min(NULLIF(l.mileage_km, 0))::int AS mileage_min,
      max(COALESCE(v.electric_range_km, v.combined_range_km))::int AS range_max,
      max(v.battery_kwh)::numeric AS battery_max,
      max(${powerSql}) AS power_max,
      max(${spec("torqueNm")}) AS torque_max,
      min(${spec("acceleration")}) AS accel_min
    FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values);
  const row = result.rows[0] || {};
  const value = (name) => (row[name] == null ? null : Number(row[name]));
  return {
    total: row.total || 0,
    refreshedAt: row.refreshed_at || null,
    // Когда набор правда менялся. `refreshedAt` для подписей не годится: ночная
    // проверка обновляет её у всех машин разом (см. SECTION_CHANGED_AT ниже).
    changedAt: row.changed_at || null,
    yearMin: value("year_min"),
    yearMax: value("year_max"),
    mileageMin: value("mileage_min"),
    rangeMax: value("range_max"),
    batteryMax: value("battery_max"),
    powerMax: value("power_max"),
    torqueMax: value("torque_max"),
    accelMin: value("accel_min"),
  };
}

/**
 * Проверяемая сводка для справочного блока марки. Цены — итоговые до Минска из
 * тех же active-записей, что показывает каталог. Медиана и центральные 50%
 * устойчивее среднего к редким дорогим комплектациям.
 */
export async function brandCatalogGuide(brand) {
  const name = String(brand || "").trim();
  if (!name) return null;
  const [summary, models, budgets] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total, count(DISTINCT v.model)::int AS model_count,
        count(*) FILTER (WHERE l.estimated_total_usd > 0)::int AS priced_count,
        min(l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS price_min,
        max(l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS price_max,
        CAST(percentile_cont(0.25) WITHIN GROUP (ORDER BY l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS numeric) AS price_p25,
        CAST(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS numeric) AS price_median,
        CAST(percentile_cont(0.75) WITHIN GROUP (ORDER BY l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS numeric) AS price_p75,
        min(v.model_year)::int AS year_min, max(v.model_year)::int AS year_max,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY NULLIF(l.mileage_km, 0))::numeric AS mileage_median,
        ${SECTION_CHANGED_AT} AS changed_at
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
      WHERE l.status='active' AND v.brand=$1`, [name]),
    pool.query(`SELECT v.model, count(*)::int AS count,
        min(v.model_year)::int AS year_min, max(v.model_year)::int AS year_max,
        min(l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS price_min,
        max(l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS price_max,
        CAST(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.estimated_total_usd) FILTER (WHERE l.estimated_total_usd > 0) AS numeric) AS price_median,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY NULLIF(l.mileage_km, 0))::numeric AS mileage_median,
        array_agg(DISTINCT v.powertrain ORDER BY v.powertrain) FILTER (WHERE v.powertrain IS NOT NULL) AS powertrains,
        (array_agg(m.url ORDER BY l.listed_at DESC NULLS LAST, l.id) FILTER (WHERE m.url IS NOT NULL))[1] AS image
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
      LEFT JOIN listing_media m ON m.listing_id=l.id AND m.position=0
      WHERE l.status='active' AND v.brand=$1
      GROUP BY v.model ORDER BY count(*) DESC, v.model`, [name]),
    pool.query(`SELECT CASE
          WHEN l.estimated_total_usd < 25000 THEN 'under25'
          WHEN l.estimated_total_usd < 35000 THEN '25to35'
          WHEN l.estimated_total_usd < 50000 THEN '35to50'
          ELSE 'over50' END AS band,
        count(*)::int AS count,
        array_agg(DISTINCT v.model ORDER BY v.model) AS models
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
      WHERE l.status='active' AND v.brand=$1 AND l.estimated_total_usd > 0
      GROUP BY band`, [name]),
  ]);
  const row = summary.rows[0] || {};
  if (!row.total) return null;
  const number = (value) => value == null ? null : Number(value);
  return {
    brand:name,
    calculatedAt:new Date().toISOString(),
    changedAt:row.changed_at || null,
    total:row.total,
    modelCount:row.model_count,
    pricedCount:row.priced_count,
    yearMin:row.year_min,
    yearMax:row.year_max,
    priceMin:number(row.price_min),
    priceMax:number(row.price_max),
    priceP25:number(row.price_p25),
    priceMedian:number(row.price_median),
    priceP75:number(row.price_p75),
    mileageMedian:number(row.mileage_median),
    models:models.rows.map((item) => ({
      model:item.model,
      count:item.count,
      yearMin:item.year_min,
      yearMax:item.year_max,
      priceMin:number(item.price_min),
      priceMax:number(item.price_max),
      priceMedian:number(item.price_median),
      mileageMedian:number(item.mileage_median),
      powertrains:item.powertrains || [],
      image:item.image || null,
    })),
    budgets:Object.fromEntries(budgets.rows.map((item) => [item.band, { count:item.count, models:item.models || [] }])),
  };
}

/** Сколько машин в разделе. Нужно сборке: по этому числу в карту сайта попадают страницы раздела. */
export async function countCars(searchParams) {
  return (await sectionStats(searchParams)).total;
}

// Когда набор машин в последний раз менялся: у какой-то из его машин изменились данные
// объявления (`content_changed_at` ставится только при настоящем изменении — цена,
// пробег, фотографии) или в набор добавилась новая машина (`first_seen_at`).
// `last_seen_at` для этого не годится: она обновляется у всех машин при каждой ночной
// проверке, и все разделы получили бы одну и ту же сегодняшнюю дату — ровно та беда,
// из-за которой у 31 тысячи карточек в карте сайта стояло одно число.
export const SECTION_CHANGED_AT = "max(GREATEST(COALESCE(l.content_changed_at, l.imported_at), l.first_seen_at))";

/**
 * Сколько машин в наборе и когда набор менялся в последний раз — одним запросом.
 * Дата нужна карте сайта (`lastmod` у 163 разделов и 449 обзоров: без неё поисковик
 * не знает, что раздел вчера обновился) и подписи «данные обновлены» на самой странице.
 */
export async function sectionStats(searchParams) {
  const { where, values } = buildCarFilters(searchParams);
  const result = await pool.query(`SELECT count(*)::int AS total, ${SECTION_CHANGED_AT} AS changed_at
    FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, values);
  return { total: result.rows[0].total, changedAt: result.rows[0].changed_at || null };
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
  const half = (direction) => `(${carSelect} FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} ORDER BY l.estimated_total_usd ${direction} NULLS LAST, l.id LIMIT 1)`;
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
  const result = await pool.query(`${carSelect} FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id = ANY($1)`, [list]);
  const cars = new Map(result.rows.map((row) => [String(row.id), withoutDetailPayload(rowToCar(row))]));
  return list.map((id) => cars.get(id)).filter(Boolean);
}

export async function getCar(id) {
  // Корейский адрес `kr-123` — это id `encar-123`; голый номер — китайские источники,
  // чтобы совпавшие номера Che168 и Encar не открывали чужую машину.
  const lookup = koreanListingId(id) || id;
  const result = await pool.query(`${carSelect}, COALESCE((SELECT json_agg(json_build_object('at',p.observed_at,'priceCny',p.price_cny) ORDER BY p.observed_at) FROM price_history p WHERE p.listing_id=l.id), '[]'::json) AS price_history FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.id=$1 OR (l.external_id=$1 AND l.source<>'Encar') ORDER BY (l.id=$1) DESC LIMIT 1`, [lookup]);
  return result.rows[0] ? { ...rowToCar(result.rows[0]), priceHistory:result.rows[0].price_history } : null;
}

// Сколько машин в наличии у каждой марки — одним лёгким запросом.
//
// Зачем: разделы марок заведены заранее, под загрузку каталога, и марки, до которой
// импорт ещё не дошёл, в базе просто нет. Пустой раздел поисковику отдавать нельзя —
// это тонкая страница без содержания, — поэтому такие разделы не показываются нигде
// и отвечают 404, пока в них не появятся машины.
//
// Ответ держим в памяти пять минут: страницы разделов запрашивает робот тысячами,
// а состав марок меняется раз в сутки, после ночного импорта.
const BRAND_STOCK_TTL_MS = 5 * 60 * 1000;
let brandStockCache = { at: 0, value: null };

/**
 * Модели марки с числом живых машин — для каталожных страниц моделей: по этому
 * списку адрес `/catalog/byd/seal-06-dm-i` превращается в имя модели из базы.
 */
export async function brandModels(brand) {
  const result = await pool.query(
    `SELECT v.model, count(*)::int AS count FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
     WHERE l.status='active' AND v.brand=$1 GROUP BY v.model ORDER BY count DESC, v.model`,
    [brand],
  );
  return result.rows.map((row) => ({ model:row.model, count:row.count }));
}

/**
 * Живые цифры одной модели для каталожной страницы: сколько машин, годы, пробег,
 * вилка и середина цен, типы двигателя, кузова и лучшие характеристики. Один скан
 * по объявлениям модели; цены — по сохранённой оценке до Минска (та же, что в
 * сортировке), края вилки страница потом пересчитывает живым расчётом.
 */
export async function modelCatalogFacts(brand, model) {
  const numeric = (source) => `(CASE WHEN ${source} ~ '^[0-9]+([.,][0-9]+)?$' THEN replace(${source}, ',', '.')::numeric END)`;
  const spec = (name) => numeric(`v.specifications->>'${name}'`);
  const payload = (name) => numeric(`l.source_payload->>'${name}'`);
  const powerSql = `COALESCE(${payload("horsepower")}, ${numeric("v.specifications->>'enginePower'")})`;
  const where = "WHERE l.status='active' AND v.brand=$1 AND v.model=$2";
  const [summary, powertrains, bodies] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total, ${SECTION_CHANGED_AT} AS changed_at, max(l.last_seen_at) AS refreshed_at,
        min(v.model_year)::int AS year_min, max(v.model_year)::int AS year_max,
        min(NULLIF(l.mileage_km, 0))::int AS mileage_min,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY NULLIF(l.mileage_km, 0)) AS mileage_median,
        min(l.estimated_total_usd) AS price_min, max(l.estimated_total_usd) AS price_max,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY l.estimated_total_usd) AS price_p25,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY l.estimated_total_usd) AS price_p75,
        max(v.battery_kwh)::numeric AS battery_max,
        max(COALESCE(v.electric_range_km, v.combined_range_km))::int AS range_max,
        max(${powerSql}) AS power_max,
        min(${spec("acceleration")}) AS accel_min
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}`, [brand, model]),
    pool.query(`SELECT v.powertrain AS type, count(*)::int AS count FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} AND v.powertrain IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`, [brand, model]),
    pool.query(`SELECT v.specifications->>'bodyType' AS name, count(*)::int AS count FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where} AND v.specifications->>'bodyType' IS NOT NULL AND v.specifications->>'bodyType'<>'Не определён' GROUP BY 1 ORDER BY 2 DESC`, [brand, model]),
  ]);
  const row = summary.rows[0] || {};
  const value = (name) => (row[name] == null ? null : Number(row[name]));
  return {
    total:row.total || 0,
    changedAt:row.changed_at || null,
    refreshedAt:row.refreshed_at || null,
    yearMin:value("year_min"), yearMax:value("year_max"),
    mileageMin:value("mileage_min"), mileageMedian:value("mileage_median"),
    priceFrom:value("price_min"), priceTo:value("price_max"),
    priceP25:value("price_p25"), priceP75:value("price_p75"),
    batteryMax:value("battery_max"), rangeMax:value("range_max"), powerMax:value("power_max"), accelMin:value("accel_min"),
    powertrains:powertrains.rows.map((item) => ({ type:item.type, count:item.count })),
    bodyTypes:bodies.rows.map((item) => ({ name:item.name, count:item.count })),
  };
}

export async function brandStock() {
  const now = Date.now();
  if (brandStockCache.value && now - brandStockCache.at < BRAND_STOCK_TTL_MS) return brandStockCache.value;
  const { rows } = await pool.query("SELECT v.brand, count(*)::int count FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active' GROUP BY v.brand");
  const value = new Map(rows.map((row) => [row.brand, row.count]));
  brandStockCache = { at: now, value };
  return value;
}

/**
 * Середина цены под ключ по каждому набору «модель + год выпуска» — для страницы
 * сравнения с белорусским рынком.
 *
 * Почему медиана, а не «от такой-то суммы»: самая дешёвая машина модели — это почти
 * всегда битая или с огромным пробегом, и сравнивать её с белорусским рынком нечестно
 * в нашу пользу. Медиана показывает, сколько стоит обычная такая машина.
 *
 * Цену берём из `estimated_total_usd` — того же столбца, по которому каталог сортирует
 * по цене. Он пересчитывается командой `db:estimates` при выкладке, поэтому после
 * правки правил расчёта страницу сравнения нужно пересобирать вместе с ней.
 *
 * Годы от 2020: раньше мы не возим, и в белорусском своде их тоже нет.
 */
export async function modelPriceMedians() {
  const { rows } = await pool.query(`SELECT v.brand, v.model, v.model_year AS year, count(*)::int AS count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY l.estimated_total_usd)::int AS median,
      percentile_cont(0.1) WITHIN GROUP (ORDER BY l.estimated_total_usd)::int AS low
    FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
    WHERE l.status='active' AND l.estimated_total_usd IS NOT NULL AND v.model_year >= 2020
    GROUP BY v.brand, v.model, v.model_year
    HAVING count(*) >= 3`);
  return rows;
}

/**
 * Полная ценовая статистика по модели, году и верхней границе пробега для карточек
 * сравнения. Каждый предел накопительный: «до 50 000 км» включает и машины с
 * пробегом до 20 000 км. Для каждой машины считаются обе цены — с квотой и без,
 * чтобы переключатель менял медиану, среднюю и границы без нового запроса к базе.
 * Фото берём у свежего активного объявления той же модели.
 */
// A build supplies both refund scenarios; HTTP requests never need to prepare
// the full catalog before serving the first visitor. Refreshes share one query.
const marketStatsFile = new URL(`../${process.env.ABCARS_BUILD_DIR || "dist"}/market-price-stats.json`, import.meta.url);
const marketPriceRuleFiles = [
  '../src/pricing.js','../src/china-logistics.js','../src/korea-logistics.js',
  '../src/engine-spec.js','../src/origin.js','../src/pricing-state.js',
  '../src/markets/estimate-offer.js','../src/markets/offer-context.js',
  '../config/sites/index.mjs','../config/sites/abcars.mjs','./market-price-stats.mjs',
];
const marketPriceRuleKey = marketPriceRuleFiles.reduce((hash,file)=>hash.update(file).update(readFileSync(new URL(file,import.meta.url))),crypto.createHash('sha256')).digest('hex');
const marketPriceRevision = async()=>{
  const {rows}=await pool.query(`SELECT
    (SELECT max(content_changed_at) FROM listings) AS listing_changed,
    (SELECT max(sold_at) FROM listings WHERE status='unavailable') AS sold_changed,
    (SELECT max(updated_at) FROM vehicles) AS vehicle_changed,
    (SELECT max(updated_at) FROM catalog_sources) AS source_changed,
    (SELECT count(*)::text || ':' || COALESCE(bit_xor(hashtextextended(listing_id,0)),0)::text
      FROM catalog_hidden_duplicates) AS visibility_revision`);
  const values=['listing_changed','sold_changed','vehicle_changed','source_changed'].map(key=>+new Date(rows[0]?.[key]||0));
  return {key:`${values.join(':')}:${rows[0]?.visibility_revision}:${marketPriceRuleKey}`,changedAt:Math.max(...values)};
};
let marketSeed;
try {
  const saved = JSON.parse(readFileSync(marketStatsFile, "utf8"));
  if (saved.version === 1 && Array.isArray(saved.normal) && Array.isArray(saved.refund50)) marketSeed = saved;
} catch { /* First build has no previous snapshot. */ }

const marketStats = createInputAwareCache(async (revision) => {
  const { rows } = await pool.query(`SELECT l.id, v.brand, v.model, v.model_year AS year,
      l.mileage_km, l.price_cny, l.source, l.city, v.powertrain AS type,
      p."usdPrice" AS usd_price, p."priceBasis" AS price_basis,
      p."fobPriceUsd" AS fob_price_usd, p."fobPort" AS fob_port,
      p."sourceFuelType" AS fuel_type,
      COALESCE(p.transmission, s.transmission) AS transmission,
      COALESCE(p.engine, s.engine) AS engine,
      p."manufactureDate" AS manufacture_date, p.dimensions, p."curbWeight" AS curb_weight,
      (SELECT m.url FROM listing_media m WHERE m.listing_id=l.id ORDER BY m.position LIMIT 1) AS image
    FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
    CROSS JOIN LATERAL jsonb_to_record(l.source_payload) AS p(
      "usdPrice" text, "priceBasis" text, "fobPriceUsd" text, "fobPort" text,
      "sourceFuelType" text, transmission text, engine text, "manufactureDate" text,
      dimensions text, "curbWeight" text)
    CROSS JOIN LATERAL jsonb_to_record(v.specifications) AS s(transmission text, engine text)
    WHERE l.status='active' AND l.price_cny > 0 AND v.model_year IS NOT NULL
    ORDER BY l.listed_at DESC NULLS LAST, l.id`);
  return {
    version:1, createdAt:Date.now(),inputRevision:revision.key,
    normal:await marketPriceStatsFromRowsAsync(rows),
    refund50:await marketPriceStatsFromRowsAsync(rows, { refund50:true }),
  };
}, { readRevision:marketPriceRevision, initial:marketSeed });

export const marketPriceSnapshot = options => marketStats(options);
export async function modelPriceStats({ refund50 = false } = {}) {
  const snapshot = await marketStats();
  return refund50 ? snapshot.refund50 : snapshot.normal;
}

export async function modelPriceStatsForQuota(quotaPricingOn = false, refund50 = false) {
  const rows = await modelPriceStats({ refund50 });
  return rows.map((row) => ({ ...row, ...(quotaPricingOn ? row.quotaOn : row.quotaOff) }));
}

// Кузов и тип двигателя каждой модели с числом машин — одним запросом на весь каталог
// (около семисот строк).
//
// Зачем: обзор модели был почти тупиком — со страницы Haval H6 вела одна ссылка в
// каталог и две на другие обзоры Haval, потому что обзоров этой марки всего три. По
// этой таблице обзор находит похожие модели других марок: тот же кузов, тот же тип
// двигателя, больше всего машин в наличии. Класс модели берётся из живого каталога,
// поэтому руками его нигде держать не нужно.
//
// Держим в памяти десять минут: состав каталога меняется раз в сутки, после ночного
// импорта, а страницы обзоров робот запрашивает подряд.
const MODEL_CLASS_TTL_MS = 10 * 60 * 1000;
let modelClassCache = { at: 0, value: null };

export async function modelClassStock() {
  const now = Date.now();
  if (modelClassCache.value && now - modelClassCache.at < MODEL_CLASS_TTL_MS) return modelClassCache.value;
  const { rows } = await pool.query(`SELECT v.brand, v.model, v.powertrain,
      NULLIF(v.specifications->>'bodyType','') AS body_type, count(*)::int AS count
    FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
    WHERE l.status='active'
    GROUP BY v.brand, v.model, v.powertrain, v.specifications->>'bodyType'
    ORDER BY count DESC`);
  const value = rows.map((row) => ({ brand:row.brand, model:row.model, powertrain:row.powertrain, bodyType:row.body_type, count:row.count }));
  modelClassCache = { at: now, value };
  return value;
}

/**
 * Справочник фильтров двумя проходами по каталогу вместо шести. Раньше счёт, марки,
 * модели, кузова, приводы и набор доступных фильтров были отдельными запросами, и
 * каждый заново перебирал все машины: после открытия Guazi (80 тыс.) на двух ядрах
 * сервера справочник стоил 1,2–1,9 с, а мимо кэша его просит каждая страница каталога.
 * Теперь каждый проход группирует сразу по нескольким признакам (GROUPING SETS):
 *   общий — по всему каталогу: марки (отбор по топливу и кузову, без марки — в списке
 *     марок видны все) и приводы (без отбора);
 *   узкий — только машины выбранного топлива и марки: счёт и модели (плюс кузов),
 *     кузова и доступные фильтры (без кузова), число видов топлива — как число
 *     непустых групп по топливу (count DISTINCT).
 * Узкий проход при выбранной марке перебирает сотни машин, а не весь каталог; оба идут
 * параллельно. Условия те же, что были у отдельных запросов; порядок строк задаёт база,
 * как и раньше, — у неё своё правило сравнения строк.
 */
// `country` — ключ страны (src/origin.js): на странице страны марки, модели и счётчики
// считаются только по её источникам, иначе на /catalog/korea висели бы китайские марки.
export const getCatalogMeta = (type, brand, bodyType, country = null) => queryCatalogMeta(pool, type, brand, bodyType, country);

// Список обзоров на странице «О моделях авто» показывает по каждой модели фото,
// число машин в наличии, цену, разгон и запас хода. Раньше страница спрашивала это
// по одной модели за раз — сто тридцать обращений к каталогу, каждое со своим
// пересчётом количества, из-за чего фотографии проявлялись десятками секунд. Здесь
// всё считается одним проходом по активным объявлениям: цены и характеристики берём
// сводкой по модели, фото — с самой доступной машины, то есть с той же, что и раньше.
export async function getModelFacts() {
  const result = await pool.query(`WITH active AS (
      SELECT l.id, v.brand, v.model, v.powertrain, l.estimated_total_usd AS price, v.model_year AS year,
        NULLIF(v.specifications->>'acceleration','')::numeric AS accel,
        COALESCE(v.electric_range_km, v.combined_range_km) AS range,
        -- Когда у модели в последний раз что-то менялось: нужно карте сайта, чтобы
        -- у 449 обзоров стояла своя дата, а не пустое место.
        GREATEST(COALESCE(l.content_changed_at, l.imported_at), l.first_seen_at) AS changed_at
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.status='active'
    ), summary AS (
      SELECT brand, model, count(*)::int AS count, min(price) AS price_min, max(price) AS price_max,
        min(year) AS year_min, max(year) AS year_max, min(accel) AS accel, max(range) AS range, max(changed_at) AS changed_at,
        array_agg(DISTINCT powertrain) FILTER (WHERE powertrain IS NOT NULL) AS powertrains
      FROM active GROUP BY brand, model
    ), cheapest AS (
      SELECT DISTINCT ON (brand, model) brand, model, id
      FROM active ORDER BY brand, model, price ASC NULLS LAST, id
    )
    SELECT s.brand, s.model, s.count, s.price_min, s.price_max, s.year_min, s.year_max, s.accel, s.range, s.powertrains, s.changed_at,
      (SELECT m.url FROM listing_media m WHERE m.listing_id=c.id ORDER BY m.position LIMIT 1) AS image
    FROM summary s LEFT JOIN cheapest c ON c.brand=s.brand AND c.model=s.model
    ORDER BY s.brand, s.model`);
  return { models:result.rows.map((row) => ({
    brand:row.brand,
    model:row.model,
    count:row.count,
    priceMin:Number(row.price_min) || null,
    priceMax:Number(row.price_max) || null,
    // Годы выпуска машин модели в каталоге — для карточек «Популярные модели» на главной.
    yearMin:Number(row.year_min) || null,
    yearMax:Number(row.year_max) || null,
    accel:Number(row.accel) || null,
    range:Number(row.range) || null,
    powertrains:row.powertrains || [],
    changedAt:row.changed_at || null,
    image:row.image || null,
  })) };
}

export async function createOrderDraft({ listingId, name = null, contact, calculation = {} }) {
  const result = await pool.query("INSERT INTO order_drafts (listing_id, customer_name, contact, calculation) VALUES ($1,$2,$3,$4) RETURNING id, listing_id, status, created_at", [listingId,name,contact,JSON.stringify(calculation)]);
  // Сообщение в телеграм уходит своим ходом: посетитель получает ответ сразу, не
  // дожидаясь доставки.
  notifyLead({
    kind:calculation.requestType === "catalog_search" ? "custom_search" : calculation.requestType === "availability_check" ? "availability" : "listing_draft",
    source:"site",
    name,
    contact,
    methods:Array.isArray(calculation.contactMethods) ? calculation.contactMethods : [],
    listingId,
    comment:calculation.preferences || "",
    filters:calculation.catalogFilters || null,
  });
  await pool.query(`INSERT INTO crawl_jobs (source, listing_id, job_type, url, priority)
    SELECT source, id, 'refresh_listing', source_url, 100 FROM catalog_listings WHERE id=$1
      AND NOT (source='Guazi' AND COALESCE(source_payload->>'priceBasis','')='FOB')
    ON CONFLICT (job_type, listing_id) WHERE status IN ('queued','running') DO UPDATE SET priority=GREATEST(crawl_jobs.priority,100), available_at=LEAST(crawl_jobs.available_at,now())`, [listingId]);
  return result.rows[0];
}

export function clearCatalogCaches() {
  clearCatalogReadCache();
  brandStockCache={at:0,value:null};
  marketStats.invalidate();
  modelClassCache={at:0,value:null};
}

import { ORIGIN_SOURCES, originForSource, originFromParam } from "../src/origin.js";
import { searchTextWords } from "../src/car-search-text.js";
import { DRIVE_TYPES, normalizeDrive, orderDrives, UNKNOWN_DRIVE } from "../src/drive-types.js";
import { FUEL_TYPES, GEARBOX_TYPES } from "../src/engine-spec.js";
// Кузов и модель приходят мультивыбором: несколько одноимённых параметров.
// Для кузова дополнительно принимаем список через запятую — названия там фиксированы,
// у моделей запятая может быть частью имени, поэтому их не режем.
export function multiParamValues(input, anyLabel, { splitCommas = false } = {}) {
  const raw = input == null ? [] : Array.isArray(input) ? input : [input];
  const items = raw.map((item) => String(item));
  const parts = splitCommas ? items.flatMap((item) => item.split(",")) : items;
  return [...new Set(parts.map((item) => item.trim()).filter((item) => item && item !== anyLabel))];
}

// Объём мотора, мощность и коробка приходят из источника описанием («1.4T 150HP L4»,
// «7-speed wet dual-clutch»). Разбирает их src/engine-spec.js — при записи машины
// (см. upsertCar) и в статическом режиме на клиенте, — а в характеристиках лежат уже
// готовые значения: разбор строк прямо в отборе занимал на полном каталоге полсекунды.
const ENGINE_VOLUME_SQL = "NULLIF(v.specifications->>'engineVolume','')::numeric";
const ENGINE_POWER_SQL = "NULLIF(v.specifications->>'enginePower','')::numeric";
const GEARBOX_SQL = "v.specifications->>'gearbox'";
const FUEL_SQL = "v.specifications->>'fuelType'";

// Свободный текст запроса (параметр `text`: «surpass», «lfp», «215/65») ищется по
// строке, в которую у каждого объявления сложены название, комплектация, город и все
// характеристики машины (см. db/migrations/035_listing_search_text.sql). Разбор строки
// на слова общий с браузером — в запасном режиме без сервера каталог отбирается теми
// же правилами.
export const searchTerms = searchTextWords;

// В LIKE «%» и «_» — свои знаки, а в запросе это обычные символы: подчёркивание
// в чужой комплектации не должно совпадать с любой буквой.
const likeEscape = (word) => word.replace(/[\\%_]/g, "\\$&");

export function buildCarFilters(searchParams) {
  const clauses = ["l.status='active'"];
  const values = [];
  const add = (sql, value) => { values.push(value); clauses.push(sql.replace("?", `$${values.length}`)); };
  if (["Guazi", "Che168", "Encar"].includes(searchParams.get("source"))) add("l.source=?", searchParams.get("source"));
  // Страна машины — по источникам (`country=china|korea`, код `KR` тоже понимаем);
  // неизвестное значение фильтр не сужает, чтобы опечатка в адресе не прятала каталог.
  const country = originFromParam(searchParams.get("country"));
  if (country) add("l.source=ANY(?)", [...ORIGIN_SOURCES[country]]);
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
  // «Без страховых случаев»: у Encar число случаев лежит числом (`claimsCount`), у
  // китайских источников — строкой отчёта «0次理赔»; берём то, что есть у записи.
  if (searchParams.get("noClaims") === "1") clauses.push("(NULLIF(l.source_payload->>'claimsCount','')::int = 0 OR COALESCE(l.claims, l.source_payload->>'claims', l.source_payload->>'incident') ~ '(0\\s*次理赔|理赔\\s*0\\s*次)')");
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
  // Литры мотора и лошадиные силы: машину без известного значения фильтр отсеивает,
  // как и разгон, — иначе электромобили попадали бы в выдачу «от 1.6 литра».
  if (Number(searchParams.get("engineMin"))) add(`${ENGINE_VOLUME_SQL}>=?`, Number(searchParams.get("engineMin")));
  if (Number(searchParams.get("engineMax"))) add(`${ENGINE_VOLUME_SQL}<=?`, Number(searchParams.get("engineMax")));
  if (Number(searchParams.get("powerMin"))) add(`${ENGINE_POWER_SQL}>=?`, Number(searchParams.get("powerMin")));
  if (Number(searchParams.get("powerMax"))) add(`${ENGINE_POWER_SQL}<=?`, Number(searchParams.get("powerMax")));
  if (GEARBOX_TYPES.includes(searchParams.get("gearbox"))) add(`${GEARBOX_SQL}=?`, searchParams.get("gearbox"));
  // Топливо есть только у машин с двигателем: у электромобиля его нет вовсе, и такой
  // отбор его честно не показывает.
  if (FUEL_TYPES.includes(searchParams.get("fuel"))) add(`${FUEL_SQL}=?`, searchParams.get("fuel"));
  // Каждое слово свободного запроса обязано найтись: «song plus champion» — это все
  // три слова разом, а не любое из них.
  for (const word of searchTerms(searchParams.get("text"))) add("l.search_text LIKE ?", `%${likeEscape(word)}%`);
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

export async function queryCatalogMeta(db, type, brand, bodyType, country = null) {
  const origin = originFromParam(country);
  const selectedBodyTypes = multiParamValues(bodyType, "Все кузова", { splitCommas:true });
  // У каждого прохода свой набор подстановок, номера $n в каждом идут подряд.
  const filters = () => {
    const values = [];
    const param = (value) => { values.push(value); return `$${values.length}`; };
    return {
      values,
      type: () => (type && type !== "Все" ? `v.powertrain=${param(type)}` : "true"),
      brand: () => (brand && brand !== "Все марки" ? `v.brand=${param(brand)}` : "true"),
      body: () => (selectedBodyTypes.length ? `v.specifications->>'bodyType'=ANY(${param(selectedBodyTypes)})` : "true"),
      country: () => (origin ? `l.source=ANY(${param([...ORIGIN_SOURCES[origin]])})` : "true"),
    };
  };
  const w = filters();
  // Третий набор группировки — источник: из него складывается число машин по странам
  // для фильтра «Страна» (src/origin.js), с тем же отбором, что и у марок.
  const wide = { values:w.values, text:`SELECT * FROM (
      SELECT GROUPING(v.brand) AS g_brand, GROUPING(l.source) AS g_source, v.brand, v.drivetrain AS drive, l.source,
        count(*) FILTER (WHERE ${w.type()} AND ${w.body()})::int AS brand_count,
        count(*) FILTER (WHERE v.drivetrain IS NOT NULL AND v.drivetrain<>'Не указан')::int AS drive_count,
        count(*) FILTER (WHERE ${w.type()} AND ${w.brand()} AND ${w.body()})::int AS source_count
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
      WHERE l.status='active' AND ${w.country()}
      GROUP BY GROUPING SETS ((v.brand), (v.drivetrain), (l.source))
    ) counted ORDER BY g_brand, brand, drive, source` };
  const n = filters();
  const narrow = { values:n.values, text:`SELECT * FROM (
      SELECT GROUPING(v.model) AS g_model, GROUPING(v.specifications->>'bodyType') AS g_body, GROUPING(${FUEL_SQL}) AS g_fuel,
        v.model, v.specifications->>'bodyType' AS body_type,
        count(*) FILTER (WHERE ${n.body()})::int AS body_count,
        count(*) FILTER (WHERE v.specifications->>'bodyType' IS NOT NULL AND v.specifications->>'bodyType'<>'Не определён')::int AS known_body_count,
        count(${FUEL_SQL})::int AS fuel_count,
        -- Какие фильтры вообще показывать. Считается по тому же отбору, что и остальной
        -- справочник (топливо и марка), — иначе на бензиновой вкладке висел бы фильтр по
        -- батарее, а на электрической по объёму двигателя.
        count(*)::int AS total, count(v.drivetrain)::int AS drive, count(l.owners)::int AS owners, count(v.battery_kwh)::int AS battery,
        count(l.condition_grade)::int AS condition, count(COALESCE(v.electric_range_km, v.combined_range_km))::int AS "range",
        count(NULLIF(v.specifications->>'acceleration',''))::int AS accel, count(NULLIF(v.specifications->>'tireRim',''))::int AS tire,
        count(${ENGINE_VOLUME_SQL})::int AS engine, count(${ENGINE_POWER_SQL})::int AS power, count(${GEARBOX_SQL})::int AS gearbox
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
      WHERE l.status='active' AND ${n.type()} AND ${n.brand()} AND ${n.country()}
      GROUP BY GROUPING SETS ((v.model), (v.specifications->>'bodyType'), (${FUEL_SQL}), ())
    ) counted ORDER BY g_model, model, g_body, CASE WHEN g_body=0 THEN known_body_count END DESC, body_type` };
  const [wideRows, narrowRows] = await Promise.all([db.query(wide.text, wide.values), db.query(narrow.text, narrow.values)]);
  const countryCounts = new Map();
  for (const row of wideRows.rows.filter((row) => row.g_source === 0)) {
    const origin = originForSource(row.source);
    countryCounts.set(origin, (countryCounts.get(origin) || 0) + Number(row.source_count));
  }
  const countryRowsOut = Object.keys(ORIGIN_SOURCES).map((origin) => ({ origin, count:countryCounts.get(origin) || 0 }));
  const brands = wideRows.rows.filter((row) => row.g_brand === 0 && row.g_source !== 0 && row.brand_count > 0).map((row) => ({ brand:row.brand, count:row.brand_count }));
  const drives = wideRows.rows.filter((row) => row.g_brand === 1 && row.g_source !== 0 && row.drive_count > 0);
  const part = (name) => narrowRows.rows.filter((row) => ["g_model", "g_body", "g_fuel"].every((key) => row[key] === (key === name ? 0 : 1)));
  // Строка итога есть всегда (пустая группировка отвечает и на пустой выборке); запас —
  // на случай подменённой базы в тестах.
  const all = narrowRows.rows.find((row) => row.g_model && row.g_body && row.g_fuel) || {};
  const sum = (key) => all[key] ?? 0;
  const models = part("g_model").filter((row) => row.body_count > 0).map((row) => ({ model:row.model, count:row.body_count }));
  const bodyTypes = part("g_body").filter((row) => row.known_body_count > 0).map((row) => ({ body_type:row.body_type, count:row.known_body_count }));
  const driveCounts = drives.reduce((totals, row) => {
    const drive = normalizeDrive(row.drive);
    return drive === UNKNOWN_DRIVE ? totals : totals.set(drive, (totals.get(drive) || 0) + Number(row.drive_count));
  }, new Map());
  const driveRows = orderDrives([...driveCounts.keys()]).map((drive) => ({ drive, count:driveCounts.get(drive) }));
  const availability = {
    total:sum("total"), drive:sum("drive"), owners:sum("owners"), battery:sum("battery"), condition:sum("condition"),
    range:sum("range"), accel:sum("accel"), tire:sum("tire"), engine:sum("engine"), power:sum("power"), gearbox:sum("gearbox"),
    fuel:part("g_fuel").filter((row) => row.fuel_count > 0).length,
  };
  return { total:sum("body_count"), brands, models, bodyTypes, drives:driveRows, countries:countryRowsOut, availability };
}


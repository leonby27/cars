// Где стоит цена этой машины среди таких же в наличии.
//
// Что именно сравниваем и почему так:
//
// 1. Сравниваем цену до Минска, а не цену в Китае. Пошлина и НДС у двух машин с
//    одинаковой ценой продавца расходятся на тысячи долларов: у электромобиля они
//    зависят от квоты и от того, старше ли машина пяти лет, у машины с мотором — от
//    объёма и возраста. Человек платит итог, значит и сравнивать надо итог.
//
// 2. Сначала сравниваем с той же моделью того же года. Цена падает с возрастом, и в
//    общем наборе любая машина 2021 года оказалась бы «дешёвой», а любая 2024-го —
//    «дорогой», ничего этим не сказав.
//
// 3. Внутри модели и года цену определяют комплектация, батарея и пробег. Без них
//    шкала врала бы: машина с тройным пробегом всегда оказывалась бы «намного
//    дешевле похожих», хотя выгоды в этом нет; простая комплектация — «дешёвой»
//    рядом с топовой того же года; а электромобиль с батареей на 60 кВт·ч — рядом
//    с тем же, но на 100. Поэтому лучший набор — та же комплектация, такая же
//    батарея и похожий пробег, и только если таких мало, условия снимаются по
//    одному. На чём сравнивали, подписано в карточке: набор никогда не подменяется
//    молча.
//
// 5. Основа шкалы — реальные цены выбранного набора. Пробег влияет на подбор,
//    а клиент может ухудшить нейтральную оценку при близких ценах и большем пробеге.
//    Расчётную скидку на километры вместо реальной медианы не подставляем.
//
//    Про батарею: у машины с мотором её нет вообще, и тогда условие не работает.
//    А внутри одной комплектации батарея почти всегда одна — название комплектации
//    её и задаёт («Panda Mini 120km»). Условие важно там, где комплектация не
//    совпала: в каталоге у 73% электромобилей внутри модели и года есть варианты,
//    где батареи расходятся больше чем на десятую часть.
//
//    Комплектацию источник кладёт в описание объявления — «2020 530Li Leading M
//    Sport Package». Другого текста там нет (комментариев продавца источник не
//    отдаёт), поэтому описание и есть название комплектации.
//
// 4. Меньше пяти машин для сравнения — шкалы нет вообще. Доля, посчитанная по трём
//    объявлениям, — это шум, а не наблюдение.
//
// Считается по живым объявлениям каталога и говорит только о нём: это положение среди
// наших цен, а не оценка рынка Беларуси.
import { pool } from "./db.mjs";
import { estimateLandedCost } from "../src/pricing.js";

/** Меньше этого числа машин в наборе — сравнивать не с чем. */
export const PRICE_RATING_MIN_CARS = 5;
/** Похожий пробег: в пределах этой доли от пробега самой машины. */
export const PRICE_RATING_MILEAGE_TOLERANCE = 0.4;
/** Такая же батарея: варианты пакетов идут заметными ступенями, хватает десятой доли. */
export const PRICE_RATING_BATTERY_TOLERANCE = 0.1;

// Записи модели держим в памяти: страницы машин обходит робот, и без кэша каждая
// карточка популярной модели заново вычитывала бы её объявления. Состав каталога
// меняется раз в сутки, после ночного импорта.
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_LIMIT = 200;
const cache = new Map();

// Узкая выборка: только то, из чего считается цена, плюс пробег и номер. Целиком
// строки брать нельзя — в них лежит исходный ответ источника, и у модели с двумя
// тысячами объявлений это десятки мегабайт на один запрос.
const COMPARABLES_SQL = `SELECT l.id, l.price_cny, l.city, l.mileage_km, l.source, l.description,
    l.source_payload->>'usdPrice' AS usd_price,
    l.source_payload->>'manufactureDate' AS manufacture_date,
    l.source_payload->>'dimensions' AS dimensions,
    l.source_payload->>'curbWeight' AS curb_weight,
    l.source_payload->>'sourceFuelType' AS source_fuel_type,
    v.model_year, v.powertrain, v.battery_kwh,
    v.specifications->>'engine' AS engine,
    v.specifications->>'transmission' AS transmission
  FROM listings l JOIN vehicles v ON v.id = l.vehicle_id
  WHERE l.status = 'active' AND v.brand = $1 AND v.model = $2 AND l.price_cny > 0`;

// Строка выборки — в такой же вид, какой ждёт расчёт цены. Цены обоих режимов
// считаем сразу и кладём рядом: набор лежит в памяти, а переключатель «Цены с
// квотами» меняет режим на ходу, и пересчитывать всю модель на каждое нажатие незачем.
const comparableFromRow = (row) => {
  const car = {
    id:row.id,
    source:row.source,
    chinaPrice:Number(row.price_cny) || 0,
    usdPrice:Number(row.usd_price) || null,
    city:row.city,
    dimensions:row.dimensions,
    curbWeight:Number(row.curb_weight) || null,
    sourceFuelType:row.source_fuel_type,
    year:Number(row.model_year) || null,
    manufactureDate:row.manufacture_date,
    type:row.powertrain,
    engine:row.engine,
    transmission:row.transmission,
  };
  return {
    id:row.id,
    year:car.year,
    trim:trimKey(row.description),
    battery:Number(row.battery_kwh) || 0,
    mileage:Number(row.mileage_km) || 0,
    priceQuotaOn:Number(estimateLandedCost(car, { quotaOver:false }).totalUsd) || 0,
    priceQuotaOff:Number(estimateLandedCost(car, { quotaOver:true }).totalUsd) || 0,
  };
};

// Название комплектации к сравнимому виду: источник ставит перед ним год, иногда
// слово Model, регистр и пробелы гуляют. Сравнивать надо смысл, а не запись.
export const trimKey = (value) => String(value || "")
  .replace(/^\s*(?:19|20)\d{2}\s*(?:model\s*)?/i, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const modelKey = (brand, model) => `${String(brand)}::${String(model)}`;

async function comparablesForModel(brand, model, { db = pool, now = Date.now() } = {}) {
  const key = modelKey(brand, model);
  const cached = cache.get(key);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.rows;
  const { rows } = await db.query(COMPARABLES_SQL, [brand, model]);
  const value = rows.map(comparableFromRow).filter((item) => item.priceQuotaOn > 0);
  // Кэш ограничиваем: моделей в каталоге под семьсот, и держать их все в памяти
  // ради робота, который идёт по каталогу подряд, ни к чему.
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(key, { at:now, rows:value });
  return value;
}

/** Насколько сдвиг планки под пробег ограничен — доля от типичной цены набора. */
export const PRICE_RATING_MILEAGE_SHIFT_CAP = 0.15;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Сколько цена теряет на километре — по самому набору. Набор делится пополам по
 * пробегу, у половин берутся типичные цена и пробег, и разница между ними даёт
 * наклон. Возвращает `null`, когда считать нечего: машин мало, пробеги половин почти
 * совпали или цена с пробегом не падает — в таком наборе поправка была бы гаданием.
 */
export function mileagePriceSlope(items, priceOf) {
  const points = items
    .filter((item) => Number(item.mileage) > 0 && Number(priceOf(item)) > 0)
    .sort((left, right) => left.mileage - right.mileage);
  if (points.length < 8) return null;
  const half = Math.floor(points.length / 2);
  const low = points.slice(0, half);
  const high = points.slice(points.length - half);
  const lowMileage = median(low.map((item) => item.mileage));
  const highMileage = median(high.map((item) => item.mileage));
  const wholeMileage = median(points.map((item) => item.mileage));
  if (!(wholeMileage > 0) || highMileage - lowMileage < wholeMileage * 0.14) return null;
  const slope = (median(high.map(priceOf)) - median(low.map(priceOf))) / (highMileage - lowMileage);
  return slope < 0 ? slope : null;
}

/**
 * Планка, с которой сравнивается цена этой машины: типичная цена набора, сдвинутая
 * под её пробег. Без наклона планка остаётся просто типичной ценой.
 */
export function expectedPrice(medianUsd, medianMileage, mileage, slope) {
  if (!(medianUsd > 0)) return { usd:0, adjusted:false };
  if (slope === null || !(mileage > 0) || !(medianMileage > 0)) return { usd:medianUsd, adjusted:false };
  const shift = slope * (mileage - medianMileage);
  const cap = medianUsd * PRICE_RATING_MILEAGE_SHIFT_CAP;
  const limited = Math.max(-cap, Math.min(cap, shift));
  return { usd:medianUsd + limited, adjusted:Math.abs(limited) >= medianUsd * 0.005 };
}

/**
 * Набор для сравнения. Условия снимаются по одному, от самого точного набора к самому
 * широкому, и берётся первый, в котором машин хватает:
 *
 *   1. та же комплектация, такая же батарея, похожий пробег
 *   2. та же комплектация, такая же батарея
 *   3. такая же батарея, похожий пробег
 *   4. такая же батарея
 *   5. похожий пробег
 *   6. просто тот же год
 *   7. ближайшие годы, расширяя диапазон до пяти объявлений
 *
 * Всё это внутри той же модели; последняя ступень допускает другие годы. Условие,
 * которого у машины нет — например батарея у машины с мотором, — просто не работает
 * и набор не сужает.
 *
 * Что именно совпало, возвращается вместе с набором: карточка подписывает это
 * словами, а про пробег и батарею пишет отдельно там, где они не учтены.
 */
export function chooseComparables(car, rows) {
  const year = Number(car?.year) || 0;
  const mileage = Number(car?.mileage) || 0;
  const battery = Number(car?.battery) || 0;
  const trim = trimKey(car?.description);
  const others = rows.filter((item) => String(item.id) !== String(car?.id));
  const sameYear = year ? others.filter((item) => item.year === year) : [];

  // Условие, которого у самой машины нет, набор не сужает: у бензиновой машины нет
  // батареи, и требовать «такую же» было бы нечем.
  const near = (value, tolerance, pick) => (list) => (value > 0
    ? list.filter((item) => pick(item) >= value * (1 - tolerance) && pick(item) <= value * (1 + tolerance))
    : list);
  const nearMileage = near(mileage, PRICE_RATING_MILEAGE_TOLERANCE, (item) => item.mileage);
  const nearBattery = near(battery, PRICE_RATING_BATTERY_TOLERANCE, (item) => item.battery);
  const sameTrim = (list) => (trim ? list.filter((item) => item.trim === trim) : list);
  const applied = (name) => (name === "trim" ? Boolean(trim) : name === "battery" ? battery > 0 : mileage > 0);
  const filters = { trim:sameTrim, battery:nearBattery, mileage:nearMileage };

  const ladder = [
    ["trim", "battery", "mileage"],
    ["trim", "battery"],
    ["battery", "mileage"],
    ["battery"],
    ["mileage"],
    [],
  ];
  for (const rung of ladder) {
    const items = rung.reduce((list, name) => filters[name](list), sameYear);
    if (items.length < PRICE_RATING_MIN_CARS) continue;
    return {
      items,
      sameYear:true,
      // «Совпало» — только то, что и требовалось, и было чем требовать.
      sameTrim:rung.includes("trim") && applied("trim"),
      sameBattery:rung.includes("battery") && applied("battery"),
      sameMileage:rung.includes("mileage") && applied("mileage"),
      yearFrom:year,
      yearTo:year,
    };
  }
  // При нехватке ровесников добавляем ближайшие годы. Фактический диапазон
  // передаём в карточку: сравнение без поправки на возраст приблизительное.
  if (year) {
    const dated = others.filter((item) => Number.isInteger(item.year) && item.year > 0);
    const distances = [...new Set(dated.map((item) => Math.abs(item.year - year)))].sort((a, b) => a - b);
    for (const distance of distances) {
      const items = dated.filter((item) => Math.abs(item.year - year) <= distance);
      if (items.length < PRICE_RATING_MIN_CARS) continue;
      return {
        items, sameYear:false, sameTrim:false, sameBattery:false, sameMileage:false,
        yearFrom:Math.min(...items.map((item) => item.year)),
        yearTo:Math.max(...items.map((item) => item.year)),
      };
    }
  }
  return null;
}

/** Сводка положения цены по готовому набору. Отделена от базы, чтобы её проверяли тесты. */
export function priceRatingFrom(car, rows) {
  const chosen = chooseComparables(car, rows);
  if (!chosen) return null;
  const own = {
    quotaOn:Number(estimateLandedCost(car, { quotaOver:false }).totalUsd) || 0,
    quotaOff:Number(estimateLandedCost(car, { quotaOver:true }).totalUsd) || 0,
  };
  if (!own.quotaOn) return null;
  const mileageMedian = median(chosen.items.map((item) => item.mileage).filter((value) => value > 0));
  // Реальные цены считаем отдельно для каждого режима квоты.
  const mode = (priceOf, ownUsd) => {
    const prices = chosen.items.map(priceOf);
    const medianUsd = median(prices);
    return {
      medianUsd,
      // Поля совместимости со старыми вкладками: никакой вымышленной цены.
      expectedUsd:medianUsd,
      mileageAdjusted:false,
      cheaperThan:prices.filter((value) => value > ownUsd).length,
    };
  };
  return {
    count:chosen.items.length,
    // Что совпало в наборе: год, комплектация, пробег. По этим признакам карточка
    // и подписывает шкалу, и решает, нужна ли отдельная строка про пробег.
    sameYear:chosen.sameYear,
    sameTrim:chosen.sameTrim,
    sameBattery:chosen.sameBattery,
    sameMileage:chosen.sameMileage,
    yearFrom:chosen.yearFrom,
    yearTo:chosen.yearTo,
    mileageMedian,
    batteryMedian:median(chosen.items.map((item) => item.battery).filter((value) => value > 0)),
    // Планка, типичная цена набора и число машин дороже этой. Положение бегунка
    // карточка считает сама — от отклонения цены от планки.
    quotaOn:mode((item) => item.priceQuotaOn, own.quotaOn),
    quotaOff:mode((item) => item.priceQuotaOff, own.quotaOff),
  };
}

/**
 * Положение цены машины среди таких же в наличии — или `null`, когда сравнивать не с
 * чем. Ошибку базы наружу не пускаем: карточка без шкалы лучше, чем упавшая карточка.
 */
export async function priceRating(car, options = {}) {
  if (!car?.brand || !car?.model || !(Number(car.chinaPrice) > 0)) return null;
  try {
    const rows = await comparablesForModel(car.brand, car.model, options);
    return priceRatingFrom(car, rows);
  } catch (error) {
    console.error("положение цены: сравнение не посчиталось", error);
    return null;
  }
}

/** Сброс памяти между тестами и после обновления каталога. */
export const clearPriceRatingCache = () => cache.clear();

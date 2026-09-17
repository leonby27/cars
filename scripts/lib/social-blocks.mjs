// Блоки публикаций: правила отбора машин и тексты записей.
//
// Что это. В плане (SOCIAL_PLAN.md) описано восемь видов записей. Каждый вид — это
// запрос к каталогу плюс шаблон текста. Здесь они и живут: один блок — одна функция,
// которая возвращает готовый текст, кадры и список машин, попавших в запись.
//
// Общие правила, одинаковые для всех блоков (из плана):
//  - там, где есть конкретная машина, в записи стоит её номер;
//  - в конце записи — призыв написать в Директ;
//  - цена всегда «под ключ», в долларах и рублях.
//
// Цену не берём из базы напрямую: её считает estimateLandedCost по тем же правилам,
// что и карточка на сайте. В базе лежит сохранённая оценка, но она может отстать от
// правил расчёта, если их меняли, а пересчёт ещё не прогоняли.
import { pool } from "../../server/db.mjs";
import { carTitle } from "../../src/car-title.js";
import { estimateLandedCost, usdToByn } from "../../src/pricing.js";
import { BLOG_SOCIAL } from "../../src/blog-social.js";
import { buildPostText, carNumber, pickPhotos } from "./social-card.mjs";

// Костяк ленты из SOCIAL_PLAN.md: по каждой модели показываем свои машины.
// Имена моделей — ровно как в каталоге, они сверены с базой 17.09.2026.
export const CORE_MODELS = [
  { brand: "Zeekr", model: "001" }, { brand: "Zeekr", model: "7X" }, { brand: "Zeekr", model: "007GT" },
  { brand: "Geely", model: "EX2" }, { brand: "Geely", model: "EX5" }, { brand: "Geely", model: "Monjaro" },
  { brand: "Geely", model: "Galaxy Starship 7" }, { brand: "Geely", model: "Okavango" },
  { brand: "BYD", model: "Han L" }, { brand: "BYD", model: "Qin L" }, { brand: "BYD", model: "Seagull" },
  { brand: "BYD", model: "Song PLUS" }, { brand: "BYD", model: "Song PLUS DM-i" },
  { brand: "BYD", model: "Yuan Pro" }, { brand: "BYD", model: "Yuan UP" },
  { brand: "BMW", model: "iX3" }, { brand: "BMW", model: "i3" }, { brand: "BMW", model: "i5" }, { brand: "BMW", model: "i4" },
  { brand: "Mercedes-Benz", model: "EQS" }, { brand: "Mercedes-Benz", model: "EQA" },
  { brand: "Mercedes-Benz", model: "EQB" }, { brand: "Mercedes-Benz", model: "EQE" },
  { brand: "Deepal", model: "L07" }, { brand: "Deepal", model: "SL03" },
  { brand: "Deepal", model: "S07" }, { brand: "Deepal", model: "S05" },
  { brand: "Xiaomi", model: "SU7" }, { brand: "Xiaomi", model: "YU7" },
];

const money = (usd) => `${new Intl.NumberFormat("ru-RU").format(Math.round(usd))}$`;
const number = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0));

// Призыв, которым заканчивается каждая запись. В телеграме это личные сообщения,
// в Instagram — Директ; слово выбирается по сети.
const callToAction = (network) =>
  network === "telegram" ? "✍️ Пишите в личные сообщения — проверим, на месте ли машина" : "✍️ Пишите в Директ — проверим, на месте ли машина";

// Машина в том виде, в каком её ждут сборщик текста и расчёт цены.
const CAR_FIELDS = `
  l.external_id, v.brand, v.model, v.model_year as year, l.mileage_km as mileage,
  v.battery_kwh as battery, v.electric_range_km as range, v.powertrain, v.specifications,
  l.city, l.source, l.price_cny as "chinaPrice", l.estimated_total_usd as stored_usd,
  (l.source_payload->>'usdPrice')::numeric as usd_price,
  l.previous_price_usd, l.price_changed_at, l.listed_at, l.imported_at, l.title
`;

function shape(row) {
  const specs = row.specifications || {};
  return {
    externalId: String(row.external_id),
    id: `che168-${row.external_id}`,
    brand: row.brand,
    model: row.model,
    year: row.year,
    mileage: Number(row.mileage) || 0,
    battery: row.battery ? Number(row.battery) : null,
    range: row.range ? Number(row.range) : null,
    type: row.powertrain || "ДВС",
    engine: specs.engine || null,
    horsepower: specs.enginePower ? Number(specs.enginePower) : null,
    bodyType: specs.bodyType || null,
    dimensions: specs.dimensions || null,
    curbWeight: specs.curbWeight ? Number(specs.curbWeight) : null,
    city: row.city,
    source: row.source,
    chinaPrice: Number(row.chinaPrice) || 0,
    // Цена источника в долларах: без неё расчёт пошёл бы через юани туда-обратно
    // и завысил бы цену примерно на семь процентов.
    usdPrice: row.usd_price ? Number(row.usd_price) : null,
    previousPriceUsd: row.previous_price_usd ? Number(row.previous_price_usd) : null,
    priceChangedAt: row.price_changed_at,
    title: row.title,
  };
}

async function photosFor(car, limit = 8) {
  const { rows } = await pool.query(
    `select m.url from listing_media m
     join listings l on l.id = m.listing_id
     where l.external_id = $1 order by m.position limit $2`,
    [car.externalId, limit + 4],
  );
  const sources = rows.map((row) => row.url);
  return pickPhotos({ ...car, images: sources }, { limit });
}

const priced = (car) => {
  const totalUsd = estimateLandedCost(car).totalUsd;
  return { ...car, totalUsd, totalByn: usdToByn(totalUsd) };
};

// Машины одной модели: живые объявления с фотографиями и посчитанной ценой.
async function modelListings(brand, model) {
  const { rows } = await pool.query(
    `select ${CAR_FIELDS} from listings l
     join vehicles v on v.id = l.vehicle_id
     where l.status = 'active' and v.brand = $1 and v.model = $2 and l.estimated_total_usd > 0
       and exists (select 1 from listing_media m where m.listing_id = l.id)`,
    [brand, model],
  );
  return rows.map(shape).map(priced).sort((left, right) => left.totalUsd - right.totalUsd);
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Блок 1. Самая дешёвая машина модели. */
export async function cheapestOfModel({ brand, model, network = "telegram", site = "abcars.by" }) {
  const cars = await modelListings(brand, model);
  if (!cars.length) return null;
  const car = cars[0];
  const body = buildPostText(car, { totalUsd: car.totalUsd, totalByn: car.totalByn, network, site });
  const line = cars.length > 1
    ? `💡 Самая доступная ${carTitle(brand, model, null)} из ${cars.length} в каталоге`
    : `💡 Единственная ${carTitle(brand, model, null)} в каталоге`;
  return {
    block: "cheapest",
    cars: [car],
    photos: await photosFor(car),
    text: `${body}\n${line}\n${callToAction(network)}`,
  };
}

/**
 * Блок 2. Оптимальная по параметрам: не старше типичного года и не хуже типичного
 * пробега, самая дешёвая из таких. Возвращает null, если она совпала с самой дешёвой
 * или почти не отличается по цене — тогда запись не имеет смысла.
 */
export async function bestValueOfModel({ brand, model, network = "telegram", site = "abcars.by", asQuestion = false }) {
  const cars = await modelListings(brand, model);
  if (cars.length < 4) return null;
  const medianYear = median(cars.map((car) => car.year));
  const medianMileage = median(cars.map((car) => car.mileage));
  const good = cars.filter((car) => car.year >= medianYear && car.mileage <= medianMileage);
  if (!good.length) return null;

  const cheapest = cars[0];
  const best = good[0];
  if (best.externalId === cheapest.externalId) return null;
  if ((best.totalUsd - cheapest.totalUsd) / cheapest.totalUsd < 0.03) return null;

  const body = buildPostText(best, { totalUsd: best.totalUsd, totalByn: best.totalByn, network, site });
  const gap = best.totalUsd - cheapest.totalUsd;
  const compare = `⚖️ Самая дешёвая ${carTitle(brand, model, null)} стоит ${money(cheapest.totalUsd)}, но там ${number(cheapest.mileage)} км пробега и ${cheapest.year} год. Здесь за ${money(gap)} разницы — ${number(best.mileage)} км и ${best.year}.`;
  const tail = asQuestion
    ? `\n❓ Как вам цена за такое состояние?\n${callToAction(network)}`
    : `\n${callToAction(network)}`;

  return { block: asQuestion ? "question" : "best-value", cars: [best], photos: await photosFor(best), text: `${body}\n${compare}${tail}` };
}

// Общий вид строки в списке из нескольких машин.
const listLine = (car, extra = "") =>
  `• ${carTitle(car.brand, car.model, null)}, ${car.year} — ${money(car.totalUsd)}${extra}\n  ${number(car.mileage)} км · №${carNumber(car)}`;

/** Блок 4. Машины костяка, у которых сильнее всего упала цена. */
export async function biggestDrops({ models, network = "telegram", limit = 5 }) {
  const pairs = models.map(({ brand, model }) => [brand, model]);
  const { rows } = await pool.query(
    `select ${CAR_FIELDS} from listings l
     join vehicles v on v.id = l.vehicle_id
     where l.status = 'active' and l.estimated_total_usd > 0
       and l.previous_price_usd is not null
       and (v.brand, v.model) in (${pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ")})
       and exists (select 1 from listing_media m where m.listing_id = l.id)`,
    pairs.flat(),
  );
  // previous_price_usd — прошлая цена у источника, а не под ключ. Чтобы показать
  // честное падение, старую цену прогоняем через тот же расчёт под ключ.
  const cars = rows.map(shape).map(priced)
    .map((car) => {
      const before = car.previousPriceUsd ? estimateLandedCost({ ...car, usdPrice: car.previousPriceUsd }).totalUsd : 0;
      return { ...car, drop: before - car.totalUsd };
    })
    .filter((car) => car.drop > 0)
    .sort((left, right) => right.drop - left.drop)
    .slice(0, limit);
  if (!cars.length) return null;

  const lines = cars.map((car) => listLine(car, ` (−${money(car.drop)})`));
  return {
    block: "drops",
    cars,
    photos: (await Promise.all(cars.map((car) => photosFor(car, 1)))).flat(),
    text: `📉 Подешевели за неделю\n\n${lines.join("\n")}\n\nЦены под ключ: с доставкой, растаможкой и сборами.\n${callToAction(network)}`,
  };
}

/** Блок 5. Машины костяка, появившиеся в каталоге последними. */
export async function freshArrivals({ models, network = "telegram", limit = 5 }) {
  const pairs = models.map(({ brand, model }) => [brand, model]);
  const { rows } = await pool.query(
    `select ${CAR_FIELDS} from listings l
     join vehicles v on v.id = l.vehicle_id
     where l.status = 'active' and l.estimated_total_usd > 0
       and (v.brand, v.model) in (${pairs.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ")})
       and exists (select 1 from listing_media m where m.listing_id = l.id)
     order by l.imported_at desc limit ${limit}`,
    pairs.flat(),
  );
  const cars = rows.map(shape).map(priced);
  if (!cars.length) return null;
  return {
    block: "fresh",
    cars,
    photos: (await Promise.all(cars.map((car) => photosFor(car, 1)))).flat(),
    text: `🆕 Только что появились в каталоге\n\n${cars.map((car) => listLine(car)).join("\n")}\n\nЦены под ключ.\n${callToAction(network)}`,
  };
}

/** Блок 6. Подборка под потолок цены: сначала модели костяка, потом остальные. */
export async function budgetPick({ models, capUsd, network = "telegram", limit = 5 }) {
  const pairs = models.map(({ brand, model }) => [brand, model]);
  const { rows } = await pool.query(
    `select distinct on (v.brand, v.model) ${CAR_FIELDS}
     from listings l join vehicles v on v.id = l.vehicle_id
     where l.status = 'active' and l.estimated_total_usd > 0 and l.estimated_total_usd <= $1
       and (v.brand, v.model) in (${pairs.map((_, i) => `($${i * 2 + 2}, $${i * 2 + 3})`).join(", ")})
       and exists (select 1 from listing_media m where m.listing_id = l.id)
     order by v.brand, v.model, l.estimated_total_usd`,
    [capUsd, ...pairs.flat()],
  );
  const cars = rows.map(shape).map(priced).sort((left, right) => right.totalUsd - left.totalUsd).slice(0, limit);
  if (!cars.length) return null;
  return {
    block: "budget",
    cars,
    photos: (await Promise.all(cars.map((car) => photosFor(car, 1)))).flat(),
    text: `💰 ${cars.length} машин до ${money(capUsd)} под ключ\n\n${cars.map((car) => listLine(car)).join("\n")}\n\nЦена под ключ — с доставкой, растаможкой и сборами, доплачивать сверху нечего.\n${callToAction(network)}`,
  };
}

/** Блок 7. Сравнение двух моделей: берём у каждой оптимальную машину. */
export async function modelDuel({ left, right, network = "telegram" }) {
  const pickBest = async ({ brand, model }) => {
    const cars = await modelListings(brand, model);
    if (!cars.length) return null;
    const medianYear = median(cars.map((car) => car.year));
    const medianMileage = median(cars.map((car) => car.mileage));
    const good = cars.filter((car) => car.year >= medianYear && car.mileage <= medianMileage);
    return good[0] || cars[0];
  };
  const [one, two] = await Promise.all([pickBest(left), pickBest(right)]);
  if (!one || !two) return null;

  const card = (car) => {
    const parts = [`${car.year} год`, `${number(car.mileage)} км`];
    if (car.battery) parts.push(`${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(car.battery)} кВт·ч`);
    if (car.range) parts.push(`${number(car.range)} км хода`);
    if (car.horsepower) parts.push(`${car.horsepower} л.с.`);
    return `${carTitle(car.brand, car.model, null)} — ${money(car.totalUsd)}\n  ${parts.join(" · ")} · №${carNumber(car)}`;
  };
  const gap = Math.abs(one.totalUsd - two.totalUsd);
  const cheaper = one.totalUsd <= two.totalUsd ? one : two;

  return {
    block: "duel",
    cars: [one, two],
    photos: [...(await photosFor(one, 2)), ...(await photosFor(two, 2))],
    text: `⚔️ ${carTitle(one.brand, one.model, null)} или ${carTitle(two.brand, two.model, null)}?\n\n1️⃣ ${card(one)}\n\n2️⃣ ${card(two)}\n\n💵 Разница ${money(gap)} в пользу ${carTitle(cheaper.brand, cheaper.model, null)}. Обе цены под ключ.\n\n❓ Что взяли бы вы — первую или вторую?\n${callToAction(network)}`,
  };
}

/**
 * Блок 8. Материал журнала.
 *
 * Текст берётся из заранее написанной выжимки (src/blog-social.js), ссылка
 * подставляется под сеть: в телеграме она прячется под словами, в Threads
 * кликается прямым адресом, а в Instagram ссылок нет вообще — там вместо
 * адреса отсылка к шапке профиля, иначе человек увидит некликабельный текст.
 */
export function blogPost({ slug, network = "telegram", site = "abcars.by" }) {
  const social = BLOG_SOCIAL[slug];
  if (!social) return null;
  const url = `https://${site}/blog/${slug}`;
  const link = network === "telegram" ? `🔗 <a href="${url}">Читать в журнале</a>`
    : network === "threads" ? `🔗 ${site}/blog/${slug}`
    : "🔗 Полный разбор в журнале — ссылка в шапке профиля";
  const tags = network === "instagram" && social.tags?.length
    ? `\n\n${["абкарс", "автоизкитая", ...social.tags].map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" ")}`
    : "";
  // У материала журнала свой призыв: звать проверять наличие машины неуместно,
  // когда речь о разборе правил или подборке.
  const invite = network === "telegram"
    ? "✍️ Вопросы — в личные сообщения, поможем посчитать под вашу машину"
    : "✍️ Вопросы — в Директ, поможем посчитать под вашу машину";
  const text = [`📰 ${social.title}`, "", ...social.body.flatMap((part) => [part, ""]), link, invite].join("\n");
  return { block: "blog", slug, cars: [], photos: [], text: `${text}${tags}` };
}

export const closeBlocks = () => pool.end();

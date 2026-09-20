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
// Источник недельного набора — живой production-каталог, а не локальная копия БД.
// Иначе уже проданная машина может остаться локально active и попасть в публикацию.
// Цену считаем заново по полям production API и всегда без квоты (15% пошлина).
import { carTitle } from "../../src/car-title.js";
import { estimateLandedCost, usdToByn } from "../../src/pricing.js";
import { BLOG_POSTS } from "../../src/blog-posts.js";
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
const CATALOG_ORIGIN = String(process.env.SOCIAL_CATALOG_ORIGIN || "https://abcars.by").replace(/\/$/, "");
const PAGE_SIZE = 100;
const liveModelCache = new Map();

// Призыв, которым заканчивается каждая запись. В телеграме это личные сообщения,
// в Instagram — Директ; слово выбирается по сети.
const callToAction = (network) =>
  network === "telegram" ? "✍️ Пишите в личные сообщения — проверим, на месте ли машина" : "✍️ Пишите в Директ — проверим, на месте ли машина";

export function shapeSocialCar(row) {
  // Калькулятор использует не только цену и год. Дата первой регистрации меняет
  // возрастную ставку, габариты и масса — стоимость автовоза, а тип топлива и
  // коробка отличают последовательный гибрид. Всё это лежит в source_payload.
  // Раньше соцсети получали урезанный объект и могли расходиться с каталогом на
  // несколько тысяч долларов.
  const raw = row.source_payload || {};
  const specs = row.specifications || {};
  return {
    ...raw,
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
    dimensions: specs.dimensions || raw.dimensions || null,
    curbWeight: Number(specs.curbWeight || raw.curbWeight) || null,
    city: row.city,
    source: row.source,
    firstRegistration: row.first_registration || raw.firstRegistration || null,
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
  return pickPhotos(car, { limit });
}

// До появления новых квот в 2027 году соцсети всегда показывают обычную цену
// с 15% пошлиной. Это намеренно не зависит от переключателя на сайте.
export const SOCIAL_QUOTA_OVER = true;
export const socialLandedPrice = (car) => estimateLandedCost(car, { quotaOver:SOCIAL_QUOTA_OVER });

const priced = (car) => {
  const totalUsd = socialLandedPrice(car).totalUsd;
  return { ...car, totalUsd, totalByn: usdToByn(totalUsd) };
};

export const isLiveAvailable = (car) =>
  car?.available !== false && car?.statusTone !== "red" && car?.status !== "Продано" && Array.isArray(car?.images) && car.images.length > 0;

const normalizeLiveCar = (car) => ({
  ...car,
  externalId:String(car.externalId || String(car.id || "").replace(/^che168-/, "")),
  range:Number(car.range ?? car.electricRange ?? car.combinedRange) || null,
  battery:Number(car.battery) || null,
  mileage:Number(car.mileage) || 0,
  year:Number(car.year) || 0,
  chinaPrice:Number(car.chinaPrice) || 0,
  usdPrice:Number(car.usdPrice ?? car.sourcePriceUsd) || null,
  previousPriceUsd:Number(car.previousPriceUsd) || null,
});

async function fetchLiveModel(brand, model) {
  const key = `${brand}\u0000${model}`;
  if (liveModelCache.has(key)) return liveModelCache.get(key);
  const request = (async () => {
    const cars = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const query = new URLSearchParams({ brand, model, sort:"price_asc", limit:String(PAGE_SIZE), offset:String(offset) });
      const response = await fetch(`${CATALOG_ORIGIN}/api/cars?${query}`, { signal:AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Каталог ${brand} ${model}: HTTP ${response.status}`);
      const page = await response.json();
      if (!Array.isArray(page.items)) throw new Error(`Каталог ${brand} ${model}: неверный ответ API`);
      cars.push(...page.items.filter(isLiveAvailable).map(normalizeLiveCar));
      if (!page.hasMore || !page.items.length) break;
    }
    return cars.map(priced).sort((left, right) =>
      left.totalUsd - right.totalUsd || String(left.externalId).localeCompare(String(right.externalId)));
  })();
  liveModelCache.set(key, request);
  try {
    return await request;
  } catch (error) {
    liveModelCache.delete(key);
    throw error;
  }
}

async function listingsForModels(models) {
  // Не открываем десятки соединений одновременно: production API — источник истины,
  // но недельный сборщик не должен создавать на нём всплеск нагрузки.
  const result = [];
  const queue = [...models];
  const workers = Array.from({ length:Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      result.push(...await fetchLiveModel(item.brand, item.model));
    }
  });
  await Promise.all(workers);
  return result;
}

// Машины одной модели: живые объявления с фотографиями и посчитанной ценой.
async function modelListings(brand, model) {
  return fetchLiveModel(brand, model);
}

// В списке одна модель встречается один раз: пять одинаковых Seagull подряд выглядят
// как сбой, даже когда по правилу отбора они и правда первые пять.
const oneCarPerModel = (cars) => {
  const seen = new Set();
  return cars.filter((car) => {
    const key = `${car.brand} ${car.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

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
  // Раньше здесь стояло сравнение с самой дешёвой машиной модели: сколько она стоит,
  // какой у неё пробег и сколько доплатить за эту. Сергей 17.09.2026 попросил убрать —
  // в ленте это читалось как оправдание цены. Осталась короткая строка о сути отбора.
  const compare = "⚖️ Оптимальное соотношение цены и состояния";
  const tail = asQuestion
    ? `\n❓ Как вам цена за такое состояние?\n${callToAction(network)}`
    : `\n${callToAction(network)}`;

  return { block: asQuestion ? "question" : "best-value", cars: [best], photos: await photosFor(best), text: `${body}\n${compare}${tail}` };
}

// Значок перед машиной в списке. Нумерация — там, где порядок что-то значит
// (подборка под бюджет читается как топ). В остальных списках маркер нейтральный:
// цифры там намекали бы на рейтинг, которого нет.
const NUMERALS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const PLAIN_MARK = "✔️";

// Общий вид строки в списке из нескольких машин. Номера машин здесь намеренно нет:
// в записи с несколькими машинами он превращает список в набор цифр, а найти нужную
// проще по марке и цене. Номер остаётся там, где машина одна.
const listLine = (car, index, { extra = "", numbered = false } = {}) =>
  `${numbered ? NUMERALS[index] || "•" : PLAIN_MARK} ${carTitle(car.brand, car.model, null)}, ${car.year} — ${money(car.totalUsd)}${extra}\n     ${number(car.mileage)} км`;

/** Блок 4. Машины костяка, у которых сильнее всего упала цена. */
export async function biggestDrops({ models, network = "telegram", limit = 5 }) {
  const listings = await listingsForModels(models);
  // previous_price_usd — прошлая цена у источника, а не под ключ. Чтобы показать
  // честное падение, старую цену прогоняем через тот же расчёт под ключ.
  const cars = oneCarPerModel(listings
    .map((car) => {
      const before = car.previousPriceUsd ? socialLandedPrice({ ...car, usdPrice: car.previousPriceUsd }).totalUsd : 0;
      return { ...car, drop: before - car.totalUsd };
    })
    .filter((car) => car.drop > 0)
    .sort((left, right) => right.drop - left.drop || String(left.externalId).localeCompare(String(right.externalId)))).slice(0, limit);
  if (!cars.length) return null;

  const lines = cars.map((car, index) => listLine(car, index, { extra: ` (−${money(car.drop)})` }));
  return {
    block: "drops",
    cars,
    photos: (await Promise.all(cars.map((car) => photosFor(car, 1)))).flat(),
    text: `📉 Подешевели за неделю\n\n${lines.join("\n")}\n\nЦены под ключ: с доставкой, растаможкой и сборами.\n${callToAction(network)}`,
  };
}

/** Блок 5. Машины костяка, появившиеся в каталоге последними. */
export async function freshArrivals({ models, network = "telegram", limit = 5 }) {
  const listings = await listingsForModels(models);
  const timestamp = (car) => new Date(car.firstSeenAt || car.importedAt || 0).getTime() || 0;
  const cars = oneCarPerModel(listings.sort((left, right) =>
    timestamp(right) - timestamp(left) || String(right.externalId).localeCompare(String(left.externalId)))).slice(0, limit);
  if (!cars.length) return null;
  return {
    block: "fresh",
    cars,
    photos: (await Promise.all(cars.map((car) => photosFor(car, 1)))).flat(),
    text: `🆕 Только что появились в каталоге\n\n${cars.map((car, index) => listLine(car, index)).join("\n")}\n\nЦены под ключ.\n${callToAction(network)}`,
  };
}

/** Блок 6. Подборка под потолок цены: сначала модели костяка, потом остальные. */
export async function budgetPick({ models, capUsd, network = "telegram", limit = 5 }) {
  const listings = await listingsForModels(models);
  // Потолок проверяем по свежему расчёту, а не по сохранённой цене из БД. Сначала
  // берём самую дешёвую актуальную машину каждой модели, затем показываем пять,
  // которые ближе всего к указанному бюджету.
  const cars = oneCarPerModel(listings
    .filter((car) => car.totalUsd <= capUsd)
    .sort((left, right) => left.totalUsd - right.totalUsd || String(left.externalId).localeCompare(String(right.externalId))))
    .sort((left, right) => right.totalUsd - left.totalUsd || String(left.externalId).localeCompare(String(right.externalId)))
    .slice(0, limit);
  if (!cars.length) return null;
  return {
    block: "budget",
    cars,
    photos: (await Promise.all(cars.map((car) => photosFor(car, 1)))).flat(),
    text: `💰 ${cars.length} машин до ${money(capUsd)} под ключ\n\n${cars.map((car, index) => listLine(car, index, { numbered: true })).join("\n")}\n\nЦена под ключ — с доставкой, растаможкой и сборами, доплачивать сверху нечего.\n${callToAction(network)}`,
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
    return `${carTitle(car.brand, car.model, null)} — ${money(car.totalUsd)}\n  ${parts.join(" · ")}`;
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
  // Заглавная картинка материала — та же, что в миниатюре журнала. Берём широкий
  // кадр 16:9: он проходит и по требованиям Instagram к пропорциям.
  const post = BLOG_POSTS.find((item) => item.slug === slug);
  const cover = post?.cover ? `https://${site}/blog/${slug}-hero.jpg` : "";
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
  return { block: "blog", slug, cars: [], cover, photos: cover ? [cover] : [], text: `${text}${tags}` };
}

export const closeBlocks = async () => {};

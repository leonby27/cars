// Фид каталога для Яндекса: `/feeds/yandex-cars.xml`.
//
// Зачем (AUDIT_2026-09-25-IM4CAR-GAPS.md, «Товарный фид»): блок с ценами в выдаче
// Яндекса («Может заинтересовать») занят чужими сайтами, а своего фида у нас не было.
// Тот же файл — основа для динамических объявлений Директа.
//
// Формат — «Транспортные средства» из справки Вебмастера (YML с наборами `sets`,
// образец Яндекса: https://edu.s3.yandex.net/sample/cars.yml):
//   - наборы (`sets`) — наши страницы марок и моделей: `/catalog/byd`, `/catalog/byd/seal`;
//   - подборки — предложения-страницы марок и моделей: цена «от» и число объявлений;
//   - отдельные машины — по одной на объявление, со ссылкой на карточку.
//
// Ограничение Яндекса — 30 000 предложений в файле, а машин у нас больше. Поэтому
// подборки идут все, а машины — по приоритету: сначала модели, отобранные Сергеем для
// соцсетей (CORE_MODELS в scripts/lib/social-blocks.mjs — один список на оба места),
// дальше модели по числу машин; внутри модели — от дешёвых к дорогим.
//
// Цена — итог до Минска (та же оценка, что в сортировке каталога), в белорусских
// рублях по курсу НБРБ из src/pricing.js. В фид попадают только машины, которые
// сверялись с источником недавно (`--fresh-days`, по умолчанию 7): предлагать
// в рекламе проданную машину хуже, чем не предлагать никакую.
//
// Запуск:
//   npm run feed                          # из базы, в dist/client/feeds/
//   node scripts/yandex-feed.mjs --db --out=/srv/abcars/dist/client/feeds/yandex-cars.xml
//   node scripts/yandex-feed.mjs --db --fresh-days=60   # старая локальная база
// Без `--db` и без SEO_CARS_FROM_DB=1 скрипт в базу не ходит и ничего не пишет —
// так он безопасно стоит в цепочке сборки на рабочей машине.
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { CATALOG_LANDINGS, brandLandingPath, modelLandingPath } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";
import { carTitle } from "../src/car-title.js";
import { usdToByn } from "../src/pricing.js";
import { COMPANY } from "../src/company-data.js";
import { socialPhotoHref } from "../src/photo-source.js";
import { fromPhrase } from "../src/origin.js";
import { CORE_MODELS } from "./lib/social-blocks.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const buildDir = process.env.ABCARS_BUILD_DIR || "dist";
const outPath = path.resolve(args.get("out") || path.join(root, buildDir, "client", "feeds", "yandex-cars.xml"));
const freshDays = Math.max(1, Number(args.get("fresh-days")) || 7);
// Лимит Яндекса на файл — 30 000 предложений; держим небольшой запас.
const offerLimit = Math.min(30_000, Math.max(100, Number(args.get("limit")) || 29_500));
const photosPerCar = 5;
const allowDb = args.has("db") || /^(1|true|yes)$/i.test(String(process.env.SEO_CARS_FROM_DB || ""));

if (!allowDb) {
  console.log("[feed] фид не собран: чтение базы не разрешено (--db или SEO_CARS_FROM_DB=1)");
  process.exit(0);
}

const { pool } = await import("../server/db.mjs");

const escapeXml = (value) => String(value ?? "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const number = (value) => new Intl.NumberFormat("ru-RU").format(Math.round(Number(value) || 0));
// Снимок в JPEG со своего домена: Яндекс в фидах ждёт JPEG или PNG, а кэш фото отдаёт
// тот же кадр и как .jpg (так же берут картинки соцсети, см. socialPhotoHref).
const photoUrl = (source) => socialPhotoHref(String(source || ""), { origin: siteUrl, width: 1080 }) || null;
const isoDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 19) : null;
};

// Значения, которые Яндекс понимает в параметрах транспорта (справка Вебмастера).
const FUEL = { "Электромобиль": "Электро", "Гибрид": "Гибрид" };
const fuelOf = (powertrain, fuelType) => FUEL[powertrain] || (/дизел/i.test(String(fuelType || "")) ? "Дизель" : "Бензин");
const GEARBOX = { "Автомат": "Автомат", "Робот": "Робот", "Вариатор": "Вариатор", "Механика": "Механика" };
const gearboxOf = (powertrain, gearbox) => GEARBOX[gearbox] || (powertrain === "Электромобиль" ? "Автомат" : null);
const DRIVE = new Set(["Передний", "Задний", "Полный"]);

// Категории — по кузову, как в образце Яндекса («Легковой автомобиль» → «Седан»).
const BODY_CATEGORIES = [
  ["SUV / кроссовер", "Внедорожник"], ["Седан", "Седан"], ["Хэтчбек", "Хэтчбек"], ["Лифтбек", "Лифтбек"],
  ["Минивэн", "Минивэн"], ["Универсал", "Универсал"], ["Купе", "Купе"], ["Кабриолет", "Кабриолет"], ["Пикап", "Пикап"],
];
const categoryOf = new Map(BODY_CATEGORIES.map(([body], index) => [body, index + 2]));

const coreKeys = new Set(CORE_MODELS.map((item) => `${item.brand}|${item.model}`));
const reviewByKey = new Map(MODEL_PAGES.map((page) => [`${page.brand}|${page.model}`, page]));
const modelName = (brand, model) => reviewByKey.get(`${brand}|${model}`)?.name || carTitle(brand, model);

const started = Date.now();
const { rows } = await pool.query(
  `SELECT l.id, l.mileage_km, l.estimated_total_usd, l.first_seen_at, l.last_seen_at,
     v.brand, v.model, v.model_year, v.powertrain, v.drivetrain, v.battery_kwh,
     v.specifications->>'bodyType' AS body_type,
     v.specifications->>'gearbox' AS gearbox,
     v.specifications->>'fuelType' AS fuel_type,
     NULLIF(v.specifications->>'engineVolume','') AS engine_volume,
     NULLIF(v.specifications->>'enginePower','') AS engine_power,
     l.source_payload->>'horsepower' AS horsepower,
     ARRAY(SELECT m.url FROM listing_media m WHERE m.listing_id = l.id ORDER BY m.position LIMIT ${photosPerCar}) AS photos
   FROM listings l JOIN vehicles v ON v.id = l.vehicle_id
   WHERE l.status = 'active' AND l.estimated_total_usd > 0 AND l.last_seen_at > now() - ($1 || ' days')::interval`,
  [String(freshDays)],
);
await pool.end();

// Машины по моделям: сколько их и от какой цены — для подборок и для порядка.
const byModel = new Map();
for (const row of rows) {
  if (!row.photos?.length) continue;
  const key = `${row.brand}|${row.model}`;
  if (!byModel.has(key)) byModel.set(key, []);
  byModel.get(key).push(row);
}
for (const list of byModel.values()) list.sort((left, right) => Number(left.estimated_total_usd) - Number(right.estimated_total_usd));

// Наборы и подборки: марка и модель. Модели без обзора и меньше чем с тремя машинами
// закрыты от индексации (src/model-landing.js) — их страницу в наборы не ставим, а
// машины таких моделей идут в набор марки.
const sets = [];
const collections = [];
const brandSetId = new Map();
const modelSetId = new Map();
const brands = new Map();
for (const [key, list] of byModel) {
  const brand = list[0].brand;
  if (!brands.has(brand)) brands.set(brand, []);
  brands.get(brand).push(...list);
}
let setNumber = 0;
for (const [brand, list] of [...brands].sort((left, right) => right[1].length - left[1].length)) {
  const path_ = brandLandingPath(brand);
  if (!path_) continue;
  const id = `s${++setNumber}`;
  brandSetId.set(brand, id);
  sets.push({ id, name: `${brand} ${fromPhrase()} в Беларусь`, url: `${siteUrl}${path_}` });
  const cheapest = list.reduce((best, row) => (!best || Number(row.estimated_total_usd) < Number(best.estimated_total_usd) ? row : best), null);
  collections.push({
    id: `brand-${path_.split("/").pop()}`,
    name: brand,
    vendor: brand,
    url: `${siteUrl}${path_}`,
    price: usdToByn(Number(cheapest.estimated_total_usd)),
    from: true,
    categoryId: 1,
    setIds: [id],
    pictures: [photoUrl(cheapest.photos[0])].filter(Boolean),
    description: `${brand} ${fromPhrase()} с доставкой в Беларусь: ${number(list.length)} авто в наличии, цены с доставкой до Минска`,
    params: [["Конверсия", 5], ["Число объявлений", list.length]],
  });
}
for (const [key, list] of [...byModel].sort((left, right) => right[1].length - left[1].length)) {
  const [brand, model] = key.split("|");
  const url = modelLandingPath(brand, model);
  if (!url || !brandSetId.has(brand)) continue;
  if (!reviewByKey.has(key) && list.length < 3) continue;
  const id = `s${++setNumber}`;
  modelSetId.set(key, id);
  const name = modelName(brand, model);
  sets.push({ id, name: `${name} ${fromPhrase()} в Беларусь`, url: `${siteUrl}${url}` });
  collections.push({
    id: `model-${url.split("/").slice(-2).join("-")}`,
    name,
    vendor: brand,
    url: `${siteUrl}${url}`,
    price: usdToByn(Number(list[0].estimated_total_usd)),
    from: true,
    categoryId: categoryOf.get(list[0].body_type) || 1,
    setIds: [brandSetId.get(brand)],
    pictures: list.slice(0, 3).map((row) => photoUrl(row.photos[0])).filter(Boolean),
    description: `${name} ${fromPhrase()} с доставкой в Беларусь: ${number(list.length)} авто в наличии`,
    params: [["Конверсия", coreKeys.has(key) ? 6 : 4], ["Число объявлений", list.length]],
  });
}

// Машины: сначала модели для соцсетей, дальше по числу машин.
const orderedModels = [...byModel].sort(([leftKey, left], [rightKey, right]) =>
  Number(coreKeys.has(rightKey)) - Number(coreKeys.has(leftKey)) || right.length - left.length || leftKey.localeCompare(rightKey));
const carBudget = Math.max(0, offerLimit - collections.length);
const cars = [];
let coreCars = 0;
for (const [key, list] of orderedModels) {
  if (!brandSetId.has(list[0].brand)) continue;
  for (const row of list) {
    if (cars.length >= carBudget) break;
    cars.push({ row, key });
    if (coreKeys.has(key)) coreCars += 1;
  }
  if (cars.length >= carBudget) break;
}

const carOffer = ({ row, key }) => {
  const number_ = String(row.id).replace(/^(che168|guazi|ch|gz)[-_]/i, "");
  const name = carTitle(row.brand, row.model, row.model_year);
  const priceByn = usdToByn(Number(row.estimated_total_usd));
  const power = Number(row.horsepower) || Number(row.engine_power) || null;
  const volume = Number(row.engine_volume) || null;
  const gearbox = gearboxOf(row.powertrain, row.gearbox);
  const params = [
    ["Конверсия", coreKeys.has(key) ? 3 : 1],
    ["Год создания", row.model_year || null],
    ["Пробег", Number(row.mileage_km) || 0],
    ["Топливо", fuelOf(row.powertrain, row.fuel_type)],
    ["Коробка передач", gearbox],
    ["Привод", DRIVE.has(row.drivetrain) ? row.drivetrain : null],
    ["Двигатель, л.с.", power ? Math.round(power) : null],
    ["Двигатель, литры", volume && row.powertrain !== "Электромобиль" ? volume.toFixed(1) : null],
    ["Батарея, кВт·ч", Number(row.battery_kwh) > 0 ? Number(row.battery_kwh) : null],
    ["Дата публикации", isoDate(row.first_seen_at)],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  return {
    id: `car-${number_}`,
    name: `${name}, ${number(row.mileage_km)} км`,
    vendor: row.brand,
    url: `${siteUrl}/cars/${encodeURIComponent(number_)}`,
    price: priceByn,
    from: false,
    categoryId: categoryOf.get(row.body_type) || 1,
    setIds: [modelSetId.get(key) || brandSetId.get(row.brand)].filter(Boolean),
    pictures: row.photos.map(photoUrl).filter(Boolean),
    description: `${name} ${fromPhrase()}: пробег ${number(row.mileage_km)} км, ${String(row.powertrain === "ДВС" ? "бензин" : row.powertrain || "").toLowerCase()}. Цена с доставкой до Минска ≈ ${number(priceByn)} BYN (≈ ${number(row.estimated_total_usd)} $): автомобиль, доставка, таможенные платежи и сборы. Проверка перед покупкой.`,
    params,
  };
};

const offerXml = (offer) => [
  `      <offer id="${escapeXml(offer.id)}">`,
  `        <name>${escapeXml(offer.name)}</name>`,
  `        <vendor>${escapeXml(offer.vendor)}</vendor>`,
  `        <url>${escapeXml(offer.url)}</url>`,
  `        <price${offer.from ? ' from="true"' : ""}>${Math.round(offer.price)}</price>`,
  "        <currencyId>BYN</currencyId>",
  `        <categoryId>${offer.categoryId}</categoryId>`,
  `        <set-ids>${offer.setIds.join(",")}</set-ids>`,
  ...offer.pictures.slice(0, 10).map((src) => `        <picture>${escapeXml(src)}</picture>`),
  `        <description>${escapeXml(offer.description)}</description>`,
  ...offer.params.map(([name, value]) => `        <param name="${escapeXml(name)}">${escapeXml(value)}</param>`),
  "      </offer>",
].join("\n");

const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
const xml = [
  '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
  `<yml_catalog date="${stamp}">`,
  "  <shop>",
  `    <name>abcars.by</name>`,
  `    <company>${escapeXml(COMPANY.schemaName || "abcars.by")}</company>`,
  `    <url>${escapeXml(siteUrl)}</url>`,
  COMPANY.email ? `    <email>${escapeXml(COMPANY.email)}</email>` : null,
  "    <currencies>",
  '      <currency id="BYN" rate="1" />',
  "    </currencies>",
  "    <categories>",
  '      <category id="1">Легковой автомобиль</category>',
  ...BODY_CATEGORIES.map(([, name], index) => `      <category id="${index + 2}" parentId="1">${escapeXml(name)}</category>`),
  "    </categories>",
  "    <sets>",
  ...sets.map((set) => `      <set id="${set.id}">\n        <name>${escapeXml(set.name)}</name>\n        <url>${escapeXml(set.url)}</url>\n      </set>`),
  "    </sets>",
  "    <offers>",
  ...collections.map(offerXml),
  ...cars.map((car) => offerXml(carOffer(car))),
  "    </offers>",
  "  </shop>",
  "</yml_catalog>",
  "",
].filter((line) => line !== null).join("\n");

// Запись через временный файл: робот не должен застать полуготовый фид. Сжатые копии
// — рядом, тем же именем: nginx отдаёт их сам (brotli_static), а устаревшая сжатая
// копия рядом со свежим файлом отдавала бы вчерашний фид.
mkdirSync(path.dirname(outPath), { recursive: true });
const writeAtomic = (file, data) => {
  const temp = `${file}.tmp-${process.pid}`;
  writeFileSync(temp, data);
  renameSync(temp, file);
};
writeAtomic(outPath, xml);
writeAtomic(`${outPath}.gz`, gzipSync(xml, { level: 9 }));
writeAtomic(`${outPath}.br`, brotliCompressSync(xml, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 9 } }));

const totalCars = [...byModel.values()].reduce((sum, list) => sum + list.length, 0);
console.log(`[feed] ${path.relative(root, outPath) || outPath}: ${collections.length} подборок (марки и модели), ${cars.length} машин из ${totalCars} свежих с фото (модели для соцсетей — ${coreCars}), ${sets.length} наборов; ${(Buffer.byteLength(xml) / 1_048_576).toFixed(1)} МБ, ${((Date.now() - started) / 1000).toFixed(1)} с`);

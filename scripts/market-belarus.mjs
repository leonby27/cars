#!/usr/bin/env node
/**
 * Цены белорусского рынка для страницы сравнения «в Беларуси или из Китая».
 *
 * Зачем. В карточке машины мы показываем цену под ключ до Минска, но человеку нужно
 * знать не её саму, а разницу: «такая же тут стоит 34 900, а привезти выходит 26 400».
 * Своих данных по белорусскому рынку у нас нет, и берутся они отсюда.
 *
 * Откуда. Площадка av.by: на ней и продаются китайские машины в Беларуси. Барахолка
 * Onliner для этого не годится — там 11 тысяч объявлений, и почти все это старые
 * европейские машины: по нашим маркам и годам совпадений почти нет.
 *
 * Почему запускается руками, а не по расписанию на сервере. av.by блокирует адреса
 * дата-центров: с нашего сервера его страницы не открываются вовсе. Работает только
 * с домашней сети, поэтому сбор запускает Сергей командой `npm run market`, а результат
 * попадает в репозиторий и уезжает на сайт обычной выкладкой. Цены на рынке за неделю
 * почти не двигаются, так что ручного обновления раз в неделю-две достаточно.
 *
 * Что сохраняем. Не чужие объявления, а только свод: по каждому набору «марка + модель
 * + год» — сколько предложений, середина цены и её разброс. Ни ссылок, ни телефонов,
 * ни фотографий с площадки мы не берём и не показываем.
 *
 * Как себя ведём. Одна страница в две секунды, повтор через полминуты при сбое, отказ
 * от марки после трёх неудач подряд. Площадка отвечает 468, если частить, — тогда сбор
 * останавливается сам и сохраняет то, что успел собрать.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_LANDINGS } from "../src/catalog-landings.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Файл лежит вне `public/`: в открытой папке его мог бы скачать кто угодно вместе
// с названием площадки, откуда он собран. Серверу и сборке он доступен с диска.
const outputPath = path.join(root, "data", "market-belarus.json");

// Машины старше этого года на сравнение не влияют: мы их не возим.
const YEAR_FROM = 2020;
// Сколько предложений должно быть в наборе, чтобы середина цены что-то значила.
const MIN_OFFERS = 3;
const PAGE_PAUSE_MS = 2000;
const RETRY_PAUSE_MS = 30000;

// Марки, которые на av.by называются иначе, чем у нас. Всё остальное сходится по
// названию без учёта регистра.
const BRAND_ALIASES = {
  NIO: "Nio",
  XPeng: "Xpeng",
  AITO: "Aito",
  AION: "Aion",
  Deepal: "Shenlan (Deepal)",
  "Great Wall": "Great Wall",
  "Lynk & Co": "Lynk & Co",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const headers = {
  // Обычный браузерный заголовок: площадка отдаёт страницу, собранную для человека,
  // и другого способа получить цены у неё нет.
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept-Language": "ru",
};

/** Данные страницы av.by: они лежат в теге с заготовкой для браузера. */
async function pageData(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("на странице нет данных");
  return JSON.parse(match[1]).props.initialState;
}

const filterUrl = (brandId, page) => {
  const params = new URLSearchParams();
  params.set("brands[0][brand]", String(brandId));
  params.set("price_currency", "2");
  params.set("year[min]", String(YEAR_FROM));
  if (page > 1) params.set("page", String(page));
  return `https://cars.av.by/filter?${params.toString()}`;
};

/** Объявление → только то, что нужно своду. */
function advertRow(advert) {
  const property = (name) => advert.properties?.find((item) => item.name === name)?.value ?? null;
  const usd = Number(advert.price?.usd?.amount) || null;
  if (!usd) return null;
  const year = Number(advert.metadata?.year || property("year")) || null;
  const model = property("model");
  if (!year || !model) return null;
  return {
    model: String(model),
    year,
    usd,
    // Пробег у новых машин не указан вовсе — это тоже сведение: сравнивать
    // трёхлетнюю машину из Китая с новой в салоне нельзя.
    mileage: Number(String(property("mileage_km") || "").replace(/\D/g, "")) || null,
    isNew: advert.metadata?.condition?.id === 5 || advert.specs?.state === "new",
  };
}

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

async function collectBrand(brandName, brandId) {
  const rows = [];
  let pages = 1;
  let failures = 0;
  for (let page = 1; page <= pages; page += 1) {
    try {
      const state = await pageData(filterUrl(brandId, page));
      const main = state.filter.main;
      pages = Math.min(main.pageCount || 1, 200);
      for (const advert of main.adverts || []) {
        const row = advertRow(advert);
        if (row) rows.push(row);
      }
      failures = 0;
    } catch (error) {
      failures += 1;
      process.stderr.write(`  ${brandName}, страница ${page}: ${error.message}\n`);
      if (failures >= 3) {
        process.stderr.write(`  ${brandName}: три сбоя подряд, марку пропускаем\n`);
        break;
      }
      await sleep(RETRY_PAUSE_MS);
      page -= 1;
      continue;
    }
    await sleep(PAGE_PAUSE_MS);
  }
  return rows;
}

/** Свод по наборам «модель + год» и по модели целиком. */
function summarize(rows) {
  const byBucket = new Map();
  const push = (key, row) => {
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(row);
  };
  for (const row of rows) {
    push(`${row.model}|${row.year}`, row);
    push(`${row.model}|`, row);
  }
  const out = {};
  for (const [key, list] of byBucket) {
    if (list.length < MIN_OFFERS) continue;
    const used = list.filter((row) => !row.isNew);
    // Новые машины в свод идут отдельной цифрой: сравнивать привезённую трёхлетку
    // с новой из салона нельзя, но знать, что новая рядом стоит столько-то, полезно.
    const prices = (used.length >= MIN_OFFERS ? used : list).map((row) => row.usd).sort((a, b) => a - b);
    out[key] = {
      count: used.length >= MIN_OFFERS ? used.length : list.length,
      onlyNew: used.length < MIN_OFFERS,
      median: median(prices),
      low: prices[Math.floor(prices.length * 0.1)],
      high: prices[Math.floor(prices.length * 0.9)] ?? prices.at(-1),
    };
  }
  return out;
}

// ── Сбор ─────────────────────────────────────────────────────────────────────
const ourBrands = [...new Set(CATALOG_LANDINGS.filter((landing) => landing.brand).map((landing) => landing.brand))];
process.stderr.write(`Марок в каталоге: ${ourBrands.length}\n`);

const dictionaryState = await pageData("https://cars.av.by/filter");
const options = dictionaryState.properties.main.propertyMap.brands.value[0].brand.options || [];
const byLabel = new Map(options.map((option) => [String(option.label).trim().toLowerCase(), option.intValue]));
process.stderr.write(`Марок в справочнике площадки: ${byLabel.size}\n`);

const resolved = [];
const unknown = [];
for (const brand of ourBrands) {
  const label = BRAND_ALIASES[brand] || brand;
  const id = byLabel.get(label.trim().toLowerCase());
  if (id) resolved.push([brand, id]);
  else unknown.push(brand);
}
if (unknown.length) process.stderr.write(`Нет на площадке: ${unknown.join(", ")}\n`);

const market = {};
let total = 0;
for (const [brand, id] of resolved) {
  const rows = await collectBrand(brand, id);
  const summary = summarize(rows);
  if (Object.keys(summary).length) market[brand] = summary;
  total += rows.length;
  process.stderr.write(`${brand}: ${rows.length} предложений, ${Object.keys(summary).length} наборов\n`);
}

writeFileSync(outputPath, JSON.stringify({
  source: "av.by",
  collectedAt: new Date().toISOString(),
  yearFrom: YEAR_FROM,
  minOffers: MIN_OFFERS,
  offers: total,
  brands: market,
}));
process.stderr.write(`\nГотово: ${total} предложений по ${Object.keys(market).length} маркам → ${path.relative(root, outputPath)}\n`);

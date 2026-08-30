// Сообщаем поисковикам об изменившихся адресах сразу, не дожидаясь обхода.
//
// Зачем: каталог живёт быстрее, чем робот успевает по нему ходить. За ночь
// появляются новые объявления, у сотен машин меняется цена, часть уходит с продажи —
// а поисковик узнаёт об этом, когда доберётся сам: у сайта больше ста тысяч адресов,
// и полный круг занимает недели. IndexNow — общий протокол Яндекса, Bing, Seznam и
// Naver: одним запросом мы передаём список изменившихся адресов, и они приходят за
// ними в первую очередь. Google в IndexNow не участвует — для него работает карта
// сайта с датами изменения.
//
// Как это устроено. На сайте лежит файл-ключ (`public/<ключ>.txt`, внутри тот же
// ключ) — так поисковик проверяет, что список прислал хозяин сайта, а не посторонний.
// Ключ не секрет: он публичный по замыслу протокола.
//
// Что отправляем:
//   1. Разделы каталога и обзоры моделей, которые за это время менялись, — их
//      немного (несколько тысяч), а вес у них наибольший.
//   2. Карточки машин, которые появились или изменились: цена, пробег, фотографии.
// Всё вместе режется потолком (по умолчанию 10 000 адресов за прогон) — столько
// протокол разрешает передать одним запросом, и больше поисковик за сутки от
// небольшого сайта всё равно не примет. Сначала страницы, потом машины: если места
// не хватит, отвалится хвост наименее важного.
//
// Usage:
//   npm run indexnow                 # отправить изменения за последние сутки
//   npm run indexnow -- --hours=6    # за последние шесть часов
//   npm run indexnow -- --dry-run    # ничего не отправлять, показать, что ушло бы
//   npm run indexnow -- --limit=2000 # свой потолок
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG_LANDINGS } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT = path.join(ROOT, "runtime", "indexnow-report.json");
// Ключ и одноимённый файл в `public/`. Меняя ключ здесь, положите рядом новый файл
// с таким же именем и содержимым — иначе поисковик отвергнет список целиком.
const KEY = process.env.INDEXNOW_KEY || "ff38d5a673f6f279c0f3e3037166aaa1";
const ENDPOINT = "https://api.indexnow.org/indexnow";
// Потолок протокола на один запрос. Он же наш потолок на прогон: слать больше
// смысла нет — поисковик всё равно берёт списки порциями.
const MAX_URLS = 10_000;

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = "true"] = arg.replace(/^--/, "").split("=");
  return [key, value];
}));
const dryRun = args.get("dry-run") === "true";
const hours = Number(args.get("hours") || 24);
const limit = Math.min(Number(args.get("limit") || MAX_URLS), MAX_URLS);
const siteUrl = String(process.env.SITE_URL || "https://abcars.by").replace(/\/+$/, "");
const host = new URL(siteUrl).hostname;
const keyLocation = `${siteUrl}/${KEY}.txt`;

const listingNumber = (value) => String(value ?? "").replace(/^(che168|guazi|ch|gz)[-_]/i, "");

const { pool } = await import("../server/db.mjs");

async function collect() {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();
  // Изменения за период: настоящая правка данных объявления или его появление.
  // `last_seen_at` не берём — она обновляется у всех проверенных машин, и список
  // раздулся бы до всего каталога, ничего не сообщая о содержании.
  const changedCars = await pool.query(
    `SELECT l.id FROM listings l
     WHERE l.status='active' AND GREATEST(COALESCE(l.content_changed_at, l.imported_at), l.first_seen_at) >= $1
     ORDER BY GREATEST(COALESCE(l.content_changed_at, l.imported_at), l.first_seen_at) DESC
     LIMIT $2`,
    [since, limit],
  );
  // Разделы и обзоры: у раздела дата — самое свежее изменение среди его машин.
  // Считаем одним проходом по трём осям, из которых собраны разделы (марка, кузов,
  // тип двигателя), и по паре «марка + модель» для обзоров — 163 отдельных запроса
  // здесь были бы дороже самого списка.
  const { rows } = await pool.query(
    `SELECT v.brand, v.model, v.powertrain, NULLIF(v.specifications->>'bodyType','') AS body_type,
       max(GREATEST(COALESCE(l.content_changed_at, l.imported_at), l.first_seen_at)) AS changed_at
     FROM listings l JOIN vehicles v ON v.id=l.vehicle_id
     WHERE l.status='active' GROUP BY 1,2,3,4`,
  );
  const fresh = (value) => value && new Date(value).toISOString() >= since;
  const brands = new Set();
  const bodies = new Set();
  const powertrains = new Set();
  const models = new Set();
  for (const row of rows) {
    if (!fresh(row.changed_at)) continue;
    if (row.brand) brands.add(row.brand);
    if (row.body_type) bodies.add(row.body_type);
    if (row.powertrain) powertrains.add(row.powertrain);
    if (row.brand && row.model) models.add(`${row.brand}|${row.model}`);
  }
  // Раздел попадает в список, если менялось хоть что-то из того, что он показывает.
  // Ценовые полосы и сочетания («электрические кроссоверы») привязаны к тем же осям,
  // поэтому им достаточно совпадения по любой из заданных.
  const sections = CATALOG_LANDINGS.filter((landing) => {
    if (landing.brand && !brands.has(landing.brand)) return false;
    if (landing.bodyType && !bodies.has(landing.bodyType)) return false;
    if (landing.powertrain && !powertrains.has(landing.powertrain)) return false;
    return Boolean(landing.brand || landing.bodyType || landing.powertrain || brands.size);
  }).map((landing) => `${siteUrl}${landing.path}`);
  const reviews = MODEL_PAGES.filter((page) => models.has(`${page.brand}|${page.model}`)).map((page) => `${siteUrl}${page.path}`);
  // Каталог целиком меняется вместе с любым разделом.
  const pages = [`${siteUrl}/catalog`, ...sections, ...reviews];
  const carUrls = changedCars.rows.map((row) => `${siteUrl}/cars/${encodeURIComponent(listingNumber(row.id))}`);
  return { pages, carUrls, urls: [...new Set([...pages, ...carUrls])].slice(0, limit) };
}

/** Файл-ключ должен лежать на сайте: без него поисковик отвергает весь список. */
async function keyIsPublished() {
  try {
    const response = await fetch(keyLocation, { redirect: "follow" });
    if (!response.ok) return false;
    return (await response.text()).trim() === KEY;
  } catch {
    return false;
  }
}

const { pages, carUrls, urls } = await collect();
await pool.end().catch(() => {});

if (!urls.length) {
  console.log(`IndexNow: за последние ${hours} ч изменений не нашлось — отправлять нечего.`);
  process.exit(0);
}

console.log(`IndexNow: страниц разделов и обзоров ${pages.length}, карточек машин ${carUrls.length}, отправляем ${urls.length} (потолок ${limit}).`);

if (dryRun) {
  console.log(urls.slice(0, 10).join("\n"));
  console.log(`… и ещё ${Math.max(0, urls.length - 10)}. Ничего не отправлено (--dry-run).`);
  process.exit(0);
}

if (!(await keyIsPublished())) {
  console.error(`IndexNow: файл-ключ ${keyLocation} не отвечает или его содержимое не совпадает с ключом — список не отправлен.`);
  process.exit(1);
}

const response = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: KEY, keyLocation, urlList: urls }),
});
const body = await response.text().catch(() => "");
const ok = response.status === 200 || response.status === 202;
await fs.mkdir(path.dirname(REPORT), { recursive: true });
await fs.writeFile(
  REPORT,
  `${JSON.stringify({ at: new Date().toISOString(), hours, sent: urls.length, pages: pages.length, cars: carUrls.length, status: response.status, ok }, null, 2)}\n`,
);
// Коды протокола: 200 — принято, 202 — принято, ключ ещё проверяется, 403 — ключ не
// подошёл, 422 — адреса не с этого домена, 429 — слишком часто.
console.log(`IndexNow: ответ ${response.status}${body ? ` (${body.slice(0, 200)})` : ""}.`);
process.exit(ok ? 0 : 1);

import { photoWarmUrls, warmPhoto } from "./lib/photo-warm.mjs";

// Прогревает свой кэш фотографий: заранее просит у сайта те снимки, которые
// посетитель увидит на первом экране, чтобы наш сервер успел забрать их у
// китайского хранилища до его прихода.
//
// Зачем: хранилище Che168 отвечает на первый запрос нового кадра 0,8–1,1 с, а с
// нашего диска тот же кадр уходит за 0,08 с (кэш настроен в
// snippets/abcars-photo-location.conf на сервере). Первый посетитель раньше ждал
// китайцев; теперь за него это делает ночная задача.
//
// Запуск: node scripts/warm-photos.mjs [--limit=1500] [--site=https://abcars.by]
//         [--concurrency=8] [--widths=original,600] [--all]
// С ключом --all берёт первый снимок каждой машины каталога прямо из базы, а не
// первые страницы через API. Это нужно из-за витрины главной: она показывает по
// одной случайной машине каждой модели, то есть в неё может попасть любая карточка
// каталога — прогреть «первые страницы» и накрыть главную нельзя. Первый полный
// проход после смены размеров качает у хранилища около 12 ГБ и идёт часов пять;
// последующие почти целиком уходят в нашу же копию и стоят считанные минуты.
// Новые машины без ожидания ночи:
// --recent-hours=48 --preview-count=5 --gallery-count=3 --concurrency=4
// По умолчанию полный проход по-прежнему готовит лишь обложки; новые машины
// получают также первые пять превью и три оригинала отдельной частой задачей.
// Ничего не пишет в базу: только читает каталог и заполняет кэш запросами картинок.
const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const site = String(arg("site", "https://abcars.by")).replace(/\/$/, "");
const limit = Math.max(1, Number(arg("limit", 1500)) || 1500);
const concurrency = Math.min(16, Math.max(1, Math.floor(Number(arg("concurrency", 8))) || 8));
// Размеры, в которых сайт показывает первый снимок машины. Держим их в согласии с
// IMAGE_WIDTH_* в src/App.jsx:
//   original — большое фото в карточке машины и в быстром просмотре (исходник продавца,
//              адрес без части «1400x0_c42_»; в среднем 71 КБ);
//   600      — превью списка на телефоне и компьютере.
// Греем оба размера: иначе часть посетителей ждала бы китайское хранилище по секунде.
const widths = String(arg("widths", "original,600"))
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => (value === "original" ? value : Number(value)))
  .filter((value) => value === "original" || (Number.isFinite(value) && value > 0));

const recentHours = Math.min(168, Math.max(0, Math.floor(Number(arg("recent-hours", 0))) || 0));
const previewCount = Math.min(5, Math.max(1, Math.floor(Number(arg("preview-count", 1))) || 1));
const galleryCount = Math.min(5, Math.max(1, Math.floor(Number(arg("gallery-count", 1))) || 1));
const everything = process.argv.includes("--all") || recentHours > 0;

// Списки в том же порядке, в каком их видит посетитель: витрина главной,
// первые страницы каталога и раздел «новинки».
const listUrls = everything ? [] : [`${site}/api/cars?limit=60&sort=variety`];
const pageSize = 100;
if (!everything) {
  for (let offset = 0; offset < limit; offset += pageSize) {
    listUrls.push(`${site}/api/cars?limit=${pageSize}&offset=${offset}`);
    if (offset < pageSize * 3) listUrls.push(`${site}/api/cars?limit=${pageSize}&offset=${offset}&sort=newest`);
  }
}

const headers = { accept: "application/json", "user-agent": "abcars-warm/1.0" };

const listCars = async (url) => {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} — HTTP ${response.status}`);
  const data = await response.json();
  return data.items || data.cars || [];
};

const photoPaths = (car) => photoWarmUrls(car, { site, widths, previewCount, galleryCount });
let listFailed = 0;

const wanted = new Set();
if (everything) {
  // «Новая» определяется появлением у нас, а не датой объявления продавца.
  // Перекрывающееся окно повторит запросы после сбоя. Только чтение базы.
  const { pool } = await import("../server/db.mjs");
  try {
    const { rows } = await pool.query(`SELECT photos.images
      FROM listings l
      CROSS JOIN LATERAL (SELECT array_agg(url ORDER BY position) AS images FROM
        (SELECT url, position FROM listing_media WHERE listing_id=l.id ORDER BY position LIMIT $1) m) photos
      WHERE l.status='active' AND ($2::int = 0 OR l.first_seen_at >= now() - make_interval(hours => $2::int))
      ORDER BY l.first_seen_at DESC`, [Math.max(previewCount, galleryCount), recentHours]);
    for (const row of rows) for (const photo of photoPaths(row)) wanted.add(photo);
  } finally {
    await pool.end();
  }
} else {
  for (const url of listUrls) {
    try {
      for (const car of await listCars(url)) for (const photo of photoPaths(car)) wanted.add(photo);
    } catch (error) {
      listFailed += 1;
      console.warn(`[warm] список пропущен: ${error.message}`);
    }
  }
}

const queue = [...wanted];
console.log(`[warm] снимков к проверке: ${queue.length}`);

let hit = 0;
let miss = 0;
let failed = 0;
let bytes = 0;

const total = queue.length;
let done = 0;
const worker = async () => {
  for (;;) {
    const url = queue[done];
    if (!url) return;
    done += 1;
    // Полный проход идёт часами: без отметок в журнале не видно, жив ли он.
    if (done % 5000 === 0) console.log(`[warm] ${done} из ${total}, добавлено ${miss}`);
    try {
      const result = await warmPhoto(url);
      bytes += result.bytes;
      if (result.hit) hit += 1;
      else miss += 1;
    } catch {
      failed += 1;
    }
  }
};

const started = Date.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const seconds = Math.round((Date.now() - started) / 1000);
console.log(
  `[warm] готово за ${seconds} с: было в кэше ${hit}, добавлено ${miss}, не отдалось ${failed}, скачано ${(bytes / 1024 / 1024).toFixed(1)} МБ`,
);

// systemd должен видеть неполный прогрев как сбой, а не успешный запуск.
if (failed || listFailed) process.exitCode = 1;

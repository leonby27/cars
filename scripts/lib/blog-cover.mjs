// Обложка материала журнала для соцсетей.
//
// В журнале обложка собирается по-разному, и здесь повторяется та же логика:
//
//  1. У тридцати материалов есть своя картинка, подобранная под тему, — берём её
//     в широком варианте (16:9), тот же кадр стоит в начале статьи.
//  2. У сравнения обложка на сайте — вёрстка из двух снимков со значком «vs».
//     Соцсетям нужен готовый файл, поэтому такую картинку мы собираем сами
//     (scripts/blog-duel-cover.py).
//  3. У остальных материалов обложка — первый кадр машины из их же выборки. Тот же
//     запрос к каталогу, что делает страница журнала, и тот же порядок, поэтому в
//     ленте окажется та же машина, что человек увидит, открыв материал.
//
// Кадры машин лежат в китайском хранилище, и туда дотягиваются все сети. А вот наши
// собственные файлы — своя картинка и собранная «vs» — уходят файлом (телеграм) или
// через хранилище GitHub (Threads и Instagram): до нашего сервера сети не достают.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { BLOG_POSTS, blogListParams } from "../../src/blog-posts.js";
import { socialPhotoHref } from "../../src/photo-source.js";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const duelScript = path.join(root, "scripts", "blog-duel-cover.py");
const jpegScript = path.join(root, "scripts", "photo-to-jpeg.py");
// Своё хранилище снимков: пять кадров каждой машины, сохранённых при импорте.
const MEDIA_ROOT = process.env.ABCARS_MEDIA_ROOT || "/srv/abcars-media";

/**
 * Кадр из нашего хранилища вместо похода в Китай.
 *
 * Китайское хранилище нашему серверу не отвечает (502 на живой кадр, который с
 * обычного домашнего интернета открывается). Посетителям сайта это незаметно —
 * снимки давно лежат у нас на диске, — и записям в соцсетях тоже незачем ходить
 * наружу: берём тот же файл локально и переводим из webp в обычный JPEG.
 */
async function localFrame(photoUrl, out) {
  const match = String(photoUrl).match(/\/escimg\/.+$/);
  if (!match) return "";
  // На диске кадры лежат в том размере, в каком их сохранил импорт.
  const stored = path.join(MEDIA_ROOT, "photo", match[0].replace(/\/\d+x\d+_(?:c\d+_)?(?=[^/]*$)/, "/600x0_c42_")) + ".webp";
  try {
    await fs.access(stored);
    await run("python3", [jpegScript, stored, out]);
    return out;
  } catch { return ""; }
}

// Китайское хранилище время от времени отвечает ошибкой на живой кадр: повторяем,
// а не оставляем запись без картинки.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url, file, { tries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (attempt) await wait(1500 * attempt);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`ответ ${response.status}`);
      await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
      return file;
    } catch (error) { lastError = error; }
  }
  throw new Error(`не скачалось: ${lastError?.message || "неизвестно"}`);
}

// Первые машины выборки — в том же порядке, в каком их показывает страница журнала.
async function pickCars(apiBase, query, count = 1) {
  const response = await fetch(`${apiBase}/api/cars?${query}`);
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload?.items || []).slice(0, count);
}

const firstCar = async (apiBase, query) => (await pickCars(apiBase, query, 1))[0] || null;

const carPhoto = (car) => socialPhotoHref(car?.images?.[0] || car?.image || "");

/**
 * Возвращает обложку для записи: либо ссылку (кадр машины из китайского хранилища),
 * либо путь к нашему файлу. Если обложки нет вовсе — null, и запись уйдёт текстом.
 */
export async function blogCover(slug, { site = "abcars.by", apiBase = "http://127.0.0.1:8787", log = console.log } = {}) {
  const post = BLOG_POSTS.find((item) => item.slug === slug);
  if (!post) return null;

  if (post.cover?.src) {
    const file = path.join(os.tmpdir(), `abcars-cover-${slug}.jpg`);
    try {
      await download(`https://${site}/blog/${slug}-hero.jpg`, file);
      return { kind: "file", file };
    } catch (error) {
      log(`своя обложка «${slug}» недоступна (${error.message})`);
      return null;
    }
  }

  if (post.kind === "duel" && post.sides?.length === 2) {
    const files = [];
    for (const [index, side] of post.sides.entries()) {
      const car = await firstCar(apiBase, `brand=${encodeURIComponent(side.brand)}&model=${encodeURIComponent(side.model)}&sort=default&limit=1`);
      const photo = carPhoto(car);
      if (!photo) { log(`для сравнения «${slug}» нет кадра ${side.name}`); return null; }
      const target = path.join(os.tmpdir(), `abcars-duel-${slug}-${index}.jpg`);
      const local = await localFrame(photo, target);
      files.push(local || await download(photo, target));
    }
    const out = path.join(os.tmpdir(), `abcars-duel-${slug}.jpg`);
    try {
      await run("python3", [duelScript, files[0], files[1], out]);
      await Promise.all(files.map((file) => fs.rm(file, { force: true })));
      return { kind: "file", file: out };
    } catch (error) {
      log(`обложку сравнения «${slug}» собрать не вышло: ${error.message}`);
      return null;
    }
  }

  const filters = post.filters || post.photos?.filters;
  if (!filters) return null;
  // Берём несколько машин подряд: если кадр первой не скачается, обложкой станет
  // следующая, а не пустое место.
  const cars = await pickCars(apiBase, String(blogListParams({ slug, filters }, 5)), 5);
  const photos = cars.map(carPhoto).filter(Boolean);
  if (!photos.length) return null;
  const photo = photos[0];
  // Кадр машины Meta берёт по ссылке, а телеграм одиночный снимок по ссылке брать
  // отказывается («failed to get HTTP URL content») — альбом умеет, а один кадр нет.
  // Поэтому его ещё и скачиваем: телеграму уйдёт файл.
  const file = path.join(os.tmpdir(), `abcars-cover-${slug}.jpg`);
  for (const candidate of photos) {
    const local = await localFrame(candidate, file);
    if (local) return { kind: "url", url: candidate, file: local };
    try {
      await download(candidate, file);
      return { kind: "url", url: candidate, file };
    } catch (error) {
      log(`кадр «${candidate.split("/").pop()}» не достать (${error.message}), беру следующий`);
    }
  }
  return { kind: "url", url: photo };
}

/** Прибрать за собой файлы, которые мы скачали или собрали. */
export const dropCover = async (cover) => {
  if (cover?.file) await fs.rm(cover.file, { force: true });
};

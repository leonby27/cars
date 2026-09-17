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

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`не скачалось: ответ ${response.status}`);
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

// Первая машина выборки — та же, что станет первой на странице материала.
async function firstCar(apiBase, query) {
  const response = await fetch(`${apiBase}/api/cars?${query}`);
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.items?.[0] || null;
}

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
      files.push(await download(photo, path.join(os.tmpdir(), `abcars-duel-${slug}-${index}.jpg`)));
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
  const car = await firstCar(apiBase, String(blogListParams({ slug, filters }, 1)));
  const photo = carPhoto(car);
  return photo ? { kind: "url", url: photo } : null;
}

/** Прибрать за собой файлы, которые мы скачали или собрали. */
export const dropCover = async (cover) => {
  if (cover?.kind === "file") await fs.rm(cover.file, { force: true });
};

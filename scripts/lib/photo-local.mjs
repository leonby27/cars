// Кадры для соцсетей — из нашего хранилища, а не из Китая.
//
// Почему так. Китайское хранилище нашему серверу не отвечает: на снимок, который с
// обычного интернета открывается, приходит 502. Сайту это не мешает — снимки лежат у
// нас на диске с момента импорта, — и записям в лентах незачем зависеть от чужой
// доступности. Берём тот же файл локально и переводим из webp в обычный JPEG: webp не
// принимает ни телеграм, ни Meta.
//
// Дальше готовый файл расходится по сетям: телеграму уходит файлом, в Threads и
// Instagram — через хранилище GitHub, потому что они умеют только по ссылке.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const jpegScript = path.join(root, "scripts", "photo-to-jpeg.py");

// Хранилище снимков: пять кадров каждой машины, сохранённых при импорте.
const MEDIA_ROOT = process.env.ABCARS_MEDIA_ROOT || "/srv/abcars-media";
// Размер, в котором кадры лежат на диске.
const STORED_PREFIX = "600x0_c42_";

/** Путь кадра на диске по его адресу у источника. Пусто, если такого файла нет. */
export async function storedFrame(photoUrl) {
  const match = String(photoUrl || "").match(/\/escimg\/.+$/);
  if (!match) return "";
  const stored = `${path.join(MEDIA_ROOT, "photo", match[0].replace(/\/\d+x\d+_(?:c\d+_)?(?=[^/]*$)/, `/${STORED_PREFIX}`))}.webp`;
  try {
    await fs.access(stored);
    return stored;
  } catch { return ""; }
}

/** Кадр с диска, переведённый в JPEG. Пусто, если кадра нет или перевод не удался. */
export async function localJpeg(photoUrl, out) {
  const stored = await storedFrame(photoUrl);
  if (!stored) return "";
  try {
    await run("python3", [jpegScript, stored, out]);
    return out;
  } catch { return ""; }
}

async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ответ ${response.status}`);
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

/**
 * Готовит кадры записи: сначала с диска, а если там кадра нет — пробует скачать
 * (это работает с ноутбука, где источник доступен). Кадры, которые не даются ни
 * оттуда, ни оттуда, просто пропускаются: запись выйдет с остальными.
 *
 * Возвращает список путей к файлам в том же порядке, в каком шли снимки.
 */
export async function prepareFrames(photos, { dir, prefix = "frame", log = console.log } = {}) {
  await fs.mkdir(dir, { recursive: true });
  const files = [];
  for (const [index, photo] of photos.entries()) {
    const out = path.join(dir, `${prefix}-${index + 1}.jpg`);
    const local = await localJpeg(photo, out);
    if (local) { files.push(local); continue; }
    try {
      files.push(await download(photo, out));
    } catch (error) {
      log(`кадр ${index + 1} не достать ни с диска, ни из источника (${error.message})`);
    }
  }
  return files;
}

/** Прибрать временные кадры. */
export const dropFrames = async (files) => {
  await Promise.all((files || []).map((file) => fs.rm(file, { force: true })));
};

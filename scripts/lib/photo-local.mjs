// Кадры для соцсетей: один и тот же квадрат для всех сетей.
//
// Что здесь происходит и почему.
//
// Форма. Instagram подгоняет всю галерею под пропорции первого снимка, поэтому
// разнокалиберные кадры он режет на свой вкус, а совсем неподходящие не берёт.
// Приводим каждый кадр к квадрату 1080×1080 сами (scripts/photo-to-social.py) —
// тогда ни обрезки, ни отказов, и у оформления всегда одни и те же координаты.
//
// Откуда берём исходник. Снимки лежат у нас на диске с момента импорта, но всего
// 600 точек в ширину — для ленты мало, квадрат пришлось бы растягивать. У источника
// тот же кадр есть крупнее, и с сервера он снова открывается (17.09.2026 оттуда
// приходил 502, сейчас нет), поэтому сначала идём туда, а диск остаётся запасным
// вариантом: запись выйдет даже когда источник молчит.
//
// Формат. И телеграм, и Meta принимают только JPEG, webp не берёт никто — перевод
// делает тот же скрипт, что и квадрат.
//
// Дальше готовый файл расходится по сетям: телеграму уходит файлом, в Threads и
// Instagram — через хранилище GitHub, потому что они умеют только по ссылке.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { socialPhotoHref } from "../../src/photo-source.js";

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const jpegScript = path.join(root, "scripts", "photo-to-jpeg.py");
const socialScript = path.join(root, "scripts", "photo-to-social.py");

// Хранилище снимков: пять кадров каждой машины, сохранённых при импорте.
const MEDIA_ROOT = process.env.ABCARS_MEDIA_ROOT || "/srv/abcars-media";
// Размер, в котором кадры лежат на диске.
const STORED_PREFIX = "600x0_c42_";
// Сторона квадрата: столько показывают ленты, больше 1440 Instagram не принимает.
export const FRAME_SIDE = 1080;
// Формы кадра, которые умеет собирать photo-to-social.py: квадрат (умолчание) и
// вертикальный 4:5 — самый узкий, который сейчас принимает публикация в ленту.
export const FRAME_SHAPES = Object.freeze({ square:[1080, 1080], vertical:[1080, 1350] });
// Ширина, которую просим у источника. Если оригинал меньше — придёт оригинал.
const SOURCE_WIDTH = 1440;
// Источник отвечает не всегда; ждать дольше незачем — на диске лежит запасной кадр.
const SOURCE_TIMEOUT_MS = 20_000;

/**
 * Путь кадра на диске по его адресу у источника. Пусто, если такого файла нет.
 *
 * Адреса из карточки приходят уже с «.webp» на конце, а на диске имя ровно такое
 * же — второй раз это окончание дописывать нельзя, иначе файл не находится
 * никогда и кадры молча едут в обход диска.
 */
export async function storedFrame(photoUrl) {
  const match = String(photoUrl || "").match(/\/escimg\/.+$/);
  if (!match) return "";
  const named = match[0].replace(/\/\d+x\d+_(?:c\d+_)?(?=[^/]*$)/, `/${STORED_PREFIX}`);
  const stored = path.join(MEDIA_ROOT, "photo", named.endsWith(".webp") ? named : `${named}.webp`);
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
  const response = await fetch(url, { signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`ответ ${response.status}`);
  await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

/**
 * Самый крупный доступный исходник кадра: сначала источник, потом наш диск, потом
 * адрес как он есть. Возвращает путь к файлу или пусто, если не вышло нигде.
 */
export async function bestSource(photoUrl, raw, { log = console.log } = {}) {
  const wide = socialPhotoHref(photoUrl, { width: SOURCE_WIDTH });
  if (wide) {
    try { return await download(wide, raw); }
    catch (error) { log(`источник не отдал крупный кадр (${error.message}) — беру с диска`); }
  }
  const stored = await storedFrame(photoUrl);
  if (stored) return stored;
  try { return await download(photoUrl, raw); } catch { return ""; }
}

/**
 * Готовит кадры записи: каждый приводится к своей форме (квадрат или вертикальная
 * 4:5, см. FRAME_SHAPES) в JPEG.
 *
 * Режим «crop» (по умолчанию) режет снимок по бокам: плотнее и без полос — так
 * выбрано 17.09.2026. «fit» вписывает снимок целиком и дорисовывает полосы фона.
 * Кадры, которых нет ни у источника, ни на диске, пропускаются: запись выйдет с
 * остальными.
 *
 * Возвращает список путей к файлам в том же порядке, в каком шли снимки.
 */
export async function prepareFrames(photos, { dir, prefix = "frame", mode = "crop", shape = "square", log = console.log } = {}) {
  await fs.mkdir(dir, { recursive: true });
  const files = [];
  for (const [index, photo] of photos.entries()) {
    const out = path.join(dir, `${prefix}-${index + 1}.jpg`);
    const raw = `${out}.raw`;
    const source = await bestSource(photo, raw, { log });
    if (!source) {
      log(`кадр ${index + 1} не достать ни из источника, ни с диска`);
      continue;
    }
    try {
      await run("python3", [socialScript, source, out, mode, shape]);
      files.push(out);
    } catch (error) {
      log(`кадр ${index + 1} не привести к нужной форме (${String(error.message).slice(0, 120)})`);
    }
    await fs.rm(raw, { force: true });
  }
  return files;
}

/** Прибрать временные кадры. */
export const dropFrames = async (files) => {
  await Promise.all((files || []).flatMap((file) => [fs.rm(file, { force: true }), fs.rm(`${file}.raw`, { force: true })]));
};

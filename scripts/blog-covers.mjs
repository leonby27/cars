// Свои картинки для материалов журнала.
//
// Сергей присылает папку с файлами, названными по номерам тем из BLOG_TOPICS.md
// («17.jpg» — семнадцатая строка таблицы). Скрипт сам находит, какому материалу
// соответствует номер, режет картинку под два места, где она показывается, и
// раскладывает по public/blog.
//
// Два размера и два соотношения — потому что места разные: на карточке в журнале
// обложка 16:10, в самой статье первый кадр 16:9. Резать заранее, а не полагаться
// на браузер: так в файле ровно те точки, которые видно, и вес меньше.
//
// Формат один — jpeg. Пробовали avif: он вдвое легче, но системный кодировщик пишет
// его так, что часть браузеров показывает пустую рамку вместо картинки, а запасной
// вариант в этом случае не подставляется. Webp системными средствами не собрать,
// а тянуть ради картинок отдельную библиотеку — ломать выкладку. Размер кадра
// подогнан точно под место показа, поэтому и обычный jpeg выходит лёгким.
//
// Запуск: node scripts/blog-covers.mjs [папка]
// По умолчанию берётся ~/Downloads/Картинки.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { findPostByTopic } from "./blog-topic-post.mjs";

const SOURCE_DIR = process.argv[2] || path.join(os.homedir(), "Downloads", "Картинки");
const OUT_DIR = new URL("../public/blog/", import.meta.url);
// Ширина и соотношение сторон для каждого места: карточка в журнале и кадр в статье.
const TARGETS = [
  { name: "card", width: 600, ratio: 16 / 10 },
  { name: "hero", width: 1200, ratio: 16 / 9 },
];
/**
 * Постоянный номер темы → материал. Номер стоит в первой колонке BLOG_TOPICS.md и
 * закреплён за темой навсегда, поэтому присланная «17.jpg» попадает туда, куда
 * задумано, даже если расписание с тех пор пересобирали.
 */
function scheduleByNumber() {
  const rows = fs
    .readFileSync(new URL("../BLOG_TOPICS.md", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => /^\| *\d+ \|/.test(line))
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      return { number: Number(cells[1]), topic: cells[2] };
    });
  const found = new Map();
  for (const row of rows) {
    const post = findPostByTopic(row.topic);
    if (post) found.set(row.number, post);
  }
  return found;
}

const size = (file) => {
  const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", file], { encoding: "utf8" });
  const width = Number(output.match(/pixelWidth: (\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight: (\d+)/)?.[1]);
  return { width, height };
};

/**
 * Кадрирование по центру без полей. Сначала подгоняем ту сторону, которой не хватает,
 * потом срезаем лишнее: если сразу резать, sips дорисовывает поля фоном.
 */
/**
 * Убираем из jpeg служебные блоки: съёмочные данные, имя автора, координаты. Они
 * весят до сотни килобайт на файл и уезжают в открытый доступ вместе с картинкой.
 * Чистим до перегона в avif — иначе sips перенесёт их и туда.
 */
function stripMetadata(file) {
  const data = fs.readFileSync(file);
  const out = [data.subarray(0, 2)];
  let at = 2;
  while (at < data.length - 1 && data[at] === 0xff) {
    const marker = data[at + 1];
    // Начало сжатых данных — дальше идёт картинка, её не трогаем.
    if (marker === 0xda) break;
    const length = data.readUInt16BE(at + 2);
    // APP1…APP15 — это Exif, XMP и прочие подписи; APP0 (JFIF) оставляем.
    const junk = marker >= 0xe1 && marker <= 0xef;
    if (!junk) out.push(data.subarray(at, at + 2 + length));
    at += 2 + length;
  }
  out.push(data.subarray(at));
  fs.writeFileSync(file, Buffer.concat(out));
}

function crop(source, target, width, ratio) {
  const origin = size(source);
  // Не растягиваем: если исходник мельче нужного, берём столько, сколько в нём есть.
  const fit = Math.min(1, origin.width / width, origin.height / (width / ratio));
  const boxWidth = Math.round(width * fit);
  const boxHeight = Math.round(boxWidth / ratio);
  // Сначала подгоняем ту сторону, которой не хватает, потом срезаем лишнее: если
  // резать сразу, sips дорисовывает поля фоном.
  const wide = origin.width / origin.height > ratio;
  execFileSync("sips", [
    "-s", "format", "jpeg", "-s", "formatOptions", "68",
    ...(wide ? ["--resampleHeight", String(boxHeight)] : ["--resampleWidth", String(boxWidth)]),
    "-c", String(boxHeight), String(boxWidth),
    source, "--out", target,
  ], { stdio: "ignore" });
  stripMetadata(target);
  return size(target);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const schedule = scheduleByNumber();
// Один номер — одна картинка. Если на номер лежит несколько файлов (прислали замену,
// а старый остался), берём последний по времени: замена и есть то, что нужно.
const files = [
  ...fs
    .readdirSync(SOURCE_DIR)
    .filter((name) => /^\d+\.(jpe?g|png|webp)$/i.test(name))
    .map((name) => ({ name, number: Number.parseInt(name, 10), time: fs.statSync(path.join(SOURCE_DIR, name)).mtimeMs }))
    .sort((a, b) => a.time - b.time)
    .reduce((chosen, file) => chosen.set(file.number, file), new Map())
    .values(),
].sort((a, b) => a.number - b.number);
const done = [];
for (const { name, number } of files) {
  const post = schedule.get(number);
  if (!post) {
    console.log(`№${number}: темы с таким номером в расписании нет, пропускаю`);
    continue;
  }
  const sizes = TARGETS.map((target) =>
    crop(path.join(SOURCE_DIR, name), path.join(OUT_DIR.pathname, `${post.slug}-${target.name}.jpg`), target.width, target.ratio),
  );
  done.push(`№${number} → ${post.slug} (${sizes.map((item) => `${item.width}×${item.height}`).join(", ")})`);
}
console.log(done.join("\n"));
console.log(`\nГотово: ${done.length} картинок в public/blog`);

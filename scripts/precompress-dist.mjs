// Заранее сжимает готовую сборку в brotli максимального уровня.
//
// Зачем: nginx на сервере сжимает ответы на лету уровнем 6 — сильнее нельзя, иначе
// на каждый запрос уходило бы слишком много процессорного времени. Но в его настройках
// включён `brotli_static on`: если рядом с файлом лежит такой же с суффиксом `.br`,
// nginx отдаёт готовый и ничего не считает. Значит сжать один раз при сборке можно
// самым сильным уровнем 11 — посетитель получит те же файлы, но меньше на десятую
// часть. Замер 28.08.2026: главный скрипт 271 → 243 КБ, файл стилей 38 → 33 КБ,
// вся сборка 1,4 → 1,3 МБ. На медленной мобильной сети это около 160 мс.
//
// Запуск: node scripts/precompress-dist.mjs [--dir=dist/client]
// Стоит последним шагом в `npm run build`: сжимать нужно то, что уже сложили все
// предыдущие шаги, включая заранее собранные страницы разделов и обзоров.
import { constants, brotliCompress, brotliDecompressSync } from "node:zlib";
import { promisify } from "node:util";
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import { join, extname, relative } from "node:path";

const compress = promisify(brotliCompress);

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const root = arg("dir", "dist/client");
// Прошлая сборка: выкладка на сервере сохраняет её в dist.prev до пересборки. Если
// файл не изменился с прошлого раза, его сжатую копию берём оттуда готовой — между
// выкладками без смены данных не меняется почти ничего, а распаковать для сравнения
// в разы дешевле, чем сжать уровнем 11 заново. Локально dist.prev нет — жмём всё.
const previousRoot = arg("previous", "dist.prev/client");
// Только то, что сжимается с толком. Фотографии, шрифты woff2 и картинки png/jpg/webp
// уже сжаты внутри себя — второй проход дал бы проценты при заметном размере на диске.
const compressible = new Set([".css", ".js", ".mjs", ".svg", ".json", ".xml", ".txt", ".html"]);
// Ниже килобайта выигрыш меньше накладных расходов — те же границы, что у nginx
// (`brotli_min_length 1024`), иначе мы бы плодили файлы, которые он не станет отдавать.
const minBytes = 1024;

let compressed = 0;
let reused = 0;
let removed = 0;
let rawBytes = 0;
let brBytes = 0;

const jobs = [];
const collect = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collect(path);
      continue;
    }
    if (!entry.isFile()) continue;
    // Осиротевшие `.br` от прежних сборок: nginx отдал бы устаревшее содержимое,
    // поэтому такие файлы убираем.
    if (entry.name.endsWith(".br")) {
      const source = path.slice(0, -3);
      try {
        statSync(source);
      } catch {
        unlinkSync(path);
        removed += 1;
      }
      continue;
    }
    if (!compressible.has(extname(entry.name))) continue;
    jobs.push(path);
  }
};

const previousPacked = (path, raw) => {
  const candidate = join(previousRoot, `${relative(root, path)}.br`);
  if (!existsSync(candidate)) return null;
  try {
    const packed = readFileSync(candidate);
    return brotliDecompressSync(packed).equals(raw) ? packed : null;
  } catch {
    return null;
  }
};

const handle = async (path) => {
  const raw = readFileSync(path);
  if (raw.length < minBytes) return;
  const ready = previousPacked(path, raw);
  const packed =
    ready ||
    (await compress(raw, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    }));
  // Если сжатие не помогло (бывает у уже упакованных данных) — файла не создаём,
  // иначе nginx отдавал бы версию тяжелее исходной.
  if (packed.length >= raw.length) return;
  writeFileSync(`${path}.br`, packed);
  if (ready) reused += 1;
  else compressed += 1;
  rawBytes += raw.length;
  brBytes += packed.length;
};

collect(root);
// Четыре файла одновременно: сжатие идёт в пуле потоков Node и на двух ядрах сервера
// загружает их полностью, а больший параллелизм только плодит очередь.
{
  const queue = [...jobs];
  const worker = async () => {
    for (let path = queue.shift(); path; path = queue.shift()) await handle(path);
  };
  await Promise.all(Array.from({ length: 4 }, worker));
}

const mb = (value) => (value / 1024 / 1024).toFixed(2);
console.log(
  `[precompress] сжато: ${compressed}, взято готовыми из прошлой сборки: ${reused}, удалено устаревших: ${removed}; ` +
    `${mb(rawBytes)} МБ → ${mb(brBytes)} МБ`,
);

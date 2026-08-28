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
import { constants, brotliCompressSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const root = arg("dir", "dist/client");
// Только то, что сжимается с толком. Фотографии, шрифты woff2 и картинки png/jpg/webp
// уже сжаты внутри себя — второй проход дал бы проценты при заметном размере на диске.
const compressible = new Set([".css", ".js", ".mjs", ".svg", ".json", ".xml", ".txt", ".html"]);
// Ниже килобайта выигрыш меньше накладных расходов — те же границы, что у nginx
// (`brotli_min_length 1024`), иначе мы бы плодили файлы, которые он не станет отдавать.
const minBytes = 1024;

let compressed = 0;
let removed = 0;
let rawBytes = 0;
let brBytes = 0;

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path);
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
    const raw = readFileSync(path);
    if (raw.length < minBytes) continue;
    const packed = brotliCompressSync(raw, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
      },
    });
    // Если сжатие не помогло (бывает у уже упакованных данных) — файла не создаём,
    // иначе nginx отдавал бы версию тяжелее исходной.
    if (packed.length >= raw.length) continue;
    writeFileSync(`${path}.br`, packed);
    compressed += 1;
    rawBytes += raw.length;
    brBytes += packed.length;
  }
};

walk(root);

const mb = (value) => (value / 1024 / 1024).toFixed(2);
console.log(
  `[precompress] сжато файлов: ${compressed}, удалено устаревших: ${removed}; ` +
    `${mb(rawBytes)} МБ → ${mb(brBytes)} МБ`,
);

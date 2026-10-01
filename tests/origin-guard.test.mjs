import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Сторож правила 29.09.2026: слово «Китай» в шаблонах не пишется строкой — только через
// src/origin.js (общие страницы говорят «из Китая и Кореи», машина — свою страну).
// Тест ходит по коду и падает, если где-то снова появилось «из Китая» или «в Китае»
// вне разрешённых мест. Комментарии не считаются. Список исключений — с причиной.

const ROOT = new URL("../", import.meta.url);
const SCAN = ["src", "server", "scripts"];
// Файлы и папки, где страна — предмет текста, а не шаблон.
const ALLOWED = [
  "src/model-texts/", // тексты обзоров: факты о китайских версиях
  "src/markets/ru-blog/", // Russian editions of country-specific articles
  "src/markets/ru-editorial.js", // Country-specific editorial metadata
  "src/markets/ru-tool-texts.js", // Delivery and brand directory copy
  "src/blog-texts/", // статьи журнала
  "src/china-brands.js", // справочник китайских марок
  "src/city-names.js", // китайские города
  "src/china-logistics.js", // маршрут Хоргос → Минск
  "src/korea-logistics.js", // маршрут Пусан → Минск
  "src/origin.js", // сам справочник фраз
  "src/seo-keywords.js", // список поисковых запросов для отчёта о позициях
  "src/spec-translations.js", // «Китай VI», Tesla (Китай) — переводы характеристик
  "src/brand-guide.js", // факты о сборке марок в Китае
  "src/model-pages.js", // lead/teaser/tagline обзоров — факты о китайских версиях
  "src/blog-posts.js", // статьи о китайском рынке («Mercedes из Китая»)
  "src/catalog-landings.js", // пояснения (notes) разделов — факты; заголовки идут через siteWording
  "src/tool-page-texts.js", // /delivery-cost и /china-brands — про Китай
  "src/ev-duty-copy.js", // правила замены старых фраз
  "src/ev-duty-copy-blog.js",
  "src/social-themes.js", // подписи к конкретным статьям
  "src/blog-social.js",
  "src/pricing.js", // подписи профиля логистики Китая («Автомобиль в Китае»)
  "src/delivery-estimate.js", // строки калькулятора доставки по Китаю
  "src/tool-pages.js", // таблицы этапов доставки из Китая и /china-brands
  "src/landing-faq.js", // вопросы страницы страны /catalog/china
  "src/purchase-info.js", // ответы FAQ с фактами о китайском рынке
  "src/market-compare.js", // сноска про длиннобазные версии
  "src/range-estimate.js", // цикл CLTC
  "src/search-dictionary.js",
  "src/search-query.js",
  "src/info-pages-seo.js", // проверяется отдельно: строит фразы через origin.js
  "server/seo-render.mjs", // «В Китае эта модель называется…» (chineseModelName)
  "server/price-rating.mjs",
  "scripts/lib/", // импорт Che168/Guazi: логи и разбор китайских страниц
  "scripts/refresh-che168.mjs",
  "scripts/import-",
  "scripts/guazi-",
  "scripts/telegram-commands.mjs",
  "scripts/night-watch.mjs",
  "scripts/social-",
  "scripts/market-belarus",
  "scripts/generate-seo-pages.mjs", // /china-brands и /price-belarus
  "scripts/blog-",
  "scripts/prepare-social",
  "scripts/nav-",
  "scripts/page-walk",
  "scripts/source-probe",
  "scripts/db-",
  "scripts/fix-",
  "scripts/backfill-",
  "scripts/deduplicate-",
  "scripts/watch-",
  "scripts/publish-",
  "scripts/store-",
  "scripts/cleanup-",
  "scripts/warm-",
  "scripts/capture-",
  "scripts/repair-",
  "scripts/snapshot-",
  "scripts/sync-",
  "scripts/update-",
  "scripts/ev-quota",
  "scripts/indexnow",
  "scripts/vite-",
  "scripts/split-css",
  "scripts/precompress",
  "scripts/clean-dist",
  "scripts/prerender-home",
  "scripts/yandex-feed.mjs",
];

const PATTERN = /(из|в)(\s| )Кита[яе](?!(\s| )и(\s| ))/;

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(js|jsx|mjs)$/.test(name)) files.push(path);
  }
};
for (const dir of SCAN) walk(new URL(dir, ROOT).pathname);

const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("«из Китая» и «в Китае» не пишутся строкой вне разрешённых мест", () => {
  const rootPath = ROOT.pathname;
  const offenders = [];
  for (const file of files) {
    const relative = file.slice(rootPath.length);
    if (ALLOWED.some((prefix) => relative.startsWith(prefix))) continue;
    const code = stripComments(readFileSync(file, "utf8"));
    const lines = code.split("\n");
    lines.forEach((line, index) => {
      if (PATTERN.test(line)) offenders.push(`${relative}:${index + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, [], `страна вписана строкой:\n${offenders.join("\n")}`);
});

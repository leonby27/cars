// Делит собранный файл стилей на две части: срочную (её сборка встраивает прямо
// в страницу) и остальную (грузится сразу после первой отрисовки, ничего не блокируя).
//
// Зачем. Файл стилей один на весь сайт — 258 КБ, 33 КБ в сжатом виде. Браузер обязан
// скачать и разобрать его целиком, прежде чем нарисует хоть что-нибудь: по отчёту
// PageSpeed от 28.08.2026 это 370–560 мс на медленной мобильной сети, при том что
// главной странице нужна четверть правил. Встроенная в страницу срочная часть убирает
// этот поход в сеть совсем: страница приходит уже со своим оформлением.
//
// Как делим. Списки классов, которые есть в разметке ключевых страниц сразу после
// загрузки, лежат в config/critical-classes.json (как они собраны — в комментарии
// внутри). Правило считается срочным, если в его селекторе нет классов вовсе (теги,
// :root, html/body — это каркас) или хотя бы один класс из списка. Иначе правило
// применяется только к элементам, которых на ключевых страницах нет, и его можно
// подождать.
//
// Почему такое деление не путает порядок правил. Порядок важен, когда два правила
// одинаковой силы спорят за одно свойство одного элемента, и побеждает то, что ниже.
// В остальную часть правило уходит только когда все его классы неизвестны ключевым
// страницам — то есть спорить с срочными правилами ему не о чем: они относятся к
// разным элементам. Правила про один и тот же класс всегда попадают в одну часть
// вместе, потому что судьбу решает класс, а не место в файле.
//
// Что будет, если класс забыли внести в список. Правило уедет в остальную часть и
// приедет на пару сотен миллисекунд позже — блок мигнёт неоформленным, но не сломается.
// Поэтому список — не критичная деталь, а настройка скорости.
//
// Запуск: node scripts/split-css.mjs [--dir=dist/client]
// Стоит в `npm run build` сразу после `vite build`: генератор страниц ниже по цепочке
// берёт готовую заготовку `index.html` и разносит её по всем собранным страницам.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const clientDir = arg("dir", "dist/client");
const assetsDir = join(clientDir, "assets");
const indexPath = join(clientDir, "index.html");

const criticalClasses = new Set();
{
  const config = JSON.parse(readFileSync("config/critical-classes.json", "utf8"));
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith("_") || !Array.isArray(value)) continue;
    for (const name of value) criticalClasses.add(name);
  }
}

/**
 * Режет таблицу стилей на верхнеуровневые куски: правило, @media, @font-face и т.д.
 * Считаем фигурные скобки, пропуская комментарии и строки в кавычках.
 */
const topLevelBlocks = (css) => {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let inComment = false;
  let quote = null;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (inComment) {
      if (c === "*" && css[i + 1] === "/") {
        inComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (c === "\\") i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {
      inComment = true;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1).trim());
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      // Правила без тела: @import, @charset, @layer a, b;
      blocks.push(css.slice(start, i + 1).trim());
      start = i + 1;
    }
  }
  const tail = css.slice(start).trim();
  if (tail) blocks.push(tail);
  return blocks.filter(Boolean);
};

const headOf = (block) => {
  const brace = block.indexOf("{");
  return brace === -1 ? block : block.slice(0, brace);
};
const bodyOf = (block) => {
  const brace = block.indexOf("{");
  return brace === -1 ? "" : block.slice(brace + 1, block.lastIndexOf("}"));
};

// Классы из селектора. `.brand-logo-colored` и `.brand-logo` — разные имена, поэтому
// берём слово целиком, до знака, который в имени класса быть не может.
const classesOf = (selector) => (selector.match(/\.-?[_a-zA-Z][\w-]*/g) || []).map((name) => name.slice(1));

// Служебные пометки состояния встречаются на всех страницах сайта, поэтому сами по себе
// ничего не говорят о том, нужно ли правило сразу. Если решать по ним, в срочную часть
// уедет, например, «.model-quick-chips button.active» — правило со страницы модели,
// попавшее туда только из-за слова active. Судьбу правила решают названия блоков.
const stateModifiers = new Set(["active", "selected", "open", "current", "future", "accent", "has-photo", "chosen", "disabled", "dragging", "measured"]);

const isCritical = (selector) => {
  const classes = classesOf(selector);
  if (!classes.length) return true; // теги, :root, html, body, [data-theme] — каркас
  const meaningful = classes.filter((name) => !stateModifiers.has(name));
  if (!meaningful.length) return true; // правило про одно лишь состояние — пусть будет сразу
  return meaningful.some((name) => criticalClasses.has(name));
};

/**
 * Возвращает { critical, rest } для куска стилей. Обёртки (@media, @supports, @layer)
 * разбираем внутрь и сохраняем в той части, куда попало вложенное правило: медиа-запрос
 * без своих правил бесполезен, а с чужими — вреден.
 */
const splitBlock = (block) => {
  const head = headOf(block).trim();
  if (!head.startsWith("@")) {
    return isCritical(head) ? { critical: block, rest: "" } : { critical: "", rest: block };
  }
  const name = head.slice(1).split(/[\s({]/, 1)[0].toLowerCase();
  // Шрифты, переменные, анимации и настройки страницы нужны с первого кадра.
  if (["font-face", "keyframes", "-webkit-keyframes", "property", "charset", "import", "namespace", "page", "counter-style"].includes(name)) {
    return { critical: block, rest: "" };
  }
  if (!["media", "supports", "layer", "container", "scope"].includes(name)) {
    return { critical: block, rest: "" };
  }
  const inner = topLevelBlocks(bodyOf(block));
  const criticalInner = [];
  const restInner = [];
  for (const child of inner) {
    const split = splitBlock(child);
    if (split.critical) criticalInner.push(split.critical);
    if (split.rest) restInner.push(split.rest);
  }
  return {
    critical: criticalInner.length ? `${head} {\n${criticalInner.join("\n")}\n}` : "",
    rest: restInner.length ? `${head} {\n${restInner.join("\n")}\n}` : "",
  };
};

const cssFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".css"));
if (!cssFiles.length) {
  console.log("[split-css] в сборке нет файлов стилей — делить нечего");
  process.exit(0);
}

let html = readFileSync(indexPath, "utf8");
let totalCritical = 0;
let totalRest = 0;

for (const file of cssFiles) {
  const path = join(assetsDir, file);
  const css = readFileSync(path, "utf8");
  const criticalParts = [];
  const restParts = [];
  for (const block of topLevelBlocks(css)) {
    const split = splitBlock(block);
    if (split.critical) criticalParts.push(split.critical);
    if (split.rest) restParts.push(split.rest);
  }
  const critical = criticalParts.join("\n");
  const rest = restParts.join("\n");

  const href = `/assets/${file}`;
  const link = new RegExp(`\\s*<link[^>]+href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
  if (!link.test(html)) {
    console.log(`[split-css] ${file}: ссылки на файл в index.html нет, оставляем как есть`);
    continue;
  }
  // Срочная часть — прямо в страницу; остальная остаётся отдельным файлом, но грузится
  // как «стили для печати»: браузер их не ждёт, а по загрузке скрипт возвращает им
  // обычное назначение. Для браузеров без скриптов рядом лежит обычная ссылка.
  const replacement = rest
    ? `\n    <style>${critical}</style>\n    <link rel="stylesheet" crossorigin href="${href}" media="print" onload="this.media='all'" />\n    <noscript><link rel="stylesheet" crossorigin href="${href}" /></noscript>`
    : `\n    <style>${critical}</style>`;
  html = html.replace(link, replacement);
  writeFileSync(path, rest);
  totalCritical += Buffer.byteLength(critical);
  totalRest += Buffer.byteLength(rest);
  const kb = (value) => (value / 1024).toFixed(1);
  console.log(`[split-css] ${file}: ${kb(Buffer.byteLength(css))} КБ → в странице ${kb(Buffer.byteLength(critical))} КБ, отложено ${kb(Buffer.byteLength(rest))} КБ`);
}

writeFileSync(indexPath, html);
console.log(`[split-css] готово: срочных ${(totalCritical / 1024).toFixed(1)} КБ, отложенных ${(totalRest / 1024).toFixed(1)} КБ`);

// Кладёт в главную страницу готовую разметку приложения.
//
// Раньше собранная главная несла в #root заглушку первого экрана и скрытый текст
// для поисковиков, а приложение, загрузившись, выбрасывало всё это и рисовало себя
// заново — из-за второй отрисовки заголовок страницы «готов» только через ~3 секунды
// на медленном телефоне, и именно по нему PageSpeed считает скорость. Теперь в #root
// лежит настоящая разметка приложения в стартовом состоянии (собрана entry-server.jsx
// на этапе сборки — серверу в момент запроса ничего рисовать не надо), а браузерный
// скрипт её оживляет, не перерисовывая (hydrateRoot в main.jsx).
//
// Откат: убрать этот шаг из npm run build — страница вернётся к заглушке и текстам
// для поисковиков, приложение снова будет рисовать себя с нуля, как до 28.08.2026.
//
// Запуск: node scripts/prerender-home.mjs [--dir=dist/client] [--ssr=dist/ssr]
// В цепочке сборки стоит после generate-seo-pages (он собирает главную из заготовки)
// и до precompress (сжимать нужно уже готовый файл).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const clientDir = arg("dir", "dist/client");
const ssrDir = arg("ssr", "dist/ssr");
const indexPath = join(clientDir, "index.html");

const { renderAppPage } = await import(pathToFileURL(join(process.cwd(), ssrDir, "entry-server.js")).href);
const app = renderAppPage("/");
if (!app.includes("<h1>") || !app.includes("site-footer")) {
  console.error("[prerender] разметка главной собралась без заголовка или подвала — страницу не трогаем");
  process.exit(1);
}

const html = readFileSync(indexPath, "utf8");
const open = html.indexOf('<div id="root"');
if (open === -1) {
  console.error("[prerender] в index.html нет #root — страницу не трогаем");
  process.exit(1);
}
const contentAt = html.indexOf(">", open) + 1;

// Закрывающий тег #root ищем по балансу div: внутри лежит заглушка и текст для
// поисковиков с собственной вложенностью.
let depth = 1;
let close = -1;
const tag = /<div\b|<\/div>/g;
tag.lastIndex = contentAt;
for (let match = tag.exec(html); match; match = tag.exec(html)) {
  depth += match[0] === "</div>" ? -1 : 1;
  if (depth === 0) {
    close = match.index;
    break;
  }
}
if (close === -1) {
  console.error("[prerender] не нашёл конец #root — страницу не трогаем");
  process.exit(1);
}

// React кладёт подсказки-предзагрузки (<link rel="preload">, теги приложения о
// логотипах) в начало собранной разметки, а в браузере при оживлении ждёт их в
// шапке страницы — оставь их в #root, сверка разметки провалится, и React
// перерисует страницу целиком. Поэтому головные <link> переезжают в <head>.
let body = app;
const hoisted = [];
for (;;) {
  const match = /^<link\b[^>]*>/.exec(body);
  if (!match) break;
  hoisted.push(match[0]);
  body = body.slice(match[0].length);
}

const before = html.slice(0, open);
const after = html.slice(close + "</div>".length);
const withRoot = `${before}<div id="root" data-prerender="app">${body}</div>${after}`;
const replaced = hoisted.length ? withRoot.replace("</head>", `${hoisted.join("")}</head>`) : withRoot;
writeFileSync(indexPath, replaced);

const kb = (value) => (value / 1024).toFixed(1);
console.log(
  `[prerender] главная: разметка приложения ${kb(app.length)} КБ вместо заглушки, ` +
    `в шапку перенесено подсказок: ${hoisted.length}, страница ${kb(html.length)} → ${kb(replaced.length)} КБ`,
);

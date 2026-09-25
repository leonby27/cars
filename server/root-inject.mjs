// Вставка готовой разметки приложения в страницу вместо содержимого #root.
//
// Общая часть для главной (scripts/prerender-home.mjs, на этапе сборки) и страниц,
// которые сервер рисует в момент запроса (server/static-page.mjs): найти #root по
// балансу div, положить туда разметку с меткой оживления, перенести в шапку подсказки
// предзагрузки и встроить данные, из которых разметка собрана.

/** Границы содержимого #root: { open, contentAt, close } или null. */
export function findRoot(html) {
  const open = html.indexOf('<div id="root"');
  if (open === -1) return null;
  const contentAt = html.indexOf(">", open) + 1;
  // Закрывающий тег ищем по балансу div: внутри лежат заглушка и текст для поисковика
  // с собственной вложенностью.
  let depth = 1;
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = contentAt;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[0] === "</div>" ? -1 : 1;
    if (depth === 0) return { open, contentAt, close: match.index };
  }
  return null;
}

/**
 * React кладёт подсказки-предзагрузки (<link rel="preload">) в начало собранной
 * разметки, а в браузере при оживлении ждёт их в шапке — иначе сверка провалится и
 * страница перерисуется целиком. Возвращает { body, hoisted }.
 */
export function hoistLinks(markup) {
  let body = markup;
  const hoisted = [];
  for (;;) {
    const match = /^<link\b[^>]*>/.exec(body);
    if (!match) break;
    hoisted.push(match[0]);
    body = body.slice(match[0].length);
  }
  return { body, hoisted };
}

/** Встраивание данных в страницу: </script> в них не выживает — экранируем «<». */
export const bootScript = (boot) => `<script>window.__boot = Object.assign(window.__boot || {}, ${JSON.stringify(boot).replace(/</g, "\\u003c")});</script>`;

/**
 * Страница с готовой разметкой вместо содержимого #root; null — #root не найден.
 * `path` — адрес, для которого разметка собрана (метка data-prerender, см. main.jsx).
 */
export function injectAppRoot(html, markup, { path, boot = null, extraHead = "" }) {
  const root = findRoot(html);
  if (!root) return null;
  const { body, hoisted: links } = hoistLinks(markup);
  // Подсказки, которые уже стоят в шапке (файл главной собран с ними), второй раз не кладём.
  const head = html.slice(0, html.indexOf("</head>"));
  const hoisted = links.filter((link) => !head.includes(link));
  const escapedPath = String(path).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const withRoot = `${html.slice(0, root.open)}<div id="root" data-prerender="${escapedPath}">${body}</div>${html.slice(root.close + "</div>".length)}`;
  return withRoot.replace("</head>", `${hoisted.join("")}${extraHead}${boot ? bootScript(boot) : ""}</head>`);
}

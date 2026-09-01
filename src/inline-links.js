// Живые ссылки внутри абзацев обзора модели — синтаксис [текст](/путь), как в
// markdown. Один и тот же разбор использует и сервер (страница обзора для
// поисковика, server/seo-render.mjs), и браузер (src/App.jsx): страница для
// поисковика и то, что видит посетитель, не должны разойтись.
const LINK_PATTERN = /\[([^[\]]+)\]\((\/[a-z0-9/_-]+)\)/gi;

/**
 * Разбирает строку на обычный текст и ссылки: возвращает массив, где элемент —
 * либо кусок текста (строка), либо `{ label, href }`.
 */
export function splitInlineLinks(text) {
  const value = String(text ?? "");
  const parts = [];
  let cursor = 0;
  for (const match of value.matchAll(LINK_PATTERN)) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    parts.push({ label: match[1], href: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

/**
 * Тот же текст без ссылок: остаются только их названия. Нужен там, где требуется
 * чистый текст, а не разметка, — в первую очередь в разметке вопросов и ответов:
 * поисковик показывает её как есть, и «[калькулятор](/calculator)» в выдаче
 * выглядел бы ошибкой.
 */
export const plainInlineText = (text) =>
  splitInlineLinks(text)
    .map((part) => (typeof part === "string" ? part : part.label))
    .join("");

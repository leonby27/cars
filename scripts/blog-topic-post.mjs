// Строка расписания → материал журнала.
//
// В BLOG_TOPICS.md тема записана человеческим названием, а в коде у материала свой
// заголовок, и они расходятся: «Топ 10 свежих: машины 2024 года и новее» в таблице —
// это «Топ 10 самых свежих машин из Китая» в коде. Поэтому сравниваем не строки
// целиком, а набор слов: у нужного материала совпадений заметно больше, чем у любого
// другого.
//
// Сопоставление нужно двум скриптам сразу — тому, что собирает таблицу, и тому, что
// раскладывает картинки, — поэтому живёт отдельно.
import { blogAllPosts } from "../src/blog-posts.js";

// Слова, которые есть почти в каждом заголовке и потому ничего не различают.
const NOISE = new Set(["топ", "10", "из", "китая", "в", "и", "на", "что", "как", "по", "с", "или", "не", "для", "их", "у", "а", "то", "под", "ключ", "беларуси"]);

const words = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/\{top\}/g, "10")
    .replace(/[^а-яёa-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word && !NOISE.has(word));

/** Доля общих слов: 1 — все слова темы нашлись в заголовке материала. */
const overlap = (topic, title) => {
  const target = new Set(words(title));
  if (!target.size) return 0;
  const source = words(topic);
  if (!source.length) return 0;
  const hits = source.filter((word) => target.has(word)).length;
  return hits / Math.max(source.length, target.size);
};

/**
 * Материал по названию темы из расписания. Возвращает null, если подходящего нет:
 * лучше признаться, что материал не найден, чем подставить чужой.
 */
export function findPostByTopic(topic) {
  let best = null;
  let score = 0;
  for (const post of blogAllPosts()) {
    const value = Math.max(overlap(topic, post.name), overlap(topic, post.h1));
    if (value > score) {
      score = value;
      best = post;
    }
  }
  // Половина общих слов — уверенное совпадение; ниже начинаются случайные пересечения.
  return score >= 0.5 ? best : null;
}

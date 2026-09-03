// Текст материала журнала для браузера: подгружается отдельным файлом, когда
// страницу открыли или перешли на неё внутри сайта. Сборщик режет папку
// `src/blog-texts/` на отдельные файлы, по одному на материал.
//
// Сервер и сборка этим загрузчиком не пользуются: там нужны все тексты сразу, и они
// читаются из `src/blog-texts.js`.
import { rewriteEvDutyCopyDeep } from "./ev-duty-copy.js";
import { stripUnreleasedBlogLinks } from "./blog-posts.js";

const files = import.meta.glob("./blog-texts/*.js");
const loaded = new Map();

/** Уже загруженный текст — чтобы отрисовать страницу без ожидания. */
export const loadedBlogText = (slug) => loaded.get(slug) || null;

/** Загружает текст материала. Повторный вызов отдаёт уже загруженный. */
export async function loadBlogText(slug) {
  if (!slug) return null;
  if (loaded.has(slug)) return loaded.get(slug);
  const file = files[`./blog-texts/${slug}.js`];
  if (!file) return null;
  // Ссылки на материалы, которые ещё не вышли, остаются текстом: страница у них есть,
  // но в журнале её пока нет, и вести туда читателя незачем.
  const text = stripUnreleasedBlogLinks(rewriteEvDutyCopyDeep((await file()).default));
  loaded.set(slug, text);
  return text;
}

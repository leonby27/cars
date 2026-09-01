// Нужна ли пересборка ради журнала: есть ли вышедшие материалы, которых нет в
// нынешней сборке.
//
// Проверяем не «выходит ли что-то сегодня», а состояние собранных страниц. Так
// выкладка догоняет пропущенный день: если утреннее задание не отработало (сервер
// перезагружался, сборка упала), назавтра выйдут оба материала, а не один.
//
// Материал считается выложенным, когда он попал в список последней сборки.
// Запуск: node scripts/blog-due.mjs
// Код возврата: 0 — собирать надо, 10 — нечего.
import fs from "node:fs";
import { blogPosts } from "../src/blog-posts.js";

// Список материалов прошлой сборки пишет generate-seo-pages.mjs.
const LIST = new URL("../dist/blog-published.json", import.meta.url).pathname;
const built = new Set(fs.existsSync(LIST) ? JSON.parse(fs.readFileSync(LIST, "utf8")) : []);

const due = blogPosts().filter((post) => !built.has(post.slug));
if (!due.length) {
  console.log("Журнал: всё вышедшее уже в сборке.");
  process.exit(10);
}
console.log(`Журнал: ждут выкладки ${due.length} — ${due.map((post) => post.name).join("; ")}`);
process.exit(0);

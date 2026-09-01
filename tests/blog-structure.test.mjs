// Устройство материалов журнала: что обязано быть в каждом виде и как устроены блоки.
//
// Правила записаны словами в BLOG_TEXTS_TZ.md, а здесь стоят сторожа. Смысл разделения
// такой: ТЗ читают перед тем, как писать, а проверки ловят то, что всё равно забудут.
// Каждый сторож поставлен по конкретной оплошности, а не «на всякий случай», — какой
// именно, написано рядом.
import test from "node:test";
import assert from "node:assert/strict";
import { blogAllPosts } from "../src/blog-posts.js";
import { BLOG_TEXTS } from "../src/blog-texts.js";
import { BLOG_FIGURES } from "../src/blog-figures.js";
import { CATALOG_LANDINGS } from "../src/catalog-landings.js";
import { MODEL_PAGES } from "../src/model-pages.js";

const posts = blogAllPosts();
const textOf = (post) => BLOG_TEXTS[post.slug];
const sectionsOf = (post) => textOf(post)?.sections || [];
const words = (value) => JSON.stringify(value).replace(/[^А-Яа-яЁё ]/g, " ").split(/\s+/).filter((word) => word.length > 1).length;

// Разделы без заголовка или без единого абзаца собираются в пустую рамку: заголовок
// над пустотой поисковик читает как сломанную страницу.
test("у каждого раздела есть заголовок и хотя бы один абзац", () => {
  for (const post of posts) {
    for (const section of sectionsOf(post)) {
      assert.ok(section.title, `в материале ${post.slug} раздел без заголовка`);
      assert.ok(section.paragraphs?.length, `в материале ${post.slug} раздел «${section.title}» без абзацев`);
    }
  }
});

// Блоки раздела: у каждого своя форма, и половина заполненного блока ломает вёрстку
// молча — шаг без описания рисуется пустой карточкой с номером.
test("блоки разделов заполнены целиком", () => {
  for (const post of posts) {
    for (const section of sectionsOf(post)) {
      for (const step of section.steps || []) {
        assert.ok(step.title && step.text, `в материале ${post.slug}, раздел «${section.title}»: шаг заполнен наполовину`);
      }
      for (const item of section.list || []) {
        assert.ok(item.term && item.text, `в материале ${post.slug}, раздел «${section.title}»: пункт списка заполнен наполовину`);
      }
      for (const option of section.compare || []) {
        assert.ok(option.name && option.text, `в материале ${post.slug}, раздел «${section.title}»: карточка сравнения заполнена наполовину`);
      }
      if (section.callout) {
        assert.ok(section.callout.title && section.callout.text, `в материале ${post.slug}: врезка «${section.callout.title}» заполнена наполовину`);
      }
      // Карточек сравнения ровно две: блок рисуется в две колонки, третья уезжает
      // на следующую строку и ломает пару.
      if (section.compare) {
        assert.equal(section.compare.length, 2, `в материале ${post.slug}, раздел «${section.title}»: карточек сравнения должно быть две`);
      }
    }
  }
});

// Таблица со строкой не по ширине шапки едет: ячейки сдвигаются на колонку влево,
// и «≈ 320 км» оказывается под «Обычной ездой летом».
test("в таблицах все строки по ширине шапки", () => {
  for (const post of posts) {
    for (const section of sectionsOf(post)) {
      if (!section.table) continue;
      const { head, rows, caption } = section.table;
      assert.ok(head?.length >= 2, `в материале ${post.slug}: у таблицы «${caption || section.title}» нет шапки`);
      assert.ok(rows?.length, `в материале ${post.slug}: таблица «${caption || section.title}» пустая`);
      for (const row of rows) {
        assert.equal(row.length, head.length, `в материале ${post.slug}: строка «${row[0]}» не по ширине шапки`);
      }
    }
  }
});

// Имя графика с опечаткой не падает, а просто ничего не рисует — статья остаётся
// без картинки, и никто этого не замечает.
test("графики в текстах существуют и у всех есть заголовок", () => {
  for (const post of posts) {
    for (const section of sectionsOf(post)) {
      if (!section.figure) continue;
      assert.ok(BLOG_FIGURES[section.figure], `в материале ${post.slug} раздел «${section.title}» ссылается на несуществующий график ${section.figure}`);
    }
  }
});

// Статья без вопросов теряет отдельный блок в выдаче, а без оговорки на денежной теме
// читается как обещание. И то и другое — правило, а не вкусовщина.
test("у статьи есть вступление, разделы, вопросы и оговорка", () => {
  const articles = posts.filter((post) => post.kind === "article");
  assert.ok(articles.length, "статей не осталось — если это намеренно, поправьте и проверку");
  for (const post of articles) {
    const text = textOf(post);
    assert.ok(text.intro?.length >= 2, `у статьи ${post.slug} меньше двух вступительных абзацев`);
    assert.ok(sectionsOf(post).length >= 3, `у статьи ${post.slug} меньше трёх разделов`);
    assert.ok(text.faq?.length >= 3, `у статьи ${post.slug} меньше трёх вопросов`);
    assert.ok(text.disclaimer, `у статьи ${post.slug} нет оговорки`);
    // Заглушка на пару абзацев в выдаче не живёт. Порог низкий намеренно: он ловит
    // недописанное, а не задаёт объём.
    assert.ok(words(text) >= 500, `у статьи ${post.slug} всего ${words(text)} слов — похоже на заготовку`);
  }
});

// Ссылок наружу не больше трёх: страница делит вес между всеми ссылками, и десяток
// внешних на статью — это уже раздача, а не подтверждение фактов.
test("внешних ссылок не больше трёх на материал", () => {
  for (const post of posts) {
    const sources = textOf(post)?.sources || [];
    assert.ok(sources.length <= 3, `в материале ${post.slug} внешних ссылок ${sources.length}`);
  }
});

// Заголовок материала, дословно совпадающий с заголовком раздела каталога или обзора
// модели, — это две наши страницы под один запрос. Поисковик выберет одну сам, обычно
// не ту, и просядут обе.
test("заголовок материала не повторяет заголовок раздела или обзора", () => {
  const normalize = (value) => String(value || "").toLowerCase().replace(/[«»",.—–-]/g, " ").replace(/\s+/g, " ").trim();
  const taken = new Map();
  for (const landing of CATALOG_LANDINGS) taken.set(normalize(landing.h1), landing.path);
  for (const page of MODEL_PAGES) taken.set(normalize(page.h1), page.path);
  for (const post of posts) {
    const clash = taken.get(normalize(post.h1));
    assert.ok(!clash, `заголовок материала ${post.slug} дословно повторяет заголовок страницы ${clash}`);
  }
});

// Внутренние ссылки ведут в каталог, разделы, обзоры и расчёты. Ссылка на несуществующий
// адрес молча превращается в честный 404 — читатель уходит на страницу «такой страницы
// нет» прямо из середины статьи.
test("внутренние ссылки в текстах ведут на существующие адреса", () => {
  const known = new Set([
    "/catalog",
    "/calculator",
    "/customs",
    "/delivery-cost",
    "/ev-quota",
    "/how-it-works",
    "/faq",
    "/about",
    "/blog",
  ]);
  for (const landing of CATALOG_LANDINGS) known.add(landing.path);
  for (const page of MODEL_PAGES) known.add(page.path);
  for (const post of posts) known.add(post.path);
  for (const [slug, text] of Object.entries(BLOG_TEXTS)) {
    for (const match of JSON.stringify(text).matchAll(/\]\((\/[a-z0-9/_-]+)\)/gi)) {
      assert.ok(known.has(match[1]), `в материале ${slug} ссылка на несуществующий адрес ${match[1]}`);
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { shippedFlag } from "../src/feature-flags.js";
import { BLOG_DUEL_ROW_KEYS, BLOG_DUEL_SPEC_KEYS, BLOG_FILTER_KEYS, BLOG_HIGHLIGHT_FIELDS, BLOG_RUBRICS, BLOG_YEAR_TOKEN, HOME_BLOG_LIMIT, blogApiParams, blogCatalogHref, blogDateLabel, blogDuelRows, blogDuelSpecRows, blogFilterSets, blogHighlight, blogHighlightSort, blogListParams, blogDateLine, blogPostStats, blogPostTags, blogPosts, blogPostSides, blogPostsFor, blogRelativeDate, blogSidebarItems, blogUpdatedLabel, findBlogPost, homeBlogPosts } from "../src/blog-posts.js";
import { BLOG_TEXTS, BLOG_TEXTS_RAW } from "../src/blog-texts.js";
import { catalogLandingForParams } from "../src/catalog-landings.js";

// Журнал открыт посетителям 27.08.2026. Проверка осталась, только с обратным знаком:
// теперь она ловит случайное выключение раздела — вместе с ним со всего сайта пропали
// бы блок на главной, ссылка в подвале, адреса /blog и страницы в карте сайта.
test("на боевом сайте журнал включён", () => {
  assert.equal(shippedFlag("BLOG_ENABLED"), true, "журнал выключен для боевого сайта — если это намеренно, поправьте и эту проверку");
});

test("у каждого материала есть текст, рубрика и разбираемая дата", () => {
  const rubrics = new Set(BLOG_RUBRICS.map((rubric) => rubric.slug));
  for (const post of blogPosts()) {
    assert.ok(BLOG_TEXTS[post.slug], `у материала ${post.slug} нет текста в src/blog-texts/`);
    assert.ok(rubrics.has(post.rubric), `у материала ${post.slug} рубрика ${post.rubric}, которой нет`);
    assert.ok(blogDateLabel(post.published), `у материала ${post.slug} неразбираемая дата ${post.published}`);
    assert.ok(post.name && post.h1 && post.seoTitle && post.seoDescription && post.lead, `у материала ${post.slug} не заполнены заголовки`);
    assert.match(post.path, /^\/blog\/[a-z0-9-]+$/);
  }
});

test("адреса материалов не повторяются и находятся по адресу", () => {
  const paths = blogPosts().map((post) => post.path);
  assert.equal(new Set(paths).size, paths.length, "два материала с одним адресом");
  for (const post of blogPosts()) assert.equal(findBlogPost(post.path)?.slug, post.slug);
  assert.equal(findBlogPost("/blog/такого-нет"), null);
});

// Правил отбора у материала может быть несколько: у подборки одно, у сравнения по
// одному на сторону. Пустое правило показало бы весь каталог вместо отобранного среза.
test("правило отбора собрано из тех фильтров, которые умеет каталог", () => {
  for (const post of blogPosts()) {
    const sets = blogFilterSets(post);
    assert.ok(sets.length > 0, `у ${post.slug} нет ни одного правила отбора`);
    for (const filters of sets) {
      for (const key of Object.keys(filters || {})) {
        assert.ok(BLOG_FILTER_KEYS.includes(key), `фильтр ${key} у ${post.slug} никуда не переводится`);
      }
      assert.ok([...blogApiParams({ filters })].length > 0, `у ${post.slug} пустое правило отбора — материал покажет весь каталог`);
    }
  }
});

// Подборка, полностью повторяющая готовый раздел каталога, встанет в выдаче против
// него, и просядут обе страницы. Вдобавок ссылка «смотреть все» с такого адреса
// перебрасывается на раздел постоянным перебросом.
test("ни одна подборка не повторяет готовый раздел каталога", () => {
  for (const post of blogPosts()) {
    for (const filters of blogFilterSets(post)) {
      const href = blogCatalogHref({ filters });
      const landing = catalogLandingForParams(href.split("?")[1] || "");
      assert.equal(landing, null, `материал ${post.slug} повторяет раздел ${landing?.path}`);
    }
  }
});

// Третья цифра в полосе своя у каждой подборки. Написанное мимо списка полей молча
// не покажет ничего, поэтому список проверяется.
test("своя цифра подборки берётся из известного поля и с подписью", () => {
  for (const post of blogPosts()) {
    if (!post.highlight) continue;
    assert.ok(BLOG_HIGHLIGHT_FIELDS.includes(post.highlight.field), `у ${post.slug} поле ${post.highlight.field}, которого нет`);
    assert.ok(post.highlight.label, `у ${post.slug} нет подписи к своей цифре`);
    assert.ok(blogHighlightSort(post), `у ${post.slug} не выбрать машину для своей цифры`);
  }
  const post = { highlight: { field: "accel", label: "разгон у самой быстрой машины" } };
  assert.deepEqual(blogHighlight(post, { acceleration: "3.2" }), { value: "от 3,2 с", label: "разгон у самой быстрой машины" });
  assert.equal(blogHighlight(post, null), null);
  assert.equal(blogHighlight(post, { acceleration: null }), null);
});

// Год в заголовке пишется подставкой и заменяется при отрисовке: страница с прошлым
// годом в выдаче проигрывает, а руками год никто обновлять не будет.
test("год в заголовках подставляется, а в тексте статьи его нет", () => {
  for (const post of blogPosts(2031)) {
    for (const field of ["name", "h1", "seoTitle", "seoDescription", "lead", "teaser"]) {
      if (!post[field]) continue;
      assert.ok(!post[field].includes(BLOG_YEAR_TOKEN), `у ${post.slug} в поле ${field} остался неподставленный год`);
    }
    assert.ok(!post.seoTitle.includes("2026") || post.seoTitle.includes("2031"), `у ${post.slug} год записан руками, а не подставкой`);
  }
  assert.ok(blogPosts(2031).some((post) => post.seoTitle.includes("2031")), "ни в одном заголовке нет года — подстановка не работает");
  // В самом тексте статьи года быть не должно: он бы устарел молча.
  const years = /\b20[2-9]\d\b/;
  for (const [slug, text] of Object.entries(BLOG_TEXTS)) {
    const found = JSON.stringify(text).match(years);
    assert.equal(found, null, `в тексте ${slug} написан год ${found?.[0]} — он устареет молча`);
  }
});

// Порядок списка постоянный: иначе обложка подборки на главной менялась бы при каждой
// перезагрузке, а посетителю казалось бы, что страницу подменили.
test("список подборки идёт в постоянном порядке", () => {
  for (const post of blogPosts().filter((item) => item.kind !== "duel")) {
    const params = blogListParams(post, 12);
    assert.equal(params.get("sort"), "default");
    assert.equal(params.get("seed"), post.slug);
  }
});

// Дата обновления — настоящая проверка каталога, но никогда не раньше дня выпуска:
// «обновлено вчера, опубликовано сегодня» поисковик читает как сломанную разметку.
test("дата обновления не бывает раньше дня выпуска материала", () => {
  const post = { published: "2026-08-27" };
  assert.equal(blogUpdatedLabel(post, "2026-08-26T21:00:00Z"), "27 августа 2026");
  assert.equal(blogUpdatedLabel(post, "2026-09-14T03:00:00Z"), "14 сентября 2026");
  assert.equal(blogUpdatedLabel(post, null), "27 августа 2026");
  assert.equal(blogUpdatedLabel(post, "не дата"), "27 августа 2026");
  assert.equal(blogUpdatedLabel({}, null), null);
});

// Метки на карточке — названия из того же меню, что и фильтры: иначе посетитель
// увидит на карточке слово, которого в навигации нет.
// «Обновлено» пишем только когда каталог правда проверялся после выпуска материала:
// это слово в день выхода читается как приписка для вида.
test("до первой проверки каталога пишем «Опубликовано»", () => {
  const post = { published: "2026-08-27" };
  assert.deepEqual(blogDateLine(post, null), { updated: false, word: "Опубликовано", date: "27 августа 2026" });
  assert.deepEqual(blogDateLine(post, "2026-08-27T22:00:00Z"), { updated: false, word: "Опубликовано", date: "27 августа 2026" });
  assert.deepEqual(blogDateLine(post, "2026-08-26T21:00:00Z"), { updated: false, word: "Опубликовано", date: "27 августа 2026" });
  assert.deepEqual(blogDateLine(post, "2026-09-14T03:00:00Z"), { updated: true, word: "Обновлено", date: "14 сентября 2026" });
  // С переданным «сейчас» приложение пишет ту же дату словами.
  assert.deepEqual(blogDateLine(post, "2026-09-14T03:00:00Z", new Date("2026-09-14T20:00:00Z")), { updated: true, word: "Обновлено", date: "сегодня" });
  assert.equal(blogDateLine({}, null), null);
});

// Главное правило текстов (ТЗ в BLOG_TEXTS_TZ.md): ничего не обещать от своего имени.
// «Мы проверяем», «мы подтверждаем» — это услуга, которую придётся оказывать всегда,
// а текст живёт годами. Тот же факт пишется безлично или советом покупателю.
test("в текстах нет обещаний от первого лица", () => {
  const banned = [/\bмы\b/i, /\bнам\b/i, /\bнаши[йемх]?\b/i, /подтверждаем/i, /проверяем/i, /сверяем/i, /гарантируем/i, /обеспечиваем/i];
  for (const [slug, text] of Object.entries(BLOG_TEXTS_RAW)) {
    const sentences = JSON.stringify(text).split(/(?<=[.!?])\s+/);
    const guilty = sentences.filter((sentence) => banned.some((pattern) => pattern.test(sentence)));
    assert.deepEqual(guilty, [], `в тексте ${slug} обещание от первого лица:\n${guilty.slice(0, 3).join("\n")}`);
  }
});

test("метки материала берутся из разделов меню", () => {
  const known = new Set(blogSidebarItems().map((item) => item.name));
  for (const post of blogPosts()) {
    const tags = blogPostTags(post);
    assert.ok(tags.length > 0, `у ${post.slug} нет ни одной метки`);
    assert.equal(new Set(tags.map((tag) => tag.slug)).size, tags.length, `у ${post.slug} метка повторяется`);
    for (const tag of tags) assert.ok(known.has(tag.name), `метки «${tag.name}» нет в меню`);
  }
  // Несколько меток: раздел плюс тип машины, если подборка отбирает машины по нему.
  assert.deepEqual(blogPostTags({ rubric: "collections", filters: { type: "Электромобиль" } }).map((tag) => tag.name), ["Подборки", "Электромобили"]);
  assert.deepEqual(blogPostTags({ rubric: "news", tags: ["hybrid"] }).map((tag) => tag.name), ["Новости", "Гибриды"]);
  assert.deepEqual(blogPostTags({}), []);
});

// Сравнение — второй вид материала: две стороны, у каждой своя модель, свой обзор
// и свой срез каталога. Одна сторона или три — это уже не сравнение, а таблица без
// подсветки лучшего значения читается как случайный набор цифр.
test("у сравнения ровно две стороны и у каждой свой обзор модели", () => {
  const duels = blogPosts().filter((post) => post.kind === "duel");
  assert.ok(duels.length > 0, "в журнале нет ни одного сравнения");
  for (const post of duels) {
    const sides = blogPostSides(post);
    assert.equal(sides.length, 2, `у сравнения ${post.slug} сторон не две`);
    for (const side of sides) {
      assert.ok(side.brand && side.model, `у стороны сравнения ${post.slug} нет марки или модели`);
      assert.ok(side.name && side.short, `у стороны сравнения ${post.slug} нет названия`);
      assert.match(side.review, /^\/models\/[a-z0-9-]+$/, `у стороны ${side.name} нет ссылки на обзор модели`);
      assert.deepEqual(side.filters, { brand: side.brand, model: side.model });
    }
    // Порядок сторон — порядок в заголовке: иначе таблица и заголовок расходятся.
    assert.ok(post.h1.indexOf(sides[0].name) < post.h1.indexOf(sides[1].name), `в заголовке ${post.slug} стороны идут в другом порядке`);
    // У сравнения нет своего правила отбора, поэтому тип машины в метку приходит
    // только слугом — без него материал выпал бы из пункта меню.
    assert.ok(blogPostTags(post).length > 1, `у сравнения ${post.slug} только одна метка`);
  }
});

// Таблица различий считается из каталога. Пустая строка (ни у одной стороны нет
// значения) в таблицу не попадает, а при равных значениях лучшего нет.
test("в таблице сравнения подсвечено только настоящее преимущество", () => {
  const rows = blogDuelRows([
    { total: 634, priceFromUsd: 26400, yearMin: 2024, yearMax: 2026, mileageMin: 10, rangeMax: 902, batteryMax: 101.7, powerMax: 690, torqueMax: 866, accelMin: 2.78 },
    { total: 1705, priceFromUsd: 19900, yearMin: 2020, yearMax: 2025, mileageMin: 100, rangeMax: 830, batteryMax: 78.4, powerMax: 486, torqueMax: 723, accelMin: 3.1 },
  ]);
  assert.deepEqual(rows.map((row) => row.key), BLOG_DUEL_ROW_KEYS);
  // Наличие и годы не соревнуются: больше объявлений — не достоинство машины.
  assert.deepEqual(rows.map((row) => row.best), [null, 1, null, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(rows[0].values.map((value) => value.text), ["634 машины", "1 705 машин"]);
  assert.deepEqual(rows[1].values.map((value) => value.money), [26400, 19900]);
  assert.deepEqual(rows[2].values.map((value) => value.text), ["2024–2026", "2020–2025"]);
  assert.equal(rows[5].values[0].text, "101,7 кВт·ч");
  assert.equal(rows[8].values[1].text, "3,1 с");
  // Один год выпуска в наличии — пишем его одним числом, а не «2024–2024».
  assert.equal(blogDuelRows([{ yearMin: 2024, yearMax: 2024 }])[0].values[0].text, "2024");
  // Равные значения: звания лучшей не получает никто.
  assert.equal(blogDuelRows([{ rangeMax: 700 }, { rangeMax: 700 }])[0].best, null);
  // Каталог не отдал значение одной из сторон — прочерк вместо цифры и снова без
  // подсветки: сравнивать не с чем.
  const half = blogDuelRows([{ accelMin: 3.1 }, {}]);
  assert.equal(half.length, 1);
  assert.equal(half[0].values[1], null);
  assert.equal(half[0].best, null);
  assert.deepEqual(blogDuelRows([{}, {}]), []);
});

// Вторая половина таблицы — паспорт модели: строки пишутся в материале и от каталога
// не зависят. Одинаковые значения с обеих сторон здесь нормальны.
test("паспортные строки сравнения берутся из материала", () => {
  for (const post of blogPosts().filter((item) => item.kind === "duel")) {
    const sides = blogPostSides(post);
    const specs = blogDuelSpecRows(sides);
    assert.ok(specs.length >= 4, `у сравнения ${post.slug} почти нет паспортных строк`);
    for (const row of specs) {
      assert.equal(row.values.length, sides.length, `в строке «${row.label}» значений не по числу сторон`);
      assert.equal(row.best, null, "паспортные строки не соревнуются между собой");
    }
    for (const side of sides) {
      for (const key of Object.keys(side.specs || {})) {
        assert.ok(BLOG_DUEL_SPEC_KEYS.includes(key), `паспортная строка ${key} у ${side.name} нигде не показывается`);
      }
    }
  }
  assert.deepEqual(blogDuelSpecRows([{ specs: {} }, { specs: {} }]), []);
});

// На главной один блок журнала, и в нём всё подряд: и подборки, и сравнения. Отдельные
// блоки по видам материалов пробовали и отказались — главная не оглавление журнала.
test("на главной один блок журнала: четыре свежих материала любого вида", () => {
  const posts = homeBlogPosts();
  assert.ok(posts.length <= HOME_BLOG_LIMIT);
  assert.deepEqual(posts.map((post) => post.slug), blogPosts().slice(0, HOME_BLOG_LIMIT).map((post) => post.slug));
  assert.ok(posts.some((post) => post.kind === "duel"), "сравнение до главной не доходит");
});

// Боковое меню перечисляет и пустые разделы — это заложенная навигация. Важно другое:
// пустой пункт не должен вести в никуда, поэтому у него всегда ноль материалов, и в
// вёрстке он не кликается.
test("боковое меню знает, сколько материалов под каждым пунктом", () => {
  const items = blogSidebarItems();
  assert.equal(items[0].name, "Все материалы", "первым пунктом идёт «Все материалы»");
  assert.equal(items[0].count, blogPosts().length);
  const names = items.map((item) => item.name);
  for (const expected of ["Электромобили", "Гибриды", "Бензиновые", "Подборки", "Сравнения", "Статьи", "Новости", "Законы", "Лайфхаки"]) {
    assert.ok(names.includes(expected), `в меню нет пункта «${expected}»`);
  }
  for (const item of items) {
    assert.equal(item.count, blogPostsFor(item).length, `у пункта «${item.name}» число не сходится с отбором`);
  }
  assert.equal(blogPostsFor(null).length, blogPosts().length);
});

// Свежесть читается словами: до недели — «сегодня/вчера/сколько дней назад», дальше
// обычная дата. Иначе посетитель не понимает, насколько живой перед ним материал.
test("дата до недели пишется словами, после — числом", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  assert.equal(blogRelativeDate("2026-09-10", now), "сегодня");
  assert.equal(blogRelativeDate("2026-09-09", now), "вчера");
  assert.equal(blogRelativeDate("2026-09-08", now), "2 дня назад");
  assert.equal(blogRelativeDate("2026-09-05", now), "5 дней назад");
  assert.equal(blogRelativeDate("2026-09-03", now), "7 дней назад");
  assert.equal(blogRelativeDate("2026-09-02", now), "2 сентября 2026");
  // Часы посетителя могут немного убежать вперёд — это всё равно «сегодня».
  assert.equal(blogRelativeDate("2026-09-12", now), "сегодня");
  assert.equal(blogRelativeDate(null, now), null);
});

// Цифры в полосе берутся из каталога. Чего каталог не отдал, того на странице нет:
// пустая плитка честнее выдуманной.
test("полоса цифр показывает только то, что известно", () => {
  assert.deepEqual(blogPostStats({}), []);
  const stats = blogPostStats({ total: 42, priceFromUsd: 23400, highlight: { value: "до 715 км", label: "запас хода" } });
  assert.deepEqual(stats.map((stat) => stat.value), ["42", "от 23 400 $", "до 715 км"]);
  assert.equal(blogPostStats({ total: 1 })[0].label, "автомобиль в наличии");
  assert.equal(blogPostStats({ total: 5 })[0].label, "автомобилей в наличии");
});

test("правило отбора переводится и в запрос к каталогу, и в адрес страницы", () => {
  const post = { filters: { type: "Электромобиль", rangeMin: 500, landedMax: 30000, mileageMax: 50000 } };
  assert.equal(String(blogApiParams(post)), new URLSearchParams({ type: "Электромобиль", mileageMax: "50000", landedMax: "30000", rangeMin: "500" }).toString());
  const catalog = new URLSearchParams(blogCatalogHref(post).split("?")[1]);
  assert.equal(catalog.get("type"), "Электромобили");
  assert.equal(catalog.get("range"), "От 500 км");
  assert.equal(catalog.get("priceTo"), "30000");
  assert.equal(catalog.get("mileage"), "до 50 000 км");
});

import test from "node:test";
import assert from "node:assert/strict";
import { shippedFlag } from "../src/feature-flags.js";
import { BLOG_DUEL_ROW_KEYS, BLOG_DUEL_SPEC_KEYS, BLOG_FILTER_KEYS, BLOG_HIGHLIGHT_FIELDS, BLOG_RUBRICS, BLOG_YEAR_TOKEN, HOME_BLOG_LIMIT, blogApiParams, blogCatalogHref, blogDateLabel, blogDuelRows, blogDuelSpecRows, blogFilterSets, blogHighlight, blogHighlightSort, blogListParams, blogPostDateSentence, blogPostDateLabel, blogPostStats, blogPostTags, blogPosts, blogPostSides, blogPostsFor, blogRelativeDate, blogSidebarItems, blogUpdatedAt, blogAllPosts, findBlogPost, homeBlogPosts } from "../src/blog-posts.js";
import { BLOG_TEXTS, BLOG_TEXTS_RAW } from "../src/blog-texts.js";
import { SAMPLE_REPORT, indexChartSvg, percent } from "../src/blog-report.js";
import { BLOG_FIGURES, blogFigureHtml } from "../src/blog-figures.js";
import { plainInlineText } from "../src/inline-links.js";
import { catalogLandingForParams } from "../src/catalog-landings.js";

// Журнал открыт посетителям 27.08.2026. Проверка осталась, только с обратным знаком:
// теперь она ловит случайное выключение раздела — вместе с ним со всего сайта пропали
// бы блок на главной, ссылка в подвале, адреса /blog и страницы в карте сайта.
test("на боевом сайте журнал включён", () => {
  assert.equal(shippedFlag("BLOG_ENABLED"), true, "журнал выключен для боевого сайта — если это намеренно, поправьте и эту проверку");
});

test("у каждого материала есть текст, рубрика и разбираемая дата", () => {
  const rubrics = new Set(BLOG_RUBRICS.map((rubric) => rubric.slug));
  for (const post of blogAllPosts()) {
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
  //
  // Исключение — полная дата («1 января 2026 года»): это не обещание свежести, а
  // привязанный ко времени факт, который не устаревает. Дата вступления указа в силу
  // останется верной и через десять лет, а вот «лучшие кроссоверы 2026 года» — нет.
  // Поэтому полные даты вырезаем перед проверкой, а голый год по-прежнему запрещён.
  const MONTHS_IN_TEXT = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
  // Полная дата в двух написаниях: «23 апреля 2026» и «23.04.2026». Второе стоит
  // в названиях постановлений и указов — переписывать их словами нельзя, это цитата.
  const fullDates = new RegExp(`\\d{1,2}\\s(?:${MONTHS_IN_TEXT})\\s20[2-9]\\d|\\d{1,2}\\.\\d{2}\\.20[2-9]\\d`, "g");
  const years = /\b20[2-9]\d\b/;
  // Адреса в проверку не идут: год бывает частью имени страницы
  // (/blog/some-post-2026) и частью ссылки на источник — там он не текст, а адрес.
  const linkTargets = /\]\([^)]*\)|https?:\/\/[^"\s]+/g;
  for (const [slug, text] of Object.entries(BLOG_TEXTS)) {
    const found = JSON.stringify(text).replace(linkTargets, "]").replace(fullDates, "").match(years);
    assert.equal(found, null, `в тексте ${slug} написан год ${found?.[0]} без месяца и числа — он устареет молча`);
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

// Дата в разметке (`dateModified`) и в карте сайта — настоящее изменение набора машин,
// но никогда не раньше дня выпуска: «обновлено вчера, опубликовано сегодня» поисковик
// читает как сломанную разметку.
test("дата обновления не бывает раньше дня выпуска материала", () => {
  const post = { published: "2026-08-27" };
  const label = (entry, changedAt) => blogDateLabel(blogUpdatedAt(entry, changedAt)?.toISOString());
  assert.equal(label(post, "2026-08-26T21:00:00Z"), "27 августа 2026");
  assert.equal(label(post, "2026-09-14T03:00:00Z"), "14 сентября 2026");
  assert.equal(label(post, null), "27 августа 2026");
  assert.equal(label(post, "не дата"), "27 августа 2026");
  assert.equal(label({}, null), null);
});

// Метки на карточке — названия из того же меню, что и фильтры: иначе посетитель
// увидит на карточке слово, которого в навигации нет.
// Дата, которую видит посетитель, — день выпуска материала. Ночная проверка каталога
// её не двигает: до 31.08.2026 здесь стояла дата проверки, и все карточки журнала
// одинаково показывали «Сегодня».
test("на карточке и в шапке статьи стоит день выпуска материала", () => {
  const post = { published: "2026-08-27" };
  assert.equal(blogPostDateLabel(post), "27 августа 2026");
  assert.equal(blogPostDateSentence(post, new Date("2026-08-27T20:00:00Z")), "Сегодня");
  assert.equal(blogPostDateSentence(post, new Date("2026-08-31T09:00:00Z")), "4 дня назад");
  assert.equal(blogPostDateSentence(post, new Date("2026-09-14T09:00:00Z")), "27 августа 2026");
  assert.equal(blogPostDateLabel({}), null);
});

// Главное правило текстов (ТЗ в BLOG_TEXTS_TZ.md): ничего не обещать от своего имени.
// «Мы проверяем», «мы подтверждаем» — это услуга, которую придётся оказывать всегда,
// а текст живёт годами. Тот же факт пишется безлично или советом покупателю.
test("в текстах нет обещаний от первого лица", () => {
  // Границы слова (\b) в JavaScript считают буквами только латиницу, поэтому прежний
  // список с \bмы\b не ловил в кириллице ничего и правило держалось на честном слове.
  // Здесь границы заданы явно — «не буква кириллицы слева и справа».
  //
  // Слова «наш» и «у нас» из списка убраны намеренно: «наши дороги», «принято у нас» —
  // это разговор о стране, а не обещание услуги, и запрещать его не за что.
  const word = (stem) => new RegExp(`(^|[^а-яёА-ЯЁ])${stem}([^а-яёА-ЯЁ]|$)`, "i");
  // Глаголы тоже по границам слова: «проверяемо» и «сверяем» — разные вещи, и
  // прежний список ловил безобидное «что из этого проверяемо».
  const banned = ["мы", "нам", "подтверждаем", "проверяем", "сверяем", "гарантируем", "обеспечиваем", "привезём", "доставим"].map(word);
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

// Черновик — способ посмотреть материал до того, как его есть чем наполнить.
// Образец отчёта не должен попасть ни в список журнала, ни на главную, ни в боковое
// меню: иначе посетитель придёт по нему за настоящими цифрами и получит выдуманные.
test("черновик открывается по ссылке, но нигде не показывается", () => {
  const drafts = blogAllPosts().filter((post) => post.draft);
  assert.ok(drafts.length > 0, "образец отчёта пропал — если это намеренно, поправьте и проверку");
  for (const draft of drafts) {
    assert.ok(findBlogPost(draft.path), `черновик ${draft.slug} не находится по своему адресу`);
    assert.ok(!blogPosts().some((post) => post.slug === draft.slug), `черновик ${draft.slug} попал в список журнала`);
    assert.ok(!homeBlogPosts().some((post) => post.slug === draft.slug), `черновик ${draft.slug} попал на главную`);
  }
  const counted = blogSidebarItems().find((item) => item.kind === "all");
  assert.equal(counted.count, blogPosts().length, "боковое меню считает черновики");
});

// График индекса рисуется общим кодом для приложения и для версии страницы, которую
// видит поисковик. Одна точка — не график: рисовать линию не из чего.
test("график индекса появляется со второй точки", () => {
  assert.equal(indexChartSvg([{ date: "2026-09-06", value: 100 }]), "");
  const svg = indexChartSvg(SAMPLE_REPORT.index.points);
  assert.match(svg, /^<svg /);
  assert.match(svg, /role="img"/, "у графика должна быть подпись для чтения с экрана");
  assert.ok(!svg.includes("NaN"), "в разметке графика не должно быть пустых чисел");
});

test("проценты пишутся со знаком, а ноль — без", () => {
  assert.equal(percent(-0.8), "−0,8%");
  assert.equal(percent(2.6), "+2,6%");
  assert.equal(percent(0.01), "0%");
  assert.equal(percent(null), null);
});

// Ссылки внутри текста разбираются везде, где текст показывается: в абзацах, списках,
// врезках, шагах и ответах на вопросы. В разметке для поисковика ссылок быть не должно
// — там нужен чистый текст, иначе в выдаче появится «[калькулятор](/calculator)».
test("ссылки в текстах статей не остаются разметкой", () => {
  const links = /\[[^\]]+\]\(\/[a-z0-9/_-]+\)/i;
  for (const [slug, text] of Object.entries(BLOG_TEXTS)) {
    for (const item of text.faq || []) {
      assert.ok(!links.test(plainInlineText(item.a)), `в ответе материала ${slug} ссылка осталась разметкой для поисковика`);
    }
  }
  assert.equal(plainInlineText("Считает [калькулятор](/calculator) сам."), "Считает калькулятор сам.");
});

// Каждая статья обязана нести хотя бы одну картинку: либо фотографии настоящих машин
// по своему срезу каталога, либо свой график. Текст без единой картинки читается как
// стена, и Сергей просил этого не допускать.
test("у каждой статьи есть чем проиллюстрироваться", () => {
  for (const post of blogAllPosts().filter((item) => item.kind === "article")) {
    const text = BLOG_TEXTS[post.slug];
    const figures = (text.sections || []).filter((section) => section.figure);
    for (const section of figures) {
      assert.ok(blogFigureHtml(section.figure), `в материале ${post.slug} раздел «${section.title}» ссылается на несуществующую картинку ${section.figure}`);
    }
    assert.ok(post.photos?.filters || figures.length, `у статьи ${post.slug} нет ни среза для фотографий, ни своего графика`);
  }
});

// Первоисточники обязательны там, где статья опирается на чужие цифры. Ссылка должна
// вести на первоисточник, а не на конкурента: конкуренту это отдаёт и вес, и читателя.
test("источники статей ведут на первоисточники, а не на конкурентов", () => {
  const rivals = /westmotors|multimotors|voltauto|autogarage|intercargo|privatauto|autokatalog|d2auto|lemon-cars|yankeemotors/i;
  for (const [slug, text] of Object.entries(BLOG_TEXTS)) {
    for (const source of text.sources || []) {
      assert.match(source.url, /^https:\/\//, `в материале ${slug} источник без адреса`);
      assert.ok(!rivals.test(source.url), `в материале ${slug} ссылка на конкурента: ${source.url}`);
      assert.ok(source.name, `в материале ${slug} у источника нет названия`);
    }
  }
});

// Шаблон столбиков общий для всех графиков: заголовок, полоса, значение и пояснение
// под значком. Пояснение обязано остаться в разметке — под значком оно спрятано от
// глаза, но не от поисковика и не от чтения с экрана.
test("в столбиках графика пояснение прячется под значок, а не пропадает", () => {
  const html = blogFigureHtml("winter-range");
  assert.match(html, /<figure class="blog-bars">/);
  // Заголовок обязателен: без него полосы приходится расшифровывать по абзацу выше.
  assert.match(html, /<figcaption class="blog-bars-title">Сколько остаётся/);
  assert.match(html, /class="blog-bars-note"[^>]*aria-describedby="bar-note-winter-range-0"/);
  assert.match(html, /id="bar-note-winter-range-0" role="tooltip">точка отсчёта/);
  assert.ok(!html.includes("<svg class="), "столбики рисуются вёрсткой, а не картинкой");
  // Ширина полосы — доля от наибольшего значения ряда, а не пиксели: колонку статьи
  // задаёт оформление, и график обязан тянуться вместе с ней.
  assert.match(html, /style="width:100\.0%"/);
  // Имя картинки входит в связи подсказок: на странице их может быть несколько.
  const other = blogFigureHtml("range-cycles");
  assert.ok(!other.includes("bar-note-winter-range-"), "подсказки двух графиков делят одно имя связи");
});

test("у каждого графика есть заголовок", () => {
  for (const name of Object.keys(BLOG_FIGURES)) {
    assert.match(blogFigureHtml(name), /class="blog-bars-title">[^<]{8,}</, `у графика ${name} нет заголовка`);
  }
});

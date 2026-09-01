// Журнал: подборки автомобилей и статьи. Разбор одной подборки — это три слоя:
//
//   1. Постоянный текст — кому подходит, на что смотреть, чем такая покупка
//      отличается от соседней. Цифр-однодневок в нём нет, поэтому он не устаревает.
//      Лежит отдельным файлом на подборку, см. `src/blog-texts/`.
//   2. Правило отбора — набор фильтров каталога. По нему собирается живой список
//      машин: и на странице, и в сборке для поисковика, и в ссылке «смотреть все».
//      Список каждый раз новый, потому что каталог живой.
//   3. Цифры в тексте — сколько машин в наличии, от какой суммы и с каким запасом
//      хода. Они считаются из каталога в момент показа, руками их никто не правит.
//
// Так подборка обновляется сама и у неё честная дата обновления. То же устройство
// уже работает у разделов каталога (`src/catalog-landings.js`) и обзоров моделей
// (`src/model-pages.js`).
//
// Чего здесь быть не должно: подборки, повторяющей готовый раздел каталога. Раздел
// «Электромобили» и подборка «электромобили BYD» встанут в выдаче друг против друга
// и просядут обе. Тема берётся из того, чего среди 159 разделов нет: задача (семья,
// город, дача), характеристика (запас хода, разгон, багажник), сезон.
//
// Раздел целиком закрыт выключателем `BLOG_ENABLED` (см. `src/feature-flags.js`),
// пока в нём мало материалов.

/** Общая страница журнала. */
export const BLOG_INDEX = Object.freeze({
  path: "/blog",
  name: "Журнал",
  h1: "Журнал abcars.by",
  // Заголовок и описание намеренно шире подборок: в журнале будут ещё статьи, новости,
  // разборы правил ввоза и лайфхаки, и переписывать метаданные под каждый новый раздел
  // не придётся. Слова, по которым сюда приходят, — «авто из Китая» и «Беларусь».
  seoTitle: "Журнал abcars.by: авто из Китая — подборки, статьи, новости",
  seoDescription: "Всё об автомобилях из Китая в одном месте: подборки под задачу и бюджет, разборы и статьи, новости рынка, правила ввоза и растаможки в Беларуси. Цифры и списки машин обновляются вместе с каталогом.",
  lead: "Подборки, статьи, новости и другое актуальное и интересное",
  listTitle: "Все материалы",
});

/**
 * Рубрики журнала. Пока материалов мало, отдельных адресов у рубрик нет: в боковом
 * меню они работают как оглавление и ведут к своей группе на общей странице. Когда
 * в рубрике наберётся десяток материалов, ей имеет смысл дать свой адрес.
 */
export const BLOG_RUBRICS = Object.freeze([
  { slug: "collections", name: "Подборки", description: "Готовые списки машин под задачу — с ценами до Минска." },
  { slug: "comparisons", name: "Сравнения", description: "Две модели рядом: чем отличаются и какую брать." },
  { slug: "articles", name: "Статьи", description: "Разборы: что выбрать, чем отличается, на что смотреть." },
  { slug: "news", name: "Новости", description: "Что изменилось на рынке и у нас в каталоге." },
  { slug: "law", name: "Законы", description: "Пошлины, квота, НДС и правила ввоза." },
  { slug: "tips", name: "Лайфхаки", description: "Мелочи, которые экономят деньги и нервы." },
]);

/**
 * Второй способ отобрать материалы — по типу машины, о которой они. Тип берётся из
 * правила отбора подборки, отдельным полем его не дублируем.
 */
export const BLOG_POWERTRAINS = Object.freeze([
  { slug: "electric", name: "Электромобили", powertrain: "Электромобиль" },
  { slug: "hybrid", name: "Гибриды", powertrain: "Гибрид" },
  { slug: "petrol", name: "Бензиновые", powertrain: "ДВС" },
]);

/**
 * Материалы журнала, новые сверху. `filters` — правило отбора машин; ключи те же,
 * что понимает каталог (см. `blogApiParams` и `blogCatalogHref` ниже).
 */
export const BLOG_POSTS = Object.freeze([
  // Сравнение двух моделей — второй вид материала (`kind: "duel"`). У него нет одного
  // правила отбора: вместо `filters` стоят `sides` — по стороне на модель, и каждая
  // сторона живёт своим срезом каталога. Всё остальное общее с подборкой: заголовки,
  // метки, дата по проверке каталога, похожие материалы.
  //
  // Почему сравнение не спорит с обзорами моделей: обзор отвечает «что это за машина»,
  // сравнение — «какую из двух брать». Запрос «Xiaomi SU7 или Tesla Model 3» ищут
  // отдельно от обеих моделей, и отвечать на него обзору нечем.
  {
    slug: "xiaomi-su7-vs-tesla-model-3",
    rubric: "comparisons",
    kind: "duel",
    // Название длиннее одной строки намеренно: на карточке оно занимает две строки,
    // как у подборок, и ряд не разъезжается по высоте.
    name: "Xiaomi SU7 или Tesla Model 3: что выбрать",
    h1: "Xiaomi SU7 или Tesla Model 3: что выбрать с доставкой в Минск",
    seoTitle: "Xiaomi SU7 или Tesla Model 3 — сравнение {year} | abcars.by",
    seoDescription: "Xiaomi SU7 или Tesla Model 3: чем отличаются батареи и запас хода, разгон, салон и электроника, что происходит с обеими зимой, на что смотреть при покупке из Китая и сколько каждая стоит под ключ в Минске. Наличие и цены обновляются вместе с каталогом.",
    lead: "Два электрических седана одних денег и совершенно разного характера: где между ними настоящая разница, а где только слова.",
    teaser: "Два электроседана одних денег: чем они правда отличаются.",
    published: "2026-08-27",
    // Типа двигателя в правиле отбора нет (у сравнения его вообще нет), поэтому метку
    // «Электромобили» дописываем слугом — иначе материал выпал бы из этого пункта меню.
    tags: ["electric"],
    // Порядок сторон — порядок в заголовке: слева то, что названо первым.
    //
    // `specs` — вторая половина таблицы: то, чего в каталоге нет и что от объявлений
    // не зависит. Данные открытые, производителей; строки одинаковые у обеих сторон
    // (мест, разъём) остаются — «одинаково и там, и там» такой же ответ, как разница.
    sides: [
      {
        brand: "Xiaomi",
        model: "SU7",
        name: "Xiaomi SU7",
        short: "SU7",
        review: "/models/xiaomi-su7",
        specs: {
          length: "4997 мм",
          wheelbase: "3000 мм",
          body: "Седан",
          // Багажник считаем целиком, вместе с передним отсеком: у обеих машин он есть,
          // и только так две цифры сравнимы между собой.
          trunk: "622 л",
          seats: "5",
          batteryWarranty: "8 лет / 160 000 км",
          plug: "GB/T",
        },
      },
      {
        brand: "Tesla",
        model: "Model 3",
        name: "Tesla Model 3",
        short: "Model 3",
        review: "/models/tesla-model-3",
        specs: {
          length: "4720 мм",
          wheelbase: "2875 мм",
          body: "Седан",
          trunk: "594 л",
          seats: "5",
          batteryWarranty: "8 лет / 160 000 км",
          plug: "GB/T",
        },
      },
    ],
  },
  {
    slug: "electric-range-700",
    rubric: "collections",
    kind: "collection",
    name: "Топ {top} электромобилей с запасом хода от 700 км",
    h1: "Топ {top} электромобилей из Китая с запасом хода от 700 километров",
    seoTitle: "Топ {top} электромобилей с запасом хода от 700 км — {year} | abcars.by",
    seoDescription: "Топ {top} электромобилей из Китая с паспортным запасом хода от 700 км: разные марки, цены с доставкой в Минск, сколько километров остаётся на трассе и зимой и докуда такой машины хватает по Беларуси.",
    lead: "{top} машин разных марок, которые зимой доезжают из Минска до областного центра без остановки на зарядку.",
    // Список в статье — десять машин разных марок. «Топ {top}» в заголовке берётся
    // отсюда же, поэтому число в заголовке и число карточек не могут разойтись.
    topSize: 10,
    teaser: "Паспортные километры, зимние потери и что из этого есть.",
    published: "2026-08-27",
    // Порог в 700 км выбран не «покрасивее»: 500 км по китайскому циклу сегодня есть
    // у большинства электромобилей каталога, и такая подборка повторяла бы раздел
    // «Электромобили». От 700 набирается около десятой части — это уже отбор.
    filters: { type: "Электромобиль", rangeMin: 700 },
    highlight: { field: "range", label: "по паспорту у самой дальнобойной" },
  },
  {
    slug: "acceleration-under-4",
    rubric: "collections",
    kind: "collection",
    name: "Самые быстрые: разгон до 4 секунд",
    h1: "Самые быстрые автомобили из Китая: разгон до 100 км/ч за 4 секунды",
    seoTitle: "Самые быстрые авто из Китая {year}: разгон до 4 секунд | abcars.by",
    seoDescription: "Подборка автомобилей из Китая с разгоном до сотни быстрее четырёх секунд: почему электромобили такие быстрые, чего это стоит в расходе и шинах, что есть в наличии и сколько стоит с доставкой в Минск.",
    lead: "Разгон, который десять лет назад был у суперкаров, — и что за него приходится платить в обычной жизни.",
    teaser: "Почему китайские электромобили такие быстрые и чего это стоит.",
    published: "2026-08-27",
    // Без ограничения по типу двигателя: в подборку попадают и электромобили, и
    // редкие быстрые бензиновые машины — так честнее показать весь верх каталога.
    filters: { accelMax: 4 },
    topSize: 10,
    highlight: { field: "accel", label: "разгон у самой быстрой машины" },
  },
  {
    slug: "almost-new",
    rubric: "collections",
    kind: "collection",
    name: "Почти новые: пробег до 10 000 км",
    h1: "Почти новые автомобили из Китая с пробегом до 10 000 км",
    seoTitle: "Почти новые авто из Китая {year} — пробег до 10 000 км | abcars.by",
    seoDescription: "Подборка почти новых автомобилей из Китая с пробегом до 10 000 километров: откуда они берутся на вторичном рынке, чем отличаются от новых, на что смотреть при выборе и сколько стоят с доставкой в Минск.",
    lead: "Машины, которые почти не ездили: откуда их столько на китайской вторичке и в чём разница с новой машиной из салона.",
    teaser: "Откуда столько машин без пробега и в чём разница с новой.",
    published: "2026-08-27",
    filters: { mileageMax: 10000 },
    topSize: 10,
    // Пробег: ради него подборка и собрана, по нему же строится список. Нулевой пробег
    // в объявлении — пробел в данных продавца, а не машина без единого километра,
    // поэтому ноль не считается за значение и такая машина уходит в конец списка.
    highlight: { field: "mileage", label: "наименьший пробег в подборке" },
  },
  {
    slug: "suv-under-20000",
    rubric: "collections",
    kind: "collection",
    name: "Топ {top} кроссоверов из Китая до 20 000 $",
    h1: "Топ {top} кроссоверов из Китая до 20 000 долларов под ключ в {year} году",
    seoTitle: "Топ {top} кроссоверов из Китая до 20 000 $ в {year} году | abcars.by",
    seoDescription: "Какие кроссоверы из Китая помещаются в 20 000 долларов вместе с доставкой, растаможкой и оформлением в Минске в {year} году: что попадает в этот бюджет, чем отличаются бензин, гибрид и электромобиль и на что смотреть.",
    lead: "Что реально помещается в двадцать тысяч вместе с доставкой, растаможкой и оформлением в Минске.",
    teaser: "Что помещается в двадцать тысяч вместе с доставкой.",
    published: "2026-08-27",
    // Двадцать тысяч — это итоговая сумма до Минска, а не цена продавца в Китае:
    // фильтр каталога считает ровно ту цифру, что стоит в карточке машины.
    filters: { bodyType: "SUV / кроссовер", landedMax: 20000 },
    topSize: 10,
    // Год: в бюджете до двадцати тысяч главный вопрос — насколько свежую машину
    // за эти деньги можно взять, поэтому список идёт от самых новых.
    highlight: { field: "year", label: "год самой свежей машины" },
  },

  // Четвёртый вид материала — обычная статья (`kind: "article"`). У неё нет ни правила
  // отбора, ни живого списка машин: это связный текст, который отвечает на вопрос
  // «объясни» или «помоги решить». Такие запросы наши разделы каталога и обзоры
  // моделей не закрывают вовсе — раздел показывает машины, обзор описывает модель,
  // а «стоит ли брать» и «сколько остаётся зимой» не отвечает никто.
  //
  // Что есть у статьи вместо списка:
  //   photos  — срез каталога, откуда берутся фотографии настоящих машин в текст.
  //             Это не правило отбора: по нему ничего не отбирается, кроме кадров,
  //             поэтому поле называется иначе, чем `filters` у подборки.
  //   figure  — свои графики внутри разделов (см. src/blog-figures.js).
  //   sources — первоисточники внизу. Всё про пошлины, НДС и замеры — только со
  //             ссылкой; придуманная цифра про деньги дороже любого трафика.
  //
  // Все пять пока черновики: Сергей смотрит шаблоны до публикации.
  {
    slug: "used-ev-worth-it",
    rubric: "articles",
    kind: "article",
    draft: true,
    name: "Стоит ли покупать китайский электромобиль с пробегом",
    h1: "Стоит ли покупать китайский электромобиль с пробегом в {year} году",
    seoTitle: "Стоит ли брать китайский электромобиль с пробегом в {year} | abcars.by",
    seoDescription: "Разбор без агитации: кому подходит китайский электромобиль с пробегом, что проверять перед покупкой, во что обходится владение в Беларуси и когда брать не стоит.",
    lead: "Разбор без агитации: кому такая машина подходит, кому нет и что проверить до того, как отдавать деньги.",
    teaser: "Кому подходит, кому нет и что проверить до покупки.",
    published: "2026-09-01",
    photos: { filters: { type: "Электромобиль", yearMin: 2022 } },
  },
  {
    slug: "ev-winter-belarus",
    rubric: "tips",
    kind: "article",
    draft: true,
    name: "Электромобиль зимой в Беларуси",
    h1: "Электромобиль зимой в Беларуси: сколько остаётся от паспортного запаса хода",
    seoTitle: "Электромобиль зимой в Беларуси: запас хода в мороз | abcars.by",
    seoDescription: "Сколько километров теряет электромобиль в беларускую зиму, почему это происходит, как считать запас хода на морозе и что помогает его сохранить.",
    lead: "Сколько километров съедает мороз, откуда берётся эта потеря и как считать запас хода, чтобы не остаться на трассе.",
    teaser: "Сколько километров съедает мороз и как их вернуть.",
    published: "2026-09-01",
    photos: { filters: { type: "Электромобиль", rangeMin: 500 } },
  },
  {
    slug: "hybrid-duty-2026",
    rubric: "law",
    kind: "article",
    draft: true,
    name: "Гибриды с генератором потеряли льготу",
    h1: "Гибриды с генератором потеряли льготу: что стало с ценой под ключ",
    seoTitle: "Пошлина на гибриды в Беларуси {year}: что изменилось | abcars.by",
    seoDescription: "С 2026 года последовательные гибриды исключены из льготы на ввоз: пошлина 15% и НДС 20%. Что это за машины, на сколько выросла цена под ключ и что делать покупателю.",
    lead: "С 2026 года машины, где бензиновый мотор крутит генератор, платят пошлину и НДС наравне со всеми. Что это значит в деньгах.",
    teaser: "Пошлина 15% и НДС 20%: что теперь стоит такая машина.",
    published: "2026-09-01",
    photos: { filters: { type: "Гибрид", yearMin: 2022 } },
  },
  {
    slug: "how-to-read-listing",
    rubric: "articles",
    kind: "article",
    draft: true,
    name: "Как читать китайское объявление",
    h1: "Как читать китайское объявление о продаже автомобиля",
    seoTitle: "Как читать объявление о продаже авто из Китая | abcars.by",
    seoDescription: "Что означают оценка кузова, число владельцев, страховые случаи и дата первой регистрации в китайском объявлении, что из этого проверяемо и на что смотреть в первую очередь.",
    lead: "Оценка кузова, владельцы, страховые случаи, дата регистрации: что в китайском объявлении значит правду, а что — ничего.",
    teaser: "Что в объявлении значит правду, а что ничего.",
    published: "2026-09-01",
    photos: { filters: { yearMin: 2022 } },
  },
  {
    slug: "range-cycles",
    rubric: "articles",
    kind: "article",
    draft: true,
    name: "CLTC, NEDC и WLTP: почему паспортные километры не совпадают с реальными",
    h1: "CLTC, NEDC и WLTP: почему по паспорту 700 км, а по факту 500",
    seoTitle: "CLTC, NEDC и WLTP — чем отличаются циклы запаса хода | abcars.by",
    seoDescription: "Чем отличаются циклы замера запаса хода CLTC, NEDC, WLTP и EPA, почему китайские цифры самые оптимистичные и как пересчитать паспортные километры в те, что получатся на дороге.",
    lead: "Три способа замерить одно и то же — и разница между ними до трети километров. Как пересчитать китайскую цифру в свою.",
    teaser: "Как пересчитать китайские километры в настоящие.",
    published: "2026-09-01",
    photos: { filters: { type: "Электромобиль", rangeMin: 600 } },
  },

  // Третий вид материала — отчёт по рынку (`kind: "report"`). У него нет ни правила
  // отбора, ни постоянных выводов: всё содержимое — посчитанные цифры из недельных
  // снимков цен. Отчёты выходят регулярно, поэтому у каждого своя неделя в заголовке.
  //
  // Это образец: снимков цен пока меньше двух, и считать не из чего. Поэтому запись
  // помечена черновиком — материал открывается по прямой ссылке, но его нет ни в
  // списке журнала, ни на главной, ни в карте сайта, а страница закрыта от поисковиков.
  // Когда снимки накопятся, образец заменяется настоящим отчётом, а пометка снимается.
  {
    slug: "market-report-sample",
    rubric: "news",
    kind: "report",
    draft: true,
    name: "Что происходит с ценами: отчёт за неделю",
    h1: "Китайские автомобили под ключ: что изменилось за неделю",
    seoTitle: "Цены на авто из Китая: отчёт за неделю | abcars.by",
    seoDescription: "Недельный отчёт по каталогу: индекс цены под ключ, какие модели подешевели и подорожали, остаток квоты на электромобили и новинки каталога.",
    lead: "Индекс цены под ключ, подешевевшие и подорожавшие модели, остаток квоты и новинки каталога — по нашей базе, неделя к неделе.",
    teaser: "Индекс цен, движение по моделям и остаток квоты за неделю.",
    published: "2026-09-01",
  },

]);

const RUBRIC_BY_SLUG = new Map(BLOG_RUBRICS.map((rubric) => [rubric.slug, rubric]));

/** Полный адрес материала. */
export const blogPostPath = (post) => `${BLOG_INDEX.path}/${post.slug}`;

// ── Год в заголовках ──────────────────────────────────────────────────────────
// «Топ кроссоверов до 20 000 $ в 2026 году» ищут гораздо чаще, чем то же самое без
// года, и в выдаче свежий год решает: страница с прошлогодним заголовком проигрывает
// даже при одинаковом содержании. Поэтому год не пишется в записи руками, а стоит
// подстановкой `{year}` и заменяется на текущий при отрисовке. Сайт пересобирается
// каждую ночь, значит первого января заголовки обновятся сами.
//
// В сам текст статьи год не пишем никогда: там он бы устарел молча, без пересборки.
const currentYear = () => new Date().getFullYear();
// `{top}` — сколько машин в списке. Пишется подстановкой, чтобы «Топ 10» в заголовке
// не разошёлся с числом карточек: их количество задаётся полем `topSize`.
const substitute = (value, year, top) =>
  typeof value === "string" ? value.replaceAll("{year}", String(year)).replaceAll("{top}", String(top ?? "")) : value;
const TEXT_FIELDS = ["name", "h1", "seoTitle", "seoDescription", "lead", "teaser"];

const withPath = (post, year = currentYear()) => {
  const filled = Object.fromEntries(TEXT_FIELDS.filter((field) => field in post).map((field) => [field, substitute(post[field], year, post.topSize)]));
  return { ...post, ...filled, path: blogPostPath(post), rubricName: RUBRIC_BY_SLUG.get(post.rubric)?.name || null };
};

/**
 * Все материалы, включая черновики. Нужно только сборке страниц: черновик тоже
 * получает свою страницу, иначе по прямой ссылке был бы честный 404.
 */
export const blogAllPosts = (year = currentYear()) => BLOG_POSTS.map((post) => withPath(post, year));

/**
 * Материалы журнала с проставленными адресами и годом — в порядке показа.
 *
 * Черновики (`draft: true`) сюда не попадают: их нет ни в списке журнала, ни на
 * главной, ни в боковом меню, ни в карте сайта, а страница закрыта от индексации.
 * Так показывается образец отчёта, пока считать его не из чего: посмотреть по
 * прямой ссылке можно, наткнуться на него случайно — нет.
 */
export const blogPosts = (year = currentYear()) => blogAllPosts(year).filter((post) => !post.draft);

/** Материал по адресу `/blog/<имя>` или `null`, если такого нет. */
export const findBlogPost = (path) => {
  const trimmed = String(path || "").replace(/\/+$/, "");
  const found = BLOG_POSTS.find((post) => blogPostPath(post) === trimmed);
  return found ? withPath(found) : null;
};

/** Есть ли в записи неподставленный год — нужно тесту. */
export const BLOG_YEAR_TOKEN = "{year}";
export const BLOG_TOP_TOKEN = "{top}";

/**
 * Сколько машин показывать списком в подборке, если у записи не сказано иначе.
 * Десять — минимум, при котором подборка выглядит подборкой, а не двумя примерами.
 */
export const BLOG_TOP_DEFAULT = 10;
export const blogTopSize = (post) => post?.topSize || BLOG_TOP_DEFAULT;

// ── Главная цифра и место в списке ────────────────────────────────────────────
// У каждой подборки своя главная цифра: у дальнобойных запас хода, у быстрых разгон.
// По ней и строится список, поэтому «Топ 10» означает настоящие первые десять, а не
// десять случайных машин.

// `name` — подпись над цифрой, `unit` — сама цифра, `top` — за что машина оказалась
// первой. Подпись и цифра не повторяют друг друга: в карточке они стоят одна под другой.
const HIGHLIGHT_FIGURES = Object.freeze({
  range: { name: "запас хода", top: "Самый большой запас хода в подборке", read: (car) => Number(car?.electricRange || car?.combinedRange || 0) || null, unit: (value) => `${groups(value)} км`, bigger: true },
  accel: { name: "разгон до 100 км/ч", top: "Самый быстрый разгон в подборке", read: (car) => Number(car?.acceleration) || null, unit: (value) => `${String(value).replace(".", ",")} с`, bigger: false },
  mileage: { name: "пробег", top: "Наименьший пробег в подборке", read: (car) => Number(car?.mileage) || null, unit: (value) => `${groups(value)} км`, bigger: false },
  year: { name: "год выпуска", top: "Самая свежая по году", read: (car) => Number(car?.year) || null, unit: (value) => String(value), bigger: true },
});

/** Главная цифра машины словами: «880 км», «3,2 с до 100 км/ч». */
export const blogCarFigure = (car, post = null) => {
  const rule = HIGHLIGHT_FIGURES[post?.highlight?.field];
  const value = rule?.read(car);
  return value ? { label: rule.name, value: rule.unit(value) } : null;
};

/**
 * Десять машин списка: сначала по одной на марку (иначе подборка получается про одну
 * модель), потом по главной цифре — чтобы первое место было настоящим первым. Без
 * главной цифры сортируем по цене: дешёвые впереди.
 */
export const blogTopCars = (cars, post) => {
  const rule = HIGHLIGHT_FIGURES[post?.highlight?.field];
  const chosen = blogOnePerBrand(cars, blogTopSize(post) * 3);
  const sorted = rule
    ? [...chosen].sort((a, b) => {
        const left = rule.read(a) ?? (rule.bigger ? -Infinity : Infinity);
        const right = rule.read(b) ?? (rule.bigger ? -Infinity : Infinity);
        return rule.bigger ? right - left : left - right;
      })
    : chosen;
  return sorted.slice(0, blogTopSize(post));
};

/**
 * Короткая причина, почему машина в списке. Считается по самому списку, руками не
 * пишется: состав меняется каждую ночь, и подписанная вручную причина через неделю
 * будет про другую машину. Говорим только то, что видно из данных.
 */
export const blogCarReason = (car, list = [], post = null, landedPrice = () => null) => {
  const rule = HIGHLIGHT_FIGURES[post?.highlight?.field];
  const others = list.filter((item) => item !== car);
  if (!others.length) return null;
  // Сравнение строгое: если у двух машин одинаковое значение, звание не получает
  // никто. Иначе «наименьший пробег в подборке» стояло бы у трёх карточек подряд —
  // читается как ошибка. Исключение — первая машина списка: она первая по построению.
  const best = (read, bigger) => {
    const own = read(car);
    if (own == null) return false;
    return others.every((item) => {
      const value = read(item);
      return value == null || (bigger ? own > value : own < value);
    });
  };
  const first = list[0] === car;
  const year = (item) => Number(item?.year) || null;
  const mileage = (item) => Number(item?.mileage) || null;
  const battery = (item) => Number(item?.battery) || null;
  if (rule && (first || best(rule.read, rule.bigger)) && rule.read(car) != null) return rule.top;
  if (best(landedPrice, false)) return "Самая доступная в подборке";
  if (best(year, true)) return "Самая свежая по году";
  if (best(mileage, false)) return "Наименьший пробег в подборке";
  if (best(battery, true)) return "Самая большая батарея в подборке";
  // Ничем не выделяется — тогда короткая справка вместо похвалы. Главную цифру в неё
  // не берём: она уже стоит в карточке отдельной строкой, и повторять её незачем.
  const range = (item) => Number(item?.electricRange || item?.combinedRange || 0) || null;
  const spare = {
    year: year(car) ? `${year(car)} год` : null,
    mileage: mileage(car) ? `пробег ${groups(mileage(car))} км` : null,
    range: range(car) ? `запас хода ${groups(range(car))} км` : null,
    battery: battery(car) ? `батарея ${String(battery(car)).replace(".", ",")} кВт·ч` : null,
  };
  const facts = ["year", "mileage", "range", "battery"]
    .filter((key) => key !== post?.highlight?.field && spare[key])
    .slice(0, 2)
    .map((key) => spare[key]);
  return facts.length ? facts.join(", ") : null;
};

/**
 * Характеристики машины для карточки в списке. Первой идёт та, ради которой собрана
 * подборка (запас хода, разгон), дальше — общие. Больше четырёх не показываем: карточка
 * должна читаться одним взглядом.
 */
export const blogCarFacts = (car, post = null) => {
  const number = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);
  const range = number(car?.electricRange) || number(car?.combinedRange);
  const battery = number(car?.battery);
  const accel = number(car?.acceleration);
  const facts = {
    range: range ? { label: "Запас хода", value: `${groups(range)} км` } : null,
    accel: accel ? { label: "Разгон", value: `${String(accel).replace(".", ",")} с` } : null,
    year: number(car?.year) ? { label: "Год", value: String(number(car.year)) } : null,
    mileage: number(car?.mileage) ? { label: "Пробег", value: `${groups(number(car.mileage))} км` } : null,
    battery: battery ? { label: "Батарея", value: `${String(battery).replace(".", ",")} кВт·ч` } : null,
    drive: car?.drive && !/не указан/i.test(car.drive) ? { label: "Привод", value: String(car.drive) } : null,
  };
  const lead = post?.highlight?.field;
  const order = [...(lead && facts[lead] ? [lead] : []), "year", "mileage", "range", "battery", "accel", "drive"];
  const chosen = [];
  for (const key of order) {
    if (facts[key] && !chosen.includes(facts[key])) chosen.push(facts[key]);
    if (chosen.length === 4) break;
  }
  return chosen;
};

// ── Сравнение двух моделей ────────────────────────────────────────────────────
// У сравнения вместо одного правила отбора две стороны, и у каждой свой срез каталога:
// «все Xiaomi SU7» и «все Tesla Model 3». Дальше всё считается из этих двух срезов —
// и таблица различий, и фотографии, и списки машин. Руками в таблицу ничего не пишется:
// цены и наличие меняются каждую ночь, а написанная цифра осталась бы прошлогодней.

/** Стороны сравнения с готовым правилом отбора у каждой. */
export const blogPostSides = (post) =>
  (post?.sides || []).map((side, index) => ({ ...side, index, filters: { brand: side.brand, model: side.model } }));

/**
 * Все правила отбора материала: у подборки одно, у сравнения по одному на сторону.
 * Нужно проверкам и сборке страниц для поисковика — чтобы обходить материалы одним
 * кодом, не разбирая, какой это вид.
 */
export const blogFilterSets = (post) => (post?.sides?.length ? blogPostSides(post).map((side) => side.filters) : [post?.filters || {}]);

/**
 * Строки таблицы различий. На вход — то, что удалось узнать из каталога по каждой
 * стороне; чего каталог не отдал, то в строке остаётся прочерком, а звание лучшей
 * никому не достаётся. Сравнение строгое: при равных значениях никто не выигрывает,
 * иначе подсветка врёт.
 */
// Названия строк — одно-два слова, не длиннее: таблицу читают глазами по колонкам,
// и длинная подпись слева ломает этот бег. Что значит «Цена от» и почему запас хода
// именно такой, сказано одной строкой под таблицей, а не у каждой строки.
const DUEL_ROWS = Object.freeze([
  { key: "total", label: "В наличии", read: (data) => data?.total, format: (value) => `${groups(value)} ${plural(value, "машина", "машины", "машин")}`, better: null },
  // Цена — единственная строка, которую печатает не этот файл: её показывают в валюте,
  // выбранной посетителем, поэтому наружу отдаётся само число.
  { key: "price", label: "Цена от", money: true, better: "less" },
  { key: "years", label: "Годы выпуска", read: (data) => (data?.yearMin && data?.yearMax ? [data.yearMin, data.yearMax] : null), format: ([from, to]) => (from === to ? String(from) : `${from}–${to}`), better: null },
  { key: "mileage", label: "Пробег от", read: (data) => data?.mileageMin, format: (value) => `${groups(value)} км`, better: "less" },
  { key: "range", label: "Запас хода", read: (data) => data?.rangeMax, format: (value) => `${groups(value)} км`, better: "more" },
  { key: "battery", label: "Батарея", read: (data) => data?.batteryMax, format: (value) => `${decimal(value)} кВт·ч`, better: "more" },
  { key: "power", label: "Мощность", read: (data) => data?.powerMax, format: (value) => `${groups(value)} л. с.`, better: "more" },
  { key: "torque", label: "Момент", read: (data) => data?.torqueMax, format: (value) => `${groups(value)} Н·м`, better: "more" },
  { key: "accel", label: "Разгон", read: (data) => data?.accelMin, format: (value) => `${decimal(value)} с`, better: "less" },
]);

export const BLOG_DUEL_ROW_KEYS = Object.freeze(DUEL_ROWS.map((row) => row.key));

/**
 * Вторая половина таблицы — паспорт модели: то, что не зависит от объявлений и в
 * каталоге не лежит (габариты, багажник, гарантия на батарею у производителя). Строки
 * пишутся в самом материале, полем `specs` у стороны, и берутся из открытых данных
 * производителей — поэтому под таблицей стоит оговорка, откуда они.
 *
 * Одинаковые значения с обеих сторон — это нормально: «мест пять и там, и там» такой
 * же ответ, как разница в цифрах, и его тоже приходят посмотреть.
 */
const DUEL_SPEC_ROWS = Object.freeze([
  { key: "length", label: "Длина" },
  { key: "wheelbase", label: "Колёсная база" },
  { key: "body", label: "Кузов" },
  { key: "trunk", label: "Багажник" },
  { key: "seats", label: "Мест" },
  { key: "batteryWarranty", label: "Гарантия" },
  { key: "plug", label: "Разъём" },
]);

export const BLOG_DUEL_SPEC_KEYS = Object.freeze(DUEL_SPEC_ROWS.map((row) => row.key));

/** Одна строка таблицы: значения по сторонам и кто из них лучше (или никто). */
const duelRow = ({ key, label, best = null, values }) => ({ key, label, best, values });

/**
 * Таблица различий по данным сторон. `data` — массив по стороне: сводка из каталога
 * (`total`, `yearMin`, `rangeMax`, …) плюс посчитанная цена `priceFromUsd`. Пустая
 * строка (ни у одной стороны нет значения) в таблицу не попадает: пустой ряд читается
 * как поломка.
 */
export const blogDuelRows = (data = []) =>
  DUEL_ROWS.map((row) => {
    const values = data.map((side) => {
      const raw = row.read ? row.read(side) : side?.priceFromUsd;
      if (Array.isArray(raw)) return raw.every((value) => Number.isFinite(Number(value))) ? raw.map(Number) : null;
      const value = Number(raw);
      return Number.isFinite(value) && value > 0 ? value : null;
    });
    if (!values.some((value) => value != null)) return null;
    // Сравнение строгое: при равных значениях звания лучшей не получает никто, иначе
    // подсветка врёт. Сравниваем только когда обе стороны отдали число.
    let best = null;
    if (row.better && values.every((value) => typeof value === "number")) {
      const target = row.better === "less" ? Math.min(...values) : Math.max(...values);
      if (values.filter((value) => value === target).length === 1) best = values.indexOf(target);
    }
    return duelRow({
      key: row.key,
      label: row.label,
      best,
      // `money` — знак того, что значение печатает вёрстка: в рублях или в долларах,
      // как выбрал посетитель.
      values: values.map((value) => (value == null ? null : row.money ? { money: value } : { text: row.format(value) })),
    });
  }).filter(Boolean);

/** Вторая половина таблицы: паспортные строки материала, как они написаны. */
export const blogDuelSpecRows = (sides = []) =>
  DUEL_SPEC_ROWS.map((row) => {
    const values = sides.map((entry) => (entry?.specs || entry?.side?.specs || {})[row.key] || null);
    if (!values.some(Boolean)) return null;
    return duelRow({ key: row.key, label: row.label, values: values.map((value) => (value ? { text: value } : null)) });
  }).filter(Boolean);

// ── Боковое меню ──────────────────────────────────────────────────────────────
// Два способа сузить журнал: по типу машины и по разделу. Пункты перечислены все,
// даже пустые — так видно, что в журнале будет дальше. Пустой пункт не кликается
// и помечен как «пока пусто»: ссылка в никуда хуже, чем честно серый пункт.

/** Подходит ли материал под пункт меню. */
const matchesBlogFilter = (post, filter) => {
  if (!filter || filter.kind === "all") return true;
  if (filter.kind === "rubric") return post.rubric === filter.slug;
  if (filter.kind === "powertrain") return post.filters?.type === filter.powertrain;
  return true;
};

/**
 * Метки материала — те же названия, что в боковом меню: раздел, к которому он отнесён,
 * и тип машины, если подборка отбирает машины по нему. Меток может быть несколько.
 * Дописать материалу метку сверх выведенных можно полем `tags` со слугами из тех же
 * двух списков — на случай, когда статья про законы заодно и про гибриды.
 */
export const blogPostTags = (post) => {
  const known = [...BLOG_RUBRICS.map((entry) => ({ kind: "rubric", ...entry })), ...BLOG_POWERTRAINS.map((entry) => ({ kind: "powertrain", ...entry }))];
  const tags = [];
  const add = (tag) => {
    if (tag && !tags.some((chosen) => chosen.slug === tag.slug)) tags.push({ kind: tag.kind, slug: tag.slug, name: tag.name });
  };
  add(known.find((entry) => entry.kind === "rubric" && entry.slug === post?.rubric));
  add(known.find((entry) => entry.kind === "powertrain" && entry.powertrain === post?.filters?.type));
  for (const slug of post?.tags || []) add(known.find((entry) => entry.slug === slug));
  return tags;
};

/**
 * Похожие материалы: сначала из того же раздела, потом про тот же тип машин, дальше
 * остальные. Сам материал в список не попадает. Пока журнал маленький, это фактически
 * «остальные материалы», но порядок уже правильный — с ростом журнала подбор не
 * придётся переписывать.
 */
export const blogRelatedPosts = (post, limit = 3) => {
  const others = blogPosts().filter((item) => item.slug !== post?.slug);
  const weight = (item) => {
    if (item.rubric === post?.rubric) return 0;
    if (item.filters?.type && item.filters.type === post?.filters?.type) return 1;
    return 2;
  };
  return others.sort((left, right) => weight(left) - weight(right)).slice(0, limit);
};

/**
 * Материалы журнала про эту модель — для страницы обзора. Пока это сравнения: у них
 * стороны названы моделями, и читателю обзора «Xiaomi SU7» нужен именно ответ на
 * вопрос «или всё-таки Model 3». Подборки сюда не попадают: их состав меняется каждую
 * ночь, и материал, который вчера был про эту модель, сегодня уже про другую. Если
 * подборка написана про конкретные модели, их перечисляют полем `models` адресами
 * обзоров.
 */
export const blogPostsForModel = (modelPath, limit = 3) => {
  const wanted = String(modelPath || "").replace(/\/+$/, "");
  if (!wanted) return [];
  return blogPosts()
    .filter((post) => (post.sides || []).some((side) => side.review === wanted) || (post.models || []).includes(wanted))
    .slice(0, limit);
};

/** Материалы под выбранным пунктом меню. Без выбора — все. */
export const blogPostsFor = (filter) => blogPosts().filter((post) => matchesBlogFilter(post, filter));

/**
 * Пункты бокового меню одним списком: «Все материалы», затем типы машин, затем
 * разделы. Заголовков групп нет намеренно — для десятка пунктов они только удлиняют
 * меню, а выбирается всё равно один.
 */
export const blogSidebarItems = () => {
  const posts = blogPosts();
  const count = (filter) => posts.filter((post) => matchesBlogFilter(post, filter)).length;
  const item = (kind, entry) => {
    const filter = { kind, slug: entry.slug, name: entry.name, powertrain: entry.powertrain || null };
    return { ...filter, count: count(filter) };
  };
  return [
    { kind: "all", slug: "all", name: "Все материалы", powertrain: null, count: posts.length },
    ...BLOG_POWERTRAINS.map((entry) => item("powertrain", entry)),
    ...BLOG_RUBRICS.map((entry) => item("rubric", entry)),
  ];
};

/**
 * Материалы для главной. Блок там один — «Журнал», — и в нём всё подряд: и подборки,
 * и сравнения, одинаковыми карточками. Отдельные блоки по видам материалов пробовали
 * 27.08.2026 и отказались: главная не оглавление журнала, а витрина, и два похожих
 * блока подряд читаются как повтор.
 *
 * Ровно четыре: пятая карточка уводит первый экран каталога слишком далеко вниз. Пока
 * материалов меньше, сетка сжимается сама.
 */
export const HOME_BLOG_LIMIT = 4;
export const homeBlogPosts = () => blogPosts().slice(0, HOME_BLOG_LIMIT);

// ── Правило отбора ────────────────────────────────────────────────────────────
// Один и тот же набор фильтров нужен в двух видах: запросом к каталогу (`/api/cars`)
// и адресом страницы каталога (`/catalog?…`). Названия ключей у них разные — кузов
// в запросе `bodyType`, а в адресе `body`; тип двигателя в запросе стоит в
// единственном числе, а в адресе во множественном. Из-за такого расхождения раздел
// каталога однажды молча показывал весь каталог, поэтому перевод собран в одном
// месте и проверяется тестом.

const POWERTRAIN_FILTER_LABEL = { "Электромобиль": "Электромобили", "Гибрид": "Гибриды", "ДВС": "Бензин" };

/**
 * Фильтры, которые правило отбора умеет переводить в оба вида. Написанный мимо этого
 * списка фильтр молча ничего не отберёт, поэтому за список следит тест.
 */
export const BLOG_FILTER_KEYS = Object.freeze([
  "brand", "model", "type", "bodyType", "drive", "yearMin", "mileageMax", "landedMin", "landedMax", "rangeMin", "batteryMin", "accelMax",
]);

// Порядок машин в подборке. Не «в разнобой» и не по дате: и то и другое меняет
// список при каждой перезагрузке, а вместе с ним и обложку подборки на главной —
// страница выглядит так, будто её подменили. Здесь перемешивание с постоянным
// зерном: порядок случайный на вид, но один и тот же, пока машины в наличии.
// Уходит из списка только то, что продали.
export const blogListParams = (post, limit) => blogApiParams(post, { sort: "default", seed: post.slug, limit });

/**
 * Сколько машин запрашиваем, чтобы набрать список из разных марок. Берём с запасом
 * и отбрасываем повторы марок: подборка из десяти машин, где половина одной марки,
 * подборкой не выглядит.
 */
export const BLOG_TOP_POOL = 60;

/** Одна машина на марку, в том же постоянном порядке. */
export const blogOnePerBrand = (cars, limit) => {
  const seen = new Set();
  const chosen = [];
  for (const car of cars || []) {
    const brand = String(car?.brand || "").toLowerCase();
    if (!brand || seen.has(brand)) continue;
    seen.add(brand);
    chosen.push(car);
    if (chosen.length >= limit) break;
  }
  return chosen;
};

/** Фильтры подборки для запроса к каталогу `/api/cars`. */
export const blogApiParams = (post, extra = {}) => {
  const filters = post?.filters || {};
  const params = new URLSearchParams();
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.model) params.set("model", filters.model);
  if (filters.type) params.set("type", filters.type);
  if (filters.bodyType) params.set("bodyType", filters.bodyType);
  // Привод добавлен 01.09.2026: полный привод — обычное требование покупателя
  // в наших условиях, а подборки его отобрать не умели.
  if (filters.drive) params.set("drive", filters.drive);
  if (filters.yearMin) params.set("yearMin", String(filters.yearMin));
  if (filters.mileageMax) params.set("mileageMax", String(filters.mileageMax));
  if (filters.landedMin) params.set("landedMin", String(filters.landedMin));
  if (filters.landedMax) params.set("landedMax", String(filters.landedMax));
  if (filters.rangeMin) params.set("rangeMin", String(filters.rangeMin));
  if (filters.batteryMin) params.set("batteryMin", String(filters.batteryMin));
  if (filters.accelMax) params.set("accelMax", String(filters.accelMax));
  for (const [key, value] of Object.entries(extra)) if (value != null) params.set(key, String(value));
  return params;
};

/** Те же фильтры адресом каталога: подписи такие же, как в выпадающих списках. */
export const blogCatalogHref = (post) => {
  const filters = post?.filters || {};
  const params = new URLSearchParams();
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.model) params.set("model", filters.model);
  if (filters.type) params.set("type", POWERTRAIN_FILTER_LABEL[filters.type] || filters.type);
  if (filters.bodyType) params.set("body", filters.bodyType);
  if (filters.drive) params.set("drive", filters.drive);
  if (filters.yearMin) params.set("yearFrom", String(filters.yearMin));
  if (filters.mileageMax) params.set("mileage", `до ${String(filters.mileageMax).replace(/\B(?=(\d{3})+$)/g, " ")} км`);
  if (filters.landedMin) params.set("priceFrom", String(filters.landedMin));
  if (filters.landedMax) params.set("priceTo", String(filters.landedMax));
  if (filters.rangeMin) params.set("range", `От ${filters.rangeMin} км`);
  if (filters.batteryMin) params.set("battery", `От ${filters.batteryMin} кВт·ч`);
  if (filters.accelMax) params.set("accel", `До ${filters.accelMax} с`);
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
};

// ── Цифры в тексте ────────────────────────────────────────────────────────────
// Полоса цифр под вступлением. Считается из каталога, а не пишется руками: иначе
// «в наличии 42» останется висеть на странице через месяц после того, как машин
// стало восемь. Чего не знаем — того не показываем: пустая плитка честнее выдуманной.

/**
 * Дата словами: «27 августа 2026». Принимает и просто день («2026-08-27»), и полное
 * время из базы — датой обновления служит момент последней проверки каталога.
 */
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const blogDateAt = (value) => {
  if (!value) return null;
  const text = String(value);
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
};
export const blogDateLabel = (value) => {
  const date = blogDateAt(value);
  if (!date) return null;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
};

/**
 * Дата материала — день, когда он вышел. Её видит посетитель: на карточке журнала и
 * строкой над заголовком статьи.
 *
 * Раньше на этом месте стояла дата последней проверки каталога, и все карточки
 * журнала одинаково показывали «Сегодня»: ночная проверка трогает все объявления
 * разом, поэтому такая дата ничего не говорит о самом материале и читается как
 * заглушка. Свежесть наличия и цен — отдельный факт, он пишется подписью над списком
 * машин (`blogFreshnessLabel`).
 */
export const blogPostDateLabel = (post) => blogDateLabel(post?.published);

/** Та же дата по-человечески: «сегодня», «4 дня назад», дальше — числом. */
export const blogPostDateSentence = (post, now = new Date()) => blogRelativeDateSentence(post?.published, now);

/**
 * Когда содержимое материала правда менялось: берём настоящее изменение набора машин
 * (`changedAt` из базы — цена, пробег, фотографии или новая машина в наборе), а не
 * «последнюю проверку»: проверка идёт каждую ночь по всему каталогу и одинакова у
 * всех наборов. Раньше дня выпуска материала эта дата быть не может: «обновлено
 * вчера, опубликовано сегодня» поисковик читает как сломанную разметку. Каталог не
 * ответил — остаётся дата выпуска: выдумывать свежесть нельзя, а совсем без даты
 * страница выглядит брошенной.
 *
 * Отсюда `dateModified` в разметке статьи и `lastmod` в карте сайта.
 */
export const blogUpdatedAt = (post, catalogChangedAt = null) => {
  const published = post?.published ? new Date(`${post.published}T00:00:00Z`) : null;
  const changed = catalogChangedAt ? new Date(catalogChangedAt) : null;
  const valid = [published, changed].filter((date) => date && !Number.isNaN(date.getTime()));
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map((date) => date.getTime())));
};

/**
 * Подпись над живым списком машин: «наличие и цены обновлены такого-то числа». Та же
 * подпись стоит в разделах каталога и в обзорах моделей, и берётся из того же места —
 * последнего настоящего изменения среди машин набора.
 */
export const blogFreshnessLabel = (catalogChangedAt) => blogDateLabel(catalogChangedAt);

/**
 * Дата словами по-человечески: «сегодня», «вчера», «5 дней назад», а дальше обычная
 * дата. Неделя — разумная граница: до неё важно «насколько свежо», после неё уже
 * важнее «когда именно».
 *
 * Считается от переданного «сейчас», поэтому в приложении фраза всегда верна: её
 * пересчитывает браузер при открытии страницы. В версии для поисковика оставляем
 * обычную дату — она не может устареть, даже если сборка однажды не пройдёт.
 */
export const blogRelativeDate = (value, now = new Date()) => {
  const date = blogDateAt(value);
  if (!date) return null;
  const day = (moment) => Date.UTC(moment.getUTCFullYear(), moment.getUTCMonth(), moment.getUTCDate());
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days <= 7) return `${days} ${plural(days, "день", "дня", "дней")} назад`;
  return blogDateLabel(date.toISOString());
};

/** Та же фраза с большой буквы — для карточки, где она стоит сама по себе. */
export const blogRelativeDateSentence = (value, now = new Date()) => {
  const text = blogRelativeDate(value, now);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : null;
};

const decimal = (value) => String(Number(value)).replace(".", ",");
const groups = (value) => String(Math.round(value)).replace(/\B(?=(\d{3})+$)/g, " ");
const plural = (count, one, few, many) => {
  const value = Math.abs(Math.floor(Number(count) || 0));
  if (value % 100 >= 11 && value % 100 <= 14) return many;
  if (value % 10 === 1) return one;
  if (value % 10 >= 2 && value % 10 <= 4) return few;
  return many;
};

/**
 * Третья цифра в полосе у каждой подборки своя: у дальнобойных это запас хода,
 * у быстрых — разгон, у почти новых — пробег. Здесь описано, у какой машины подборки
 * её брать (`sort`), где она лежит в карточке (`read`) и как её писать (`format`).
 * Сама подпись — в записи подборки, полем `highlight.label`.
 */
const HIGHLIGHT_FIELDS = Object.freeze({
  range: {
    sort: "range_desc",
    read: (car) => Number(car?.electricRange || car?.combinedRange || 0) || null,
    format: (value) => `до ${groups(value)} км`,
  },
  accel: {
    sort: "accel_asc",
    read: (car) => Number(car?.acceleration) || null,
    format: (value) => `от ${String(value).replace(".", ",")} с`,
  },
  mileage: {
    sort: "mileage_asc",
    read: (car) => Number(car?.mileage) || null,
    format: (value) => `от ${groups(value)} км`,
  },
  year: {
    sort: "year_desc",
    read: (car) => Number(car?.year) || null,
    format: (value) => `${value} год`,
  },
});

export const BLOG_HIGHLIGHT_FIELDS = Object.freeze(Object.keys(HIGHLIGHT_FIELDS));

/** Как отсортировать каталог, чтобы нужная машина оказалась первой, или `null`. */
export const blogHighlightSort = (post) => HIGHLIGHT_FIELDS[post?.highlight?.field]?.sort || null;

/** Третья цифра подборки по найденной машине, или `null`, если её не из чего взять. */
export const blogHighlight = (post, car) => {
  const rule = HIGHLIGHT_FIELDS[post?.highlight?.field];
  if (!rule || !car) return null;
  const value = rule.read(car);
  return value ? { value: rule.format(value), label: post.highlight.label } : null;
};

/**
 * Полоса цифр подборки. На вход — то, что удалось узнать из каталога:
 * `total` (сколько машин подходит), `priceFromUsd` (самая доступная сумма до Минска)
 * и `highlight` (своя цифра подборки). Любое из них может отсутствовать: чего каталог
 * не отдал, того в полосе нет — пустая плитка честнее выдуманной.
 */
export const blogPostStats = ({ total = null, priceFromUsd = null, highlight = null } = {}) =>
  [
    total ? { value: groups(total), label: plural(total, "автомобиль в наличии", "автомобиля в наличии", "автомобилей в наличии") } : null,
    priceFromUsd ? { value: `от ${groups(priceFromUsd)} $`, label: "с доставкой и оформлением в Минске" } : null,
    highlight,
  ].filter(Boolean);

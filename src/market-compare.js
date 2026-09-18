// Сравнение цен: та же машина в Беларуси и та же машина, привезённая из Китая.
//
// Зачем. Человеку не нужна наша цена сама по себе — ему нужна разница. «Такая же тут
// стоит 34 900, а привезти выходит 26 400» отвечает на вопрос, ради которого он вообще
// открыл сайт. Ни у одного конкурента такого сравнения нет.
//
// Откуда обе половины:
//   • белорусская — свод объявлений с местных площадок, его собирает `npm run market`
//     (см. scripts/market-belarus.mjs); чужие объявления мы не храним и не показываем,
//     только «сколько предложений и какая середина цены». В текстах на сайте площадку
//     по имени не называем: она нам ничего не должна, а лишнее внимание ей ни к чему;
//   • наша — середина цены под ключ по нашему же каталогу (`modelPriceMedians`
//     в server/repository.mjs).
//
// Три правила, без которых сравнение было бы враньём:
//
// 1. Сравниваем один и тот же год выпуска. Средняя цена «всех BYD Han» ничего не
//    значит: у нас машины 2021–2023, а на площадке могут стоять только свежие.
// 2. Сравниваем середины, а не «от». Самая дешёвая машина модели — почти всегда битая
//    или с огромным пробегом; сравнение «от» и «от» всегда выходило бы в нашу пользу.
// 3. Набор меньше трёх предложений не берём вовсе: по двум объявлениям середины нет.
//
// Год выбираем тот, где на белорусском рынке больше всего предложений: это и самый
// представительный срез, и самый полезный человеку.

/** Название модели без регистра, пробелов и знаков: «Song PLUS DM-i» → «songplusdmi». */
export const normalizeModel = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");

// Хвосты, которыми площадки помечают версию силовой установки. У нас и у них они
// пишутся по-разному («Song PLUS DM-i» против «Song Plus DM»), но означают одно и то
// же, поэтому при сравнении отбрасываем — иначе одна и та же машина не нашлась бы.
const POWERTRAIN_SUFFIX = /(dmi|dmp|dm|phev|hev|ev|bev|i)$/;
const baseModel = (name) => normalizeModel(name).replace(POWERTRAIN_SUFFIX, "");

// Марки, у которых буква «L» в конце названия означает удлинённый кузов для Китая:
// Audi A6L, BMW 3 Li, Mercedes E L. В Беларуси такие машины продаются под обычным
// именем — «Audi A6», — и без этого правила самая массовая часть каталога (1 363
// машины A6L против 83 обычных A6) не сравнивалась ни с чем.
//
// Список закрытый и только из европейских марок. У китайских марок «L» — это другая
// модель, а не длина: BYD Han L, Tang L и Song L к обычным Han, Tang и Song отношения
// не имеют, и склеивать их нельзя.
const LONG_WHEELBASE_BRANDS = new Set([
  "Audi", "BMW", "Mercedes-Benz", "Volkswagen", "Volvo", "Buick", "Cadillac", "Lincoln", "Skoda",
]);
const isLongVersion = (brand, model) => LONG_WHEELBASE_BRANDS.has(brand) && /l$/i.test(String(model || "").trim()) && String(model).trim().length > 2;
const shortModel = (name) => normalizeModel(name).replace(/l$/, "");

/**
 * Свод площадки → таблица «модель+год → цены».
 * Ключи в файле выглядят как «Song Plus EV|2023»; пустой год — свод по всей модели.
 */
function marketIndex(brands) {
  const index = new Map();
  for (const [brand, buckets] of Object.entries(brands || {})) {
    for (const [key, stats] of Object.entries(buckets)) {
      const [model, year] = key.split("|");
      if (!year) continue;
      const put = (modelKey) => {
        const full = `${brand}|${modelKey}|${year}`;
        // Если после отбрасывания хвоста в один ключ попали две версии, берём ту,
        // где предложений больше: середина по ней надёжнее.
        const known = index.get(full);
        if (!known || known.count < stats.count) index.set(full, { ...stats, model, brand, year: Number(year) });
      };
      put(normalizeModel(model));
      put(baseModel(model));
    }
  }
  return index;
}

/**
 * Строки сравнения.
 *
 * @param {object} input
 * @param {Array} input.ours    — [{brand, model, year, count, median}] из нашего каталога
 * @param {object} input.market — разобранный файл свода площадки
 * @param {number} input.limit  — сколько строк оставить
 */
export function compareRows({ ours = [], market = null, limit = 40 } = {}) {
  if (!market?.brands) return [];
  const index = marketIndex(market.brands);
  const found = [];
  for (const row of ours) {
    if (!row?.median || !row?.year) continue;
    const long = isLongVersion(row.brand, row.model);
    const theirs = index.get(`${row.brand}|${normalizeModel(row.model)}|${row.year}`)
      || index.get(`${row.brand}|${baseModel(row.model)}|${row.year}`)
      || (long ? index.get(`${row.brand}|${shortModel(row.model)}|${row.year}`) : null);
    if (!theirs || theirs.onlyNew) continue;
    // Каждый год — своя строка. Раньше по модели оставался один год, самый
    // представительный на местном рынке, и это скрывало главное: Audi A6 2022-го и
    // 2025-го — разные машины с разной выгодой, и у одной она может быть, а у
    // другой нет. Строк получается больше, но для того в таблице и есть поиск.
    found.push({
      brand: row.brand,
      model: row.model,
      year: row.year,
      ourMedian: Math.round(row.median),
      ourCount: row.count,
      theirMedian: Math.round(theirs.median),
      theirLow: Math.round(theirs.low),
      theirCount: theirs.count,
      // Признак для подписи в таблице: сравнивается длиннобазная китайская версия
      // с обычной европейской. Разница в длине заметная, и умалчивать о ней нельзя.
      longVersion: long && normalizeModel(row.model) !== normalizeModel(theirs.model),
      diff: Math.round(theirs.median - row.median),
      diffPercent: Math.round(((theirs.median - row.median) / theirs.median) * 100),
    });
  }
  return found
    // Сначала то, где у нас больше выбора: строка про модель с тремя машинами
    // интересна меньше, чем про модель с тремя сотнями.
    .sort((left, right) => right.ourCount - left.ourCount)
    .slice(0, limit);
}

/** Короткий вывод под таблицей: на скольких моделях дешевле и насколько. */
export function compareSummary(rows) {
  if (!rows.length) return null;
  const cheaper = rows.filter((row) => row.diff > 0);
  const percents = cheaper.map((row) => row.diffPercent).sort((left, right) => left - right);
  const middle = percents.length ? percents[Math.floor(percents.length / 2)] : 0;
  return {
    models: rows.length,
    cheaper: cheaper.length,
    dearer: rows.length - cheaper.length,
    // Середина разницы считается только по тем моделям, где привозить дешевле:
    // смешивать в одно число выигрыш и проигрыш бессмысленно — получилась бы
    // «средняя температура», которая не отвечает ни на один вопрос.
    medianPercent: middle,
    bestSaving: cheaper.reduce((top, row) => (row.diff > (top?.diff || 0) ? row : top), null),
  };
}

/** Таблица для страницы: те же строки, но словами. */
export function compareTable(rows, { collectedAt = null, hidden = 0 } = {}) {
  const money = (value) => `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} $`;
  // «Машины», а не «предложения»: на странице речь везде о машинах, и два разных
  // слова для одного и того же читались бы как разные величины.
  const cars = (count) => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    const word = mod10 === 1 && mod100 !== 11 ? "машина" : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? "машины" : "машин";
    return `${new Intl.NumberFormat("ru-RU").format(count)} ${word}`;
  };
  const date = collectedAt
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Minsk" }).format(new Date(collectedAt))
    : null;
  return {
    title: "Одна и та же машина: в Беларуси и привезённая из Китая",
    columns: ["Модель и год", "В Беларуси", "Из Китая под ключ", "Разница"],
    rows: rows.map((row) => [
      `${row.brand} ${row.model}, ${row.year}${row.longVersion ? " (длиннобазная версия)" : ""}`,
      `${money(row.theirMedian)} · ${cars(row.theirCount)}`,
      `${money(row.ourMedian)} · ${cars(row.ourCount)}`,
      row.diff > 0 ? `дешевле на ${money(row.diff)} (${row.diffPercent}%)` : `дороже на ${money(-row.diff)} (${-row.diffPercent}%)`,
    ]),
    note: `Цены белорусского рынка — середина по открытым объявлениям белорусских площадок${date ? ` на ${date}` : ""}; наша цена — середина итоговой суммы до Минска по машинам того же года в нашем каталоге. Сравниваются только наборы, где с обеих сторон не меньше трёх предложений. Пометка «длиннобазная версия» означает, что в Китае машина длиннее европейской, хотя в Беларуси её продают под тем же именем. Наша сумма — ориентир до договора, а не окончательная цена.${hidden ? ` В этой таблице показаны первые ${new Intl.NumberFormat("ru-RU").format(rows.length)} строк, ещё ${new Intl.NumberFormat("ru-RU").format(hidden)} доступны на самой странице через поиск и фильтр по маркам.` : ""}`,
  };
}

/**
 * Что есть по каждой марке каталога — включая те, где сравнивать не с чем.
 *
 * Зачем показывать марки без данных: человек ищет свою машину, а не нашу таблицу. Если
 * его марки в списке просто нет, он решит, что мы её не возим. Честнее сказать прямо:
 * машины есть, а сравнить не с чем — в белорусских объявлениях таких единицы.
 *
 * @param {Map|Array} ourBrands — марка → сколько машин в каталоге
 */
export function brandCoverage({ ourBrands = [], rows = [], market = null } = {}) {
  const matched = new Map();
  for (const row of rows) matched.set(row.brand, (matched.get(row.brand) || 0) + 1);
  // Сколько всего предложений нашлось по марке: складываем своды по моделям целиком
  // (ключ без года) — по ним и считается, богатый рынок или пустой.
  const offers = new Map();
  for (const [brand, buckets] of Object.entries(market?.brands || {})) {
    let total = 0;
    for (const [key, stats] of Object.entries(buckets)) if (key.endsWith("|")) total += stats.count || 0;
    offers.set(brand, total);
  }
  return [...ourBrands]
    .map(([brand, cars]) => ({ brand, cars: Number(cars) || 0, matched: matched.get(brand) || 0, offers: offers.get(brand) || 0 }))
    .filter((item) => item.cars > 0)
    .sort((left, right) => right.cars - left.cars);
}

/** Почему по марке нет сравнения — словами, без обтекаемых формулировок. */
export function coverageNote(item) {
  if (item.matched) return null;
  if (!item.offers) return "в белорусских объявлениях таких машин не нашлось";
  if (item.offers < 10) return `в Беларуси всего ${item.offers} ${item.offers === 1 ? "предложение" : item.offers < 5 ? "предложения" : "предложений"} — сравнивать не с чем`;
  return "предложения есть, но ни по одной модели и году не набралось трёх машин с обеих сторон";
}

/**
 * Строки, сгруппированные по модели: одна строка на модель с разбегом лет, а внутри —
 * годы по отдельности.
 *
 * Зачем. Разные годы одной модели — разные машины с разной выгодой, и прятать их под
 * один год нельзя. Но и четыре сотни строк подряд читать невозможно: одна модель
 * занимает пять строк и вытесняет остальные. Поэтому сверху сводная строка, а годы
 * раскрываются по нажатию.
 *
 * Как считаются числа сводной строки. Цены и разница — середина по годам, а не среднее
 * и не сумма: у модели 2020 года и 2024-го цены отличаются в полтора раза, и среднее
 * между ними не описывает ни ту, ни другую. Число машин и предложений — сумма: это
 * ответ на вопрос «есть ли вообще из чего выбирать».
 */
export function groupCompareRows(rows = []) {
  const middle = (values) => {
    const sorted = [...values].sort((left, right) => left - right);
    if (!sorted.length) return 0;
    const index = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[index] : Math.round((sorted[index - 1] + sorted[index]) / 2);
  };
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.brand}|${row.model}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].map(([key, list]) => {
    const years = [...list].sort((left, right) => left.year - right.year);
    return {
      key,
      brand: years[0].brand,
      model: years[0].model,
      yearFrom: years[0].year,
      yearTo: years.at(-1).year,
      years,
      // Сколько лет выпуска сравнили и по скольким из них привозить выгоднее: это и
      // есть честный ответ «по этой модели как» — не «да» и не «нет», а «в таких-то
      // годах да, в таких-то нет».
      cheaperYears: years.filter((row) => row.diff > 0).length,
      ourCount: years.reduce((sum, row) => sum + row.ourCount, 0),
      theirCount: years.reduce((sum, row) => sum + row.theirCount, 0),
      ourMedian: middle(years.map((row) => row.ourMedian)),
      theirMedian: middle(years.map((row) => row.theirMedian)),
      diff: middle(years.map((row) => row.diff)),
      diffPercent: middle(years.map((row) => row.diffPercent)),
      longVersion: years.some((row) => row.longVersion),
    };
  }).sort((left, right) => right.ourCount - left.ourCount);
}

/**
 * Марки, у которых низкая цена на местном рынке чаще всего объясняется не рынком,
 * а происхождением машины.
 *
 * Немецкие, японские и американские машины в Беларусь много лет везли с американских
 * аукционов — в том числе битые, и восстанавливали уже здесь. Такая машина стоит
 * дешевле целой, и в своде объявлений она стоит рядом с обычной: отличить их по цене
 * невозможно, а объяснить разницу человеку нужно. Китайских марок в этом списке нет:
 * их в США не покупали и оттуда не возили.
 *
 * Список закрытый и по происхождению марки, а не по стране сборки: Buick и Lincoln
 * делают в Китае, но на местном рынке это машины из Америки.
 */
const REBUILT_MARKET_BRANDS = new Set([
  // Немецкие
  "Volkswagen", "Audi", "BMW", "Mercedes-Benz", "Porsche", "MINI", "Skoda", "smart", "Opel",
  // Японские
  "Toyota", "Honda", "Nissan", "Mazda", "Mitsubishi", "Subaru", "Lexus", "Infiniti", "Suzuki",
  // Американские
  "Ford", "Chevrolet", "Jeep", "Buick", "Cadillac", "Chrysler", "Dodge", "GMC", "Lincoln", "Tesla",
]);

/** Нужна ли у строки пометка про восстановленные машины на местном рынке. */
export const hasRebuiltHint = (row) => Boolean(row) && row.diff < 0 && REBUILT_MARKET_BRANDS.has(row.brand);

/** Текст этой пометки. Один на всё приложение, чтобы не расходился по страницам. */
// Про отчёт об осмотре здесь молчим намеренно: он платный, и в подсказке про чужие
// цены выглядел бы обещанием, которого мы не даём.
export const REBUILT_HINT = "Эту марку в Беларуси часто продают восстановленной после аварии: такие машины везли с американских аукционов. Отсюда и такая разница.";

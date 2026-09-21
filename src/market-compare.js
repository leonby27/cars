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
//   • наша — статистика цены под ключ по нашему же каталогу (`modelPriceStats`
//     в server/repository.mjs).
//
// Три правила, без которых сравнение было бы враньём:
//
// 1. Сравниваем один и тот же год выпуска. Средняя цена «всех BYD Han» ничего не
//    значит: у нас машины 2021–2023, а на площадке могут стоять только свежие.
// 2. Сравниваем середины, а не «от». Самая дешёвая машина модели — почти всегда битая
//    или с огромным пробегом; сравнение «от» и «от» всегда выходило бы в нашу пользу.
// 3. Набор меньше пяти предложений не берём вовсе: малая выборка слишком случайна.
//
// Год выбираем тот, где на белорусском рынке больше всего предложений: это и самый
// представительный срез, и самый полезный человеку.

/** Название модели без регистра, пробелов и знаков: «Song PLUS DM-i» → «songplusdmi». */
export const normalizeModel = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");

/** Тип двигателя из поля белорусского объявления. */
export const marketPowertrain = (value) => {
  const text = String(value || "").toLowerCase();
  if (text.includes("электро")) return "Электромобиль";
  if (text.includes("гибрид")) return "Гибрид";
  if (text.includes("бензин") || text.includes("дизель")) return "ДВС";
  return null;
};

// Хвосты, которыми площадки помечают версию силовой установки. У нас и у них они
// пишутся по-разному («Song PLUS DM-i» против «Song Plus DM»), но означают одно и то
// же, поэтому при сравнении отбрасываем — иначе одна и та же машина не нашлась бы.
const POWERTRAIN_SUFFIX = /(dmi|dmp|dm|phev|hev|ev|bev)$/;
const baseModel = (name) => normalizeModel(name).replace(POWERTRAIN_SUFFIX, "");

const modelPowertrain = (name) => {
  const model = normalizeModel(name);
  if (/(dmi|dmp|dm|phev|hev)$/.test(model)) return "Гибрид";
  if (/(ev|bev)$/.test(model)) return "Электромобиль";
  return null;
};

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

const mileageKey = (value) => value == null ? "all" : String(value);

/** Индекс нового свода: модель + год + предел пробега → пять показателей цены. */
function detailedMarketIndex(market) {
  const index = new Map();
  const version = Number(market?.version) || 1;
  for (const [brand, models] of Object.entries(market?.brands || {})) {
    for (const [model, years] of Object.entries(models || {})) {
      for (const [year, yearData] of Object.entries(years || {})) {
        const powertrains = version >= 2
          ? Object.entries(yearData || {})
          : [[modelPowertrain(model), yearData]];
        for (const [powertrain, limits] of powertrains) for (const [limit, stats] of Object.entries(limits || {})) {
          const put = (modelKey) => {
            const full = `${brand}|${modelKey}|${powertrain || ""}|${year}|${limit}`;
            const known = index.get(full);
            if (!known || Number(known.count) < Number(stats.count)) index.set(full, { ...stats, brand, model, powertrain, year:Number(year) });
          };
          put(normalizeModel(model));
          put(baseModel(model));
        }
      }
    }
  }
  return index;
}

/**
 * Сопоставляет полную статистику нашего каталога и рынка Беларуси. Карточку
 * сохраняем и без белорусской строки: отсутствие местных данных — тоже полезный
 * ответ, а модель из нашего каталога не должна исчезать из поиска.
 */
export function compareDetailedRows({ ours = [], market = null, limit = 10_000 } = {}) {
  const index = detailedMarketIndex(market);
  const rows = [];
  for (const row of ours) {
    if (!row?.brand || !row?.model || !row?.year || !row?.count) continue;
    const limitKey = mileageKey(row.mileageMax);
    const long = isLongVersion(row.brand, row.model);
    const match = (model, powertrain = row.type) => index.get(`${row.brand}|${model}|${powertrain || ""}|${row.year}|${limitKey}`);
    const theirs = match(normalizeModel(row.model))
      || match(baseModel(row.model))
      || (long ? match(shortModel(row.model)) : null)
      // Старые локальные своды не хранили тип двигателя. Оставляем их читаемыми,
      // но новый свод всегда сравнивает только одинаковые силовые установки.
      || (Number(market?.version) < 2 ? match(normalizeModel(row.model), modelPowertrain(row.model)) || match(baseModel(row.model), modelPowertrain(row.model)) : null);
    const priceStats = (stats) => stats ? {
      count:Number(stats.count),
      min:Number(stats.min),
      mean:Number(stats.mean),
      median:Number(stats.median),
      max:Number(stats.max),
    } : null;
    rows.push({
      brand:row.brand,
      model:row.model,
      type:row.type || null,
      year:Number(row.year),
      mileageMax:row.mileageMax == null ? null : Number(row.mileageMax),
      image:row.image || null,
      longVersion:Boolean(theirs) && long && normalizeModel(row.model) !== normalizeModel(theirs.model),
      ours:{
        ...priceStats(row),
        ...(row.quotaOn ? { quotaOn:priceStats(row.quotaOn) } : {}),
        ...(row.quotaOff ? { quotaOff:priceStats(row.quotaOff) } : {}),
      },
      belarus:theirs?.count ? priceStats(theirs) : null,
    });
  }
  return rows.slice(0, limit);
}

/** Модельная карточка с годами и наборами статистики для каждого предела пробега. */
export function groupDetailedRows(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.brand}|${row.model}|${row.type || ""}`;
    if (!groups.has(key)) groups.set(key, { key, brand:row.brand, model:row.model, type:row.type || null, image:row.image || null, longVersion:false, years:new Map(), rank:0 });
    const group = groups.get(key);
    if (!group.image && row.image) group.image = row.image;
    group.longVersion ||= Boolean(row.longVersion);
    if (!group.years.has(row.year)) group.years.set(row.year, { year:row.year, image:row.image || null, prices:{} });
    const year = group.years.get(row.year);
    if (!year.image && row.image) year.image = row.image;
    year.prices[mileageKey(row.mileageMax)] = { ours:row.ours, belarus:row.belarus };
    if (row.mileageMax == null) group.rank += row.ours.count;
  }
  return [...groups.values()]
    .map((group) => {
      const years = [...group.years.values()].sort((left, right) => right.year - left.year);
      return { ...group, image:years.find((year) => year.image)?.image || group.image, years };
    })
    .sort((left, right) => right.rank - left.rank || `${left.brand} ${left.model}`.localeCompare(`${right.brand} ${right.model}`, "ru"));
}

/**
 * В режиме «Все типы» одна модель занимает одну карточку. У некоторых моделей —
 * например, Voyah FREE — в каталоге есть и гибрид, и электромобиль. Смешивать их
 * цены нельзя, поэтому оставляем наиболее представительную силовую установку, а
 * остальные по-прежнему доступны через фильтр типа двигателя.
 */
export function collapseSameModelCards(cards = []) {
  const chosen = new Map();
  for (const card of cards) {
    const key = `${String(card?.brand || "").toLowerCase()}|${normalizeModel(card?.model)}`;
    const known = chosen.get(key);
    if (!known || Number(card?.rank || 0) > Number(known?.rank || 0)) chosen.set(key, card);
  }
  return [...chosen.values()];
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
    note: `Цены белорусского рынка — середина по открытым объявлениям белорусских площадок${date ? ` на ${date}` : ""}; наша цена — середина итоговой суммы до Минска по машинам того же года в нашем каталоге. Сравниваются только наборы, где с обеих сторон не меньше пяти предложений. Пометка «длиннобазная версия» означает, что в Китае машина длиннее европейской, хотя в Беларуси её продают под тем же именем. Наша сумма — ориентир до договора, а не окончательная цена.${hidden ? ` В этой таблице показаны первые ${new Intl.NumberFormat("ru-RU").format(rows.length)} строк, ещё ${new Intl.NumberFormat("ru-RU").format(hidden)} доступны на самой странице через поиск и фильтр по маркам.` : ""}`,
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
    if (Number(market?.version) >= 2) {
      for (const years of Object.values(buckets || {})) {
        for (const powertrains of Object.values(years || {})) {
          for (const limits of Object.values(powertrains || {})) total += Number(limits?.all?.count) || 0;
        }
      }
    } else {
      for (const [key, stats] of Object.entries(buckets)) if (key.endsWith("|")) total += stats.count || 0;
    }
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
  return "предложения есть, но ни по одной модели и году не набралось пяти машин с обеих сторон";
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
 * Модели, для которых американское происхождение действительно правдоподобно.
 *
 * Раньше правило смотрело только на родину марки и поэтому ошибалось в обе стороны:
 * помечало китайские Audi A6L и Honda XR-V, которых в США не продавали, но пропускало
 * массовые американские Hyundai, Kia и Volvo. В сентябре 2026 года сверили белорусские
 * предложения импорта из США, реальные покупки с аукционов на получателя Belarus и
 * модельные ряды североамериканского рынка. Пометку теперь получает только конкретная
 * модель, которая продавалась там; закрытый список намеренно консервативный.
 */
const REBUILT_US_MARKET_MODELS = new Map(Object.entries({
  Acura: ["ILX", "Integra", "MDX", "RDX", "RLX", "TLX", "ZDX"],
  "Alfa Romeo": ["Giulia", "Stelvio", "Tonale"],
  Audi: ["A3", "A4", "A5", "A6", "A7", "A8", "e-tron", "e-tron GT", "Q3", "Q4 e-tron", "Q5", "Q7", "Q8", "RS 3", "RS 5", "RS 6", "RS 7", "S3", "S4", "S5", "S6", "S7", "S8", "SQ5", "SQ7", "SQ8"],
  BMW: ["2 Series", "3 Series", "4 Series", "5 Series", "6 Series", "7 Series", "8 Series", "i3", "i4", "i5", "i7", "iX", "M2", "M3", "M4", "M5", "M8", "X1", "X2", "X3", "X3 M", "X4", "X4 M", "X5", "X5 M", "X6", "X6 M", "X7", "XM", "Z4"],
  Buick: ["Enclave", "Encore", "Encore GX", "Envision", "Envista", "LaCrosse", "Regal", "Verano"],
  Cadillac: ["ATS", "CT4", "CT5", "CT6", "CTS", "Escalade", "Lyriq", "Optiq", "XT4", "XT5", "XT6"],
  Chevrolet: ["Blazer", "Bolt", "Colorado", "Corvette", "Equinox", "Malibu", "Silverado", "Suburban", "Tahoe", "Trailblazer", "Traverse", "Trax"],
  Chrysler: ["200", "300", "Pacifica", "Voyager"],
  Dodge: ["Challenger", "Charger", "Dart", "Durango", "Hornet", "Journey"],
  Ford: ["Bronco", "Bronco Sport", "Edge", "Escape", "Expedition", "Explorer", "F-150", "Focus", "Maverick", "Mustang", "Mustang Mach-E", "Ranger", "Transit"],
  Genesis: ["G70", "G80", "G90", "GV60", "GV70", "GV80"],
  GMC: ["Acadia", "Canyon", "Hummer EV", "Sierra", "Terrain", "Yukon"],
  Honda: ["Accord", "Civic", "CR-V", "HR-V", "Odyssey", "Passport", "Pilot", "Prologue", "Ridgeline"],
  Hyundai: ["Elantra", "Ioniq 5", "Ioniq 6", "Kona", "Nexo", "Palisade", "Santa Cruz", "Santa Fe", "Sonata", "Tucson", "Venue"],
  Infiniti: ["Q50", "Q60", "Q70", "QX30", "QX50", "QX55", "QX60", "QX80"],
  Jaguar: ["E-PACE", "F-PACE", "F-TYPE", "I-PACE", "XE", "XF", "XJ"],
  Jeep: ["Cherokee", "Compass", "Gladiator", "Grand Cherokee", "Renegade", "Wagoneer", "Wrangler"],
  Kia: ["Carnival", "EV6", "EV9", "Forte", "K4", "K5", "Niro", "Rio", "Seltos", "Sorento", "Soul", "Sportage", "Stinger", "Telluride"],
  "Land Rover": ["Defender", "Discovery", "Discovery Sport", "Range Rover", "Range Rover Evoque", "Range Rover Sport", "Range Rover Velar"],
  Lexus: ["ES", "GS", "GX", "IS", "LC", "LS", "LX", "NX", "RC", "RX", "RZ", "TX", "UX"],
  Lincoln: ["Aviator", "Corsair", "MKC", "MKT", "MKX", "MKZ", "Nautilus", "Navigator"],
  Maserati: ["Ghibli", "Grecale", "Levante", "MC20", "Quattroporte"],
  Mazda: ["CX-30", "CX-5", "CX-50", "CX-70", "CX-9", "CX-90", "Mazda3", "MX-5"],
  "Mercedes-Benz": ["A-Class", "AMG GT", "C-Class", "CLA", "CLA AMG", "CLS", "E-Class", "EQB", "EQE", "EQE AMG", "EQE SUV", "EQS", "EQS AMG", "EQS SUV", "G-Class", "GLA", "GLA AMG", "GLB", "GLB AMG", "GLC", "GLC AMG", "GLC Coupe", "GLC Coupe AMG", "GLE", "GLE AMG", "GLE Coupe", "GLE Coupe AMG", "GLS", "S-Class"],
  MINI: ["Clubman", "Cooper", "Countryman"],
  Mitsubishi: ["Eclipse Cross", "Mirage", "Outlander"],
  Nissan: ["Altima", "Ariya", "Armada", "Frontier", "Kicks", "Leaf", "Murano", "Pathfinder", "Rogue", "Sentra", "Titan", "Versa", "Z"],
  Porsche: ["718", "911", "Cayenne", "Macan", "Panamera", "Taycan"],
  Subaru: ["Ascent", "BRZ", "Crosstrek", "Forester", "Impreza", "Legacy", "Outback", "Solterra", "WRX"],
  Tesla: ["Cybertruck", "Model 3", "Model S", "Model X", "Model Y"],
  Toyota: ["4Runner", "86", "bZ4X", "Camry", "Corolla", "Corolla Cross", "Crown", "GR86", "Grand Highlander", "Highlander", "Land Cruiser", "Prius", "RAV4", "Sequoia", "Sienna", "Supra", "Tacoma", "Tundra", "Venza"],
  Volkswagen: ["Arteon", "Atlas", "Golf", "Golf GTI", "Golf R", "ID.4", "Jetta", "Passat", "Taos", "Tiguan"],
  Volvo: ["C40", "EX30", "EX40", "EX90", "S60", "S90", "V60", "V90", "XC40", "XC60", "XC90"],
}).map(([brand, models]) => [brand, new Set(models.map(normalizeModel))]));

// Одинаковое имя иногда носит другая региональная машина. Год закрывает известные
// коллизии: китайский BMW i3 после 2021-го, новые Buick LaCrosse/Verano и поздний
// Ford Focus уже не имеют отношения к американскому рынку.
const REBUILT_US_MODEL_YEARS = new Map([
  ["BMW|i3", { to:2021 }],
  ["Buick|lacrosse", { to:2019 }],
  ["Buick|verano", { to:2017 }],
  ["Ford|focus", { to:2018 }],
  ["Kia|carnival", { from:2022 }],
  ["Volkswagen|passat", { to:2022 }],
]);

/** Нужна ли у конкретной модели пометка про возможное восстановление после аукциона. */
export const hasRebuiltHint = (row) => {
  if (!row || row.diff >= 0) return false;
  const model = normalizeModel(row.model);
  if (!model || !REBUILT_US_MARKET_MODELS.get(row.brand)?.has(model)) return false;
  const bounds = REBUILT_US_MODEL_YEARS.get(`${row.brand}|${model}`);
  if (!bounds) return true;
  const year = Number(row.year);
  if (!Number.isFinite(year)) return false;
  return (bounds.from == null || year >= bounds.from) && (bounds.to == null || year <= bounds.to);
};

/** Текст этой пометки. Один на всё приложение, чтобы не расходился по страницам. */
// Про отчёт об осмотре здесь молчим намеренно: он платный, и в подсказке про чужие
// цены выглядел бы обещанием, которого мы не даём.
export const REBUILT_HINT = "На белорусском рынке у этой модели встречаются машины из США после восстановления. Поэтому низкая цена может быть связана с историей конкретного автомобиля — проверьте VIN и фотографии до ремонта.";

export const MIN_MARKET_COMPARISON_CARS = 5;

/** Цену стороны показываем только по выборке, достаточной для сравнения. */
export const hasEnoughMarketSample = (stats) => (
  Number(stats?.count) >= MIN_MARKET_COMPARISON_CARS
);

/** Слабая выборка не должна превращаться в публичное утверждение о разнице цен. */
export const hasEnoughComparisonSample = (prices) => (
  hasEnoughMarketSample(prices?.ours)
  && hasEnoughMarketSample(prices?.belarus)
);

/** Выбирает ту же цену квоты, которую посетитель включил для всего каталога. */
export const comparisonOwnPrices = (stats, quotaPricingOn) => (
  (quotaPricingOn ? stats?.quotaOn : stats?.quotaOff) || stats || null
);

/** Объединяет статистику нескольких лет для состояния «Все года». */
export function aggregateComparisonStats(years, mileageKey, source, quotaPricingOn) {
  const values = (years || []).map((year) => {
    const stats = year.prices?.[mileageKey]?.[source];
    return source === "ours" ? comparisonOwnPrices(stats, quotaPricingOn) : stats;
  }).filter(Boolean);
  if (!values.length) return null;
  const count = values.reduce((sum, item) => sum + Number(item.count || 0), 0);
  if (!count) return null;
  const medians = values.slice().sort((left, right) => left.median - right.median);
  let seen = 0;
  const median = medians.find((item) => ((seen += Number(item.count || 0)), seen >= count / 2))?.median;
  return {
    count,
    min:Math.min(...values.map((item) => item.min)),
    mean:values.reduce((sum, item) => sum + item.mean * Number(item.count || 0), 0) / count,
    median,
  };
}

/** Полные цены состояния «Все года» с обеих сторон. */
export const aggregateComparisonPrices = (years, mileageKey, quotaPricingOn) => ({
  ours:aggregateComparisonStats(years, mileageKey, "ours", quotaPricingOn),
  belarus:aggregateComparisonStats(years, mileageKey, "belarus", quotaPricingOn),
});

function comparisonPricesDifference(prices, priceKey) {
  if (!hasEnoughComparisonSample(prices)) return null;
  const ours = prices.ours?.[priceKey];
  const belarus = prices.belarus?.[priceKey];
  if (!Number.isFinite(ours) || !Number.isFinite(belarus) || belarus <= 0) return null;
  return ((belarus - ours) / belarus) * 100;
}

/** Разница цен для одного года с учётом выбранной квоты и минимальной выборки. */
export function comparisonYearDifference(year, mileageKey, priceKey, quotaPricingOn) {
  const rawPrices = year?.prices?.[mileageKey];
  if (!rawPrices) return null;
  const prices = {
    ...rawPrices,
    ours:comparisonOwnPrices(rawPrices.ours, quotaPricingOn),
  };
  return comparisonPricesDifference(prices, priceKey);
}

/**
 * Год, который выгоднее всего по текущим фильтрам. Слабую выборку не используем:
 * если надёжно сравнить годы нельзя, показываем самый свежий год с нашей ценой.
 */
export function bestComparisonYear(card, mileageKey, priceKey, quotaPricingOn) {
  let best = null;
  for (const year of card?.years || []) {
    const difference = comparisonYearDifference(year, mileageKey, priceKey, quotaPricingOn);
    if (difference == null) continue;
    if (!best || difference > best.difference || (difference === best.difference && year.year > best.year.year)) {
      best = { year, difference };
    }
  }
  if (best) return best;
  const aggregatePrices = aggregateComparisonPrices(card?.years, mileageKey, quotaPricingOn);
  const aggregateDifference = comparisonPricesDifference(aggregatePrices, priceKey);
  if (aggregateDifference != null) {
    return { year:null, difference:aggregateDifference, prices:aggregatePrices, aggregate:true };
  }
  const fallback = (card?.years || []).find((year) => {
    const ours = comparisonOwnPrices(year.prices?.[mileageKey]?.ours, quotaPricingOn);
    return Number.isFinite(ours?.[priceKey]);
  }) || card?.years?.[0] || null;
  return fallback ? { year:fallback, difference:null, aggregate:false } : null;
}

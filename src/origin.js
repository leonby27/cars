// Откуда возим машины: Китай (Che168, Guazi) и Корея (Encar).
//
// Правило с 29.09.2026 (решение Сергея, по образцу IM4CAR): на общих страницах — главной,
// каталоге, разделах, страницах марок и моделей — всегда стоит общая фраза «из Китая и
// Кореи», даже если у марки машины только из одной страны: запросы «BMW из Китая» и
// «BMW из Кореи» должны вести на одну страницу. Своя страна есть только у конкретной
// машины (карточка, описание, alt фото, заявка) и у страниц стран /catalog/china и
// /catalog/korea.
//
// Поэтому здесь два набора фраз:
//   • «сайта» — `siteFromPhrase()` → «из Китая и Кореи», `siteAdjective()` → «китайские и
//     корейские» и т. д. — для всего, что не про одну машину;
//   • «страны» — `fromPhrase("korea")` → «из Кореи», `inPhrase("korea")` → «в Корее» — для
//     машины и страниц стран. Страна машины берётся из источника: `originForSource()`.
//
// Слово «Китай» нигде в коде строкой не пишется — только через этот файл; для старых
// текстов, написанных до Кореи, есть `siteWording()`: он переводит «из Китая» → «из Китая
// и Кореи» и не трогает то, что уже переведено. Файл без импортов — его читают
// справочники, которые нужны многим модулям.
export const ORIGINS = Object.freeze({
  china: Object.freeze({
    key: "china", country: "Китай", genitive: "Китая", prepositional: "Китае",
    adjective: "китайские", adjectiveGenitive: "китайских", adjectiveSingular: "китайский",
    code: "CN", flag: "🇨🇳",
  }),
  korea: Object.freeze({
    key: "korea", country: "Корея", genitive: "Кореи", prepositional: "Корее",
    adjective: "корейские", adjectiveGenitive: "корейских", adjectiveSingular: "корейский",
    code: "KR", flag: "🇰🇷",
  }),
});

/** Страны, из которых возим (порядок — порядок слов во фразе «из Китая и Кореи»). */
export const ACTIVE_ORIGINS = Object.freeze(["china", "korea"]);

/** Страна по ключу; неизвестный ключ — Китай (первая и пока основная страна). */
export const originOf = (key = "china") => ORIGINS[key] || ORIGINS.china;

/** Страна по названию источника объявления: Che168, Guazi → Китай; Encar → Корея. */
export const originForSource = (source) => {
  const name = String(source || "").trim().toLowerCase();
  if (name.startsWith("encar")) return "korea";
  return "china";
};

/**
 * Источники каждой страны так, как они записаны в базе (`listings.source`). Нужны
 * фильтру каталога по стране: отдельной колонки «страна» у объявления нет — страна
 * выводится из источника, и здесь единственное место, где это записано.
 */
export const ORIGIN_SOURCES = Object.freeze({
  china: Object.freeze(["Che168", "Che168 Global", "Guazi", "Guazi Global"]),
  korea: Object.freeze(["Encar"]),
});

/** Ключ страны из адреса каталога (`?country=korea`, `country=KR`) или null. */
export const originFromParam = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  for (const key of Object.keys(ORIGINS)) {
    if (text === key || text === ORIGINS[key].code.toLowerCase()) return key;
  }
  return null;
};

const NBSP = " ";
const joinWords = (words, { nbsp = false } = {}) => {
  const space = nbsp ? NBSP : " ";
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} и${space}${words[words.length - 1]}`;
};
const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const active = () => ACTIVE_ORIGINS.map((key) => originOf(key));

// ── Одна страна: карточка машины, страницы стран ─────────────────────────────

/** «из Китая», «из Кореи»; `nbsp` — неразрывный пробел после «из». */
export const fromPhrase = (key = "china", { nbsp = false } = {}) => `из${nbsp ? NBSP : " "}${originOf(key).genitive}`;

/** «в Китае», «в Корее». */
export const inPhrase = (key = "china") => `в ${originOf(key).prepositional}`;

/** «Китай», «Корея». */
export const countryName = (key = "china") => originOf(key).country;

// ── Все страны сайта: главная, каталог, разделы, марки, модели ───────────────

/** «из Китая и Кореи». */
export const siteFromPhrase = ({ nbsp = false } = {}) =>
  `из${nbsp ? NBSP : " "}${joinWords(active().map((origin) => origin.genitive), { nbsp })}`;

/** «Китая и Кореи» — без предлога, для «рынок Китая и Кореи». */
export const siteCountriesGenitive = () => joinWords(active().map((origin) => origin.genitive));

/** «в Китае и Корее». */
export const siteInPhrase = () => `в ${joinWords(active().map((origin) => origin.prepositional))}`;

/** «Китай и Корея». */
export const siteCountries = () => joinWords(active().map((origin) => origin.country));

/** «китайские и корейские». */
export const siteAdjective = () => joinWords(active().map((origin) => origin.adjective));

/** «китайских и корейских». */
export const siteAdjectiveGenitive = () => joinWords(active().map((origin) => origin.adjectiveGenitive));

/** «Китайские и корейские» — для начала фразы. */
export const siteAdjectiveCapital = () => capital(siteAdjective());

/** «с китайских и корейских площадок». */
export const siteMarketplacesPhrase = () => `с ${siteAdjectiveGenitive()} площадок`;

// ── Перевод старых текстов ───────────────────────────────────────────────────

/**
 * Старые заголовки и описания, написанные до Кореи, говорят «из Китая». Функция
 * переводит их на фразу сайта и безопасна при повторном вызове: «из Китая и Кореи»
 * второй раз не тронет. Применять только к служебным полям (заголовки, описания,
 * вступления разделов и обзоров), а не к статьям: у статьи про «Mercedes из Китая»
 * страна — предмет текста.
 */
export const siteWording = (text) => {
  const source = String(text ?? "");
  if (!source) return source;
  const from = siteFromPhrase();
  const fromNbsp = siteFromPhrase({ nbsp: true });
  const adjective = siteAdjective();
  const adjectiveGenitive = siteAdjectiveGenitive();
  // `\b` в регулярных выражениях не знает кириллицы, поэтому граница слова — «слева не
  // буква» через lookbehind.
  return source
    // «из Китая» → «из Китая и Кореи»; уже переведённое («из Китая и …») не трогаем.
    .replace(/из(\s|\u00a0)Китая(?!(\s|\u00a0)и(\s|\u00a0))/g, (_, space) => (space === NBSP ? fromNbsp : from))
    // «с китайского вторичного рынка» → «с китайских и корейских площадок»;
    // «электромобили китайского вторичного рынка» → «электромобили с китайских и корейских площадок».
    .replace(/с китайского вторичного рынка/g, siteMarketplacesPhrase())
    .replace(/китайского вторичного рынка/g, siteMarketplacesPhrase())
    // «Китайские седаны», «китайские автомобили» → «китайские и корейские …».
    .replace(/(?<![А-Яа-яЁё])([Кк])итайские(?! и корейские)/g, (_, letter) => (letter === "К" ? capital(adjective) : adjective))
    .replace(/(?<![А-Яа-яЁё])([Кк])итайских(?! и корейских)/g, (_, letter) => (letter === "К" ? capital(adjectiveGenitive) : adjectiveGenitive));
};

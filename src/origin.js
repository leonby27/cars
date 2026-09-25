// Откуда возим машины. Сейчас — только Китай; следующей будет Корея (Encar).
//
// Зачем отдельный файл: слова «из Китая», «китайские автомобили» стоят в заголовках
// сотен страниц. Когда появится Корея, общие страницы (главная, каталог) должны
// сами заговорить «из Китая и Кореи», а у разделов и моделей — своя страна. Всё, что
// собирает заголовки, берёт страну отсюда, а не пишет её строкой.
//
// Чтобы включить Корею: добавить "korea" в ACTIVE_ORIGINS и завести корейским
// разделам `origin: "korea"` (src/catalog-landings.js). Файл без импортов — его
// читают справочники, которые нужны многим модулям.
export const ORIGINS = Object.freeze({
  china: Object.freeze({ key: "china", country: "Китай", genitive: "Китая", adjective: "китайские", adjectiveGenitive: "китайских" }),
  korea: Object.freeze({ key: "korea", country: "Корея", genitive: "Кореи", adjective: "корейские", adjectiveGenitive: "корейских" }),
});

/** Страны, из которых сейчас есть машины в каталоге. */
export const ACTIVE_ORIGINS = Object.freeze(["china"]);

/** Страна раздела или модели; по умолчанию — Китай. */
export const originOf = (key = "china") => ORIGINS[key] || ORIGINS.china;

const NBSP = " ";
const joinWords = (words, { nbsp = false } = {}) => {
  const space = nbsp ? NBSP : " ";
  if (words.length < 2) return words.join("");
  return `${words.slice(0, -1).join(", ")} и${space}${words[words.length - 1]}`;
};

/** «из Китая» для одной страны; `nbsp` — неразрывный пробел после «из» (заголовок главной). */
export const fromPhrase = (key = "china", { nbsp = false } = {}) => `из${nbsp ? NBSP : " "}${originOf(key).genitive}`;

/** Для общих страниц: «из Китая» сейчас, «из Китая и Кореи» — когда добавим Корею. */
export const siteFromPhrase = ({ nbsp = false } = {}) =>
  `из${nbsp ? NBSP : " "}${joinWords(ACTIVE_ORIGINS.map((key) => originOf(key).genitive), { nbsp })}`;

/** «китайские» сейчас, «китайские и корейские» — когда добавим Корею. */
export const siteAdjective = () => joinWords(ACTIVE_ORIGINS.map((key) => originOf(key).adjective));

/** «китайских» сейчас, «китайских и корейских» — когда добавим Корею. */
export const siteAdjectiveGenitive = () => joinWords(ACTIVE_ORIGINS.map((key) => originOf(key).adjectiveGenitive));

/** То же с большой буквы — для начала фразы. */
export const siteAdjectiveCapital = () => {
  const text = siteAdjective();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

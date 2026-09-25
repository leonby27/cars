// Каталожная страница модели: заголовки, строка наличия, автоматический текст и
// вопросы — всё, что собирается из живых цифр, а не пишется руками.
//
// Зачем отдельно от обзоров (src/model-pages.js): обзор написан для 449 моделей, а
// машины есть у 624. Страница нужна каждой — и у модели без обзора её содержание
// целиком собирается отсюда; у модели с обзором отсюда берутся заголовок вкладки с
// живыми цифрами, строка наличия, сводка перед текстом и вопросы про цену и сроки,
// которых в авторском тексте нет.
//
// Одни и те же функции зовут сервер (готовая страница) и приложение (оживление
// той же разметки), поэтому здесь нет ни обращений к базе, ни к окну браузера:
// только данные на входе и строки на выходе.
import { landingFaqDelivery, landingFaqDuty } from "./landing-faq.js";
import { fromPhrase } from "./origin.js";

const RU = new Intl.NumberFormat("ru-RU");
export const number = (value) => RU.format(Math.round(Number(value) || 0));
export const plural = (value, one, few, many) => {
  const abs = Math.abs(Math.round(Number(value) || 0)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  return last === 1 ? one : many;
};
const cars = (count) => `${number(count)} ${plural(count, "автомобиль", "автомобиля", "автомобилей")}`;
const usd = (value) => `${number(value)} $`;
const finite = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);

/** «2021–2025 годов выпуска» или «2023 года выпуска»; null, когда годов нет. */
export const yearsPhrase = (yearMin, yearMax) => {
  const from = finite(yearMin);
  const to = finite(yearMax);
  if (!from && !to) return null;
  if (!from || !to || from === to) return `${from || to} года выпуска`;
  return `${from}–${to} годов выпуска`;
};

/** «от 27 400 до 61 900 $» / «от 27 400 $»; null без цен. */
export const priceSpan = (priceFrom, priceTo) => {
  const from = finite(priceFrom);
  const to = finite(priceTo);
  if (!from && !to) return null;
  if (!from || !to || from === to) return `от ${usd(from || to)}`;
  return `от ${number(from)} до ${usd(to)}`;
};

/**
 * Заголовок вкладки, описание и заголовок страницы.
 * `facts` — живые цифры (см. modelCatalogFacts на сервере), `review` — обзор, если
 * написан; `page` — номер страницы списка.
 */
// Заголовок страницы модели без «б/у» и «с пробегом» и с Беларусью вместо Минска —
// по тем же правилам, что заголовки разделов (src/catalog-landings.js).
const cleanModelHeading = (h1) => String(h1 || "")
  .replace(/\s+(б\/у|с пробегом)(?=\s)/gi, "")
  .replace(/(доставк[а-яё]*|из Китая) в Минск(?![а-яё])/gi, "$1 в Беларусь")
  .replace(/цены до Минска/gi, "цены в Беларуси")
  .replace(/\s{2,}/g, " ")
  .trim();

/** Первый вариант заголовка, который помещается в `limit` символов. */
const fitModelTitle = (base, variants, limit = 80) => {
  for (const variant of variants) {
    const title = `${base}${variant} | abcars.by`;
    if (title.length <= limit) return title;
  }
  return `${base} | abcars.by`;
};

/**
 * Заголовок вкладки, описание и заголовок страницы модели. `facts` — живые цифры
 * (modelCatalogFacts на сервере), `review` — обзор, если написан, `page` — номер
 * страницы списка, `origin` — страна (src/origin.js; пока у всех моделей Китай).
 * В заголовке — число машин и цена «от», как у разделов каталога (решение 25.09.2026).
 */
export function modelCatalogSeo({ name, facts = null, review = null, page = 1, origin = "china" }) {
  const from = fromPhrase(origin);
  const base = `${name} ${from} в Беларусь`;
  const h1 = cleanModelHeading(review?.h1) || `Купить ${name} ${from} с доставкой в Беларусь`;
  // Цифры ещё не пришли (переход внутри сайта): нейтральный заголовок, а не «под заказ».
  if (!facts) {
    return {
      title: fitModelTitle(base, [" — цены и наличие"]),
      description: `${name} ${from}: объявления с ценами до Минска.${review?.lead ? ` ${review.lead}` : ""}`,
      h1,
    };
  }
  const total = Number(facts?.total) || 0;
  const span = priceSpan(facts?.priceFrom, facts?.priceTo);
  const pageTail = page > 1 ? ` — страница ${page}` : "";
  const price = finite(facts?.priceFrom);
  const title = total
    ? fitModelTitle(base, [
        price ? ` — ${number(total)} в наличии, от ${usd(price)}${pageTail}` : null,
        price ? ` — от ${usd(price)}${pageTail}` : null,
        ` — ${number(total)} в наличии${pageTail}`,
      ].filter(Boolean))
    : fitModelTitle(`${name} ${from}`, [" — под заказ в Беларусь, цены и характеристики", " — под заказ в Беларусь"]);
  // В описании — «б/у», Минск и годы: то, что ушло из заголовка.
  const years = yearsPhrase(facts?.yearMin, facts?.yearMax);
  const stock = total
    ? `${name} б/у ${from}: ${cars(total)} в наличии, цены ${span ? `${span} ` : ""}с доставкой до Минска${years ? `, ${years}` : ""}.`
    : `${name} ${from}: сейчас в наличии нет, привезём под заказ с расчётом цены до Минска.`;
  const tail = review?.lead || review?.teaser || "";
  const description = page > 1 ? `${stock} Страница ${page} списка.` : `${stock}${tail ? ` ${tail}` : ""}`.slice(0, 300);
  return { title, description, h1 };
}

/**
 * Индексировать ли страницу модели: автоматический текст из цифр при одной-двух
 * машинах — тонкая страница (правило из AUDIT_2026-09-25). С обзором — индексируем
 * всегда: там написанный текст, и «под заказ» тоже ответ.
 */
export const modelPageIndexable = ({ facts = null, review = null } = {}) => Boolean(review) || (Number(facts?.total) || 0) >= 3;

/** Строка под заголовком: что есть и почём — шапка списка, а не текст. */
export function modelStockLine(facts, { page = 1, pages = 1, first = 0, shown = 0 } = {}) {
  const total = Number(facts?.total) || 0;
  if (!total) return "Сейчас в наличии нет. Привезём под заказ: найдём вариант в Китае, проверим и рассчитаем цену до Минска.";
  const parts = [`В наличии ${cars(total)}`];
  const span = priceSpan(facts?.priceFrom, facts?.priceTo);
  if (span) parts.push(`цены ${span} до Минска`);
  const years = yearsPhrase(facts?.yearMin, facts?.yearMax);
  if (years) parts.push(years);
  // Со второй страницы — какие именно машины здесь: иначе страницы списка отличались
  // бы друг от друга только самим списком.
  const paging = page > 1 && shown ? ` Страница ${page} из ${pages}: автомобили с ${number(first + 1)}-го по ${number(first + shown)}-й.` : "";
  return `${parts.join(", ")}.${paging}`;
}

const POWERTRAIN_WORDS = {
  "Электромобиль": ["электромобиль", "электромобиля", "электромобилей"],
  "Гибрид": ["гибрид", "гибрида", "гибридов"],
  "ДВС": ["бензиновая машина", "бензиновые машины", "бензиновых машин"],
};
const powertrainCount = (row) => {
  const words = POWERTRAIN_WORDS[row.type] || [row.type, row.type, row.type];
  return `${number(row.count)} ${plural(row.count, ...words)}`;
};

/**
 * Сводка по живым цифрам — два-четыре абзаца, у каждой модели свои. Это то, что
 * делает страницу модели без обзора содержательной, а с обзором — актуальной:
 * авторский текст про версии не меняется, цифры наличия меняются каждую ночь.
 */
export function modelAutoText({ name, facts }) {
  const total = Number(facts?.total) || 0;
  if (!total) {
    return [
      `${name} сейчас в каталоге нет. Мы возим эту модель под заказ: найдём подходящий вариант на площадках Китая, проверим историю и состояние и рассчитаем цену с доставкой до Минска.`,
    ];
  }
  const paragraphs = [];
  const years = yearsPhrase(facts.yearMin, facts.yearMax);
  const types = (facts.powertrains || []).filter((row) => row.count > 0);
  const bodies = (facts.bodyTypes || []).filter((row) => row.name && row.count > 0);
  const first = [`${name} в каталоге abcars.by — ${cars(total)}${years ? ` ${years}` : ""}.`];
  if (types.length === 1) first.push(`Все ${types[0].type === "ДВС" ? "с бензиновым двигателем" : types[0].type === "Гибрид" ? "гибридные" : "электрические"}.`);
  else if (types.length > 1) first.push(`По типу двигателя: ${types.map(powertrainCount).join(", ")}.`);
  if (bodies.length === 1) first.push(`Кузов — ${bodies[0].name.toLowerCase()}.`);
  else if (bodies.length > 1) first.push(`Кузова: ${bodies.map((row) => row.name.toLowerCase()).join(", ")}.`);
  paragraphs.push(first.join(" "));

  const money = [];
  const span = priceSpan(facts.priceFrom, facts.priceTo);
  if (span) money.push(`Цены с доставкой до Минска — ${span}.`);
  if (finite(facts.priceP25) && finite(facts.priceP75) && facts.priceP25 < facts.priceP75) {
    money.push(`Половина предложений укладывается в ${number(facts.priceP25)}–${usd(facts.priceP75)}.`);
  }
  if (finite(facts.mileageMin)) {
    money.push(`Пробег от ${number(facts.mileageMin)} км${finite(facts.mileageMedian) ? `, у половины машин меньше ${number(facts.mileageMedian)} км` : ""}.`);
  }
  if (money.length) paragraphs.push(money.join(" "));

  const tech = [];
  if (finite(facts.batteryMax)) tech.push(`батарея до ${RU.format(Number(facts.batteryMax))} кВт·ч`);
  if (finite(facts.rangeMax)) tech.push(`запас хода до ${number(facts.rangeMax)} км`);
  if (finite(facts.powerMax)) tech.push(`мощность до ${number(facts.powerMax)} л. с.`);
  if (finite(facts.accelMin)) tech.push(`разгон до 100 км/ч от ${RU.format(Number(facts.accelMin))} с`);
  if (tech.length) paragraphs.push(`Лучшие цифры среди версий в наличии: ${tech.join(", ")}. Характеристики конкретной машины — в её карточке.`);

  paragraphs.push(
    "Цена в карточке — итог до Минска: автомобиль, доставка, таможенные платежи и сборы по действующим правилам ввоза. Наличие регулярно сверяем с площадкой-источником, проданные машины уходят из списка.",
  );
  return paragraphs;
}

// Авторский вопрос про то же самое узнаём по словам: цена, наличие, сроки. Иначе
// рядом стояли бы «Сколько стоит BYD Seal?» и «BYD Seal из Китая — сколько стоят…».
const covered = (items, pattern) => (items || []).some((item) => pattern.test(String(item.q || "")));

/**
 * Вопросы и ответы страницы модели: автоматические про цену, наличие, растаможку и
 * сроки плюс авторские из обзора — без повторов по теме.
 */
export function modelFaq({ name, facts, review = null }) {
  const own = (review?.faq || []).map((item) => ({ q: item.q, a: item.a }));
  const auto = [];
  const total = Number(facts?.total) || 0;
  const span = priceSpan(facts?.priceFrom, facts?.priceTo);
  if (total && span && !covered(own, /сколько стоит|цен[аы]|стоимост/i)) {
    auto.push({
      q: `Сколько стоит ${name} из Китая с доставкой в Минск?`,
      a: `Сейчас в каталоге ${cars(total)}, цены ${span} — это итог до Минска: автомобиль, доставка, таможенные платежи и сборы. У каждой машины в карточке своя сумма и её разбор по этапам.`,
    });
  }
  // Вопроса «Сколько X сейчас в наличии?» нет (убран 25.09.2026): число машин, годы и
  // пробег стоят строкой выше, в блоке «что есть и почём» (modelAutoText).
  const type = (facts?.powertrains || []).length === 1 ? facts.powertrains[0].type : null;
  if (!covered(own, /растамож|пошлин|таможн/i)) auto.push(landingFaqDuty(type));
  // «Доставка» — тоже про срок: в обзорах вопрос звучит «Сколько идёт доставка из Китая в
  // Минск?», и без этого слова на 440 страницах срок спрашивался дважды.
  if (!covered(own, /сколько ждать|срок|как долго|когда приедет|доставк/i)) auto.push(landingFaqDelivery());
  return [...auto, ...own];
}

export const modelFaqTitle = (name) => `Частые вопросы про ${name}`;

/**
 * Раздел каталога для модели — в том виде, в каком каталог понимает разделы марок
 * и кузовов (`kind`, `path`, `brand`, `model`, `h1`, `seoTitle`…). Собирается из
 * ответа сервера (`/api/model-catalog`), одинаково у готовой страницы и в браузере.
 */
export function modelLandingObject(data) {
  if (!data?.model) return null;
  const { model, review = null, facts = null, links = null } = data;
  const seo = modelCatalogSeo({ name: model.name, facts, review, page: 1 });
  const powertrains = facts?.powertrains || [];
  return {
    kind: "model",
    path: model.path,
    slug: model.modelSlug,
    brand: model.brand,
    model: model.model,
    name: model.name,
    h1: seo.h1,
    seoTitle: seo.title,
    seoDescription: seo.description,
    lead: review?.lead || "",
    notes: [],
    powertrain: powertrains.length === 1 ? powertrains[0].type : null,
    facts,
    review,
    links: links || { brandPath: null, sections: [], siblings: [], similar: [], journal: [] },
    inCatalog: Boolean(model.inCatalog),
  };
}

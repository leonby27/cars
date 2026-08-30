// Страницы-инструменты: остаток квоты, растаможка, из чего складывается цена и
// калькулятор. Отдельные адреса им нужны потому, что это самостоятельные запросы —
// «сколько осталось квоты на электромобили», «растаможка электромобиля в Беларуси»,
// «сколько стоит привезти авто из Китая», «калькулятор растаможки». У конкурентов такие
// страницы есть и выходят в поиске; у нас всё это было спрятано внутри карточки машины.
//
// Цифры в текстах не хардкодятся: они берутся из тех же данных, что и расчёт в карточке
// (`src/pricing.js`, `src/ev-quota.js`), поэтому страница не расходится с каталогом.
// Полосу главных цифр, пример платежа и таблицу этапов собирают функции внизу файла —
// их зовут и приложение, и статическая сборка для поисковика, поэтому две версии
// страницы не могут разойтись.
//
// Верстка у страниц такая же, как у обзоров моделей: блоки в блоках. Поэтому кроме
// абзацев у раздела есть три необязательных вложенных блока:
//   list    — [{ term, text }] пункты на своих подложках;
//   compare — [{ name, text }] две карточки рядом, когда выбор «или/или»;
//   callout — { title, text } врезка с тем, что легко упустить.
// А у страницы целиком — полоса цифр под вступлением, живой блок с расчётом и
// частые вопросы в конце.
//
// Осторожно с обещаниями: наши ставки этапов — оценки по открытым тарифам, а не
// согласованный с перевозчиками прайс. В текстах это сказано прямо, и итоговая сумма
// везде названа ориентиром до договора.
import { estimateLandedCost, PRICING } from "./pricing.js";
import { CHINA_TRANSIT_ZONES, DELIVERY_STAGE_DAYS } from "./china-logistics.js";
import { EV_QUOTA, evQuotaState, isEvQuotaExhausted } from "./ev-quota.js";

// Год в заголовках и описаниях. Запросы про растаможку и квоту почти всегда задают
// с годом («растаможка авто из Китая 2026»), и страница без года проигрывает такой же
// странице с годом. Год берём не из текста, а из часов: сайт пересобирается каждую
// ночь, поэтому 1 января он сменится сам и никто не забудет его поправить.
const CURRENT_YEAR = new Date().getFullYear();

export const TOOL_PAGES = Object.freeze([
  {
    path: "/ev-quota",
    kind: "quota",
    name: "Квота на электромобили",
    h1: `Квота на беспошлинный ввоз электромобилей в Беларусь в ${EV_QUOTA.year} году`,
    seoTitle: `Квота на электромобили в Беларуси ${EV_QUOTA.year} — сколько осталось | abcars.by`,
    seoDescription: `Сколько квоты на беспошлинный ввоз электромобилей осталось у граждан Беларуси в ${EV_QUOTA.year} году: цифры из недельных сводок таможни, темп расхода и прогноз.`,
    lead: "Официальный остаток из недельных сводок Государственного таможенного комитета — обновляется автоматически.",
  },
  {
    path: "/customs",
    kind: "customs",
    name: "Растаможка",
    h1: `Растаможка авто из Китая в Беларуси в ${CURRENT_YEAR} году: из чего состоит платёж`,
    seoTitle: `Растаможка авто из Китая в Беларуси ${CURRENT_YEAR} — сколько стоит | abcars.by`,
    // Описание держим короче 160 знаков: длинный хвост в выдаче всё равно обрезается
    // многоточием, и обрезается он ровно на том месте, где мы называем цифры.
    seoDescription: "Сколько стоит растаможить авто из Китая в Беларуси: пошлина по объёму двигателя и возрасту, ставки для электромобиля и гибрида, сборы и утильсбор.",
    lead: "Что именно платится при ввозе, чем бензиновая машина отличается от электромобиля и гибрида и почему возраст машины меняет сумму.",
  },
  {
    path: "/delivery-cost",
    kind: "cost",
    name: "Стоимость доставки",
    h1: `Сколько стоит привезти авто из Китая в Беларусь в ${CURRENT_YEAR} году`,
    seoTitle: `Сколько стоит привезти авто из Китая в Беларусь ${CURRENT_YEAR} | abcars.by`,
    seoDescription: `Из чего складывается итоговая цена авто из Китая в ${CURRENT_YEAR} году: выкуп, документы, автовоз до Минска, таможня и сопровождение — с ориентирами по этапам.`,
    lead: "Разбор итоговой суммы по этапам: что платится в Китае, что в дороге и что в Минске.",
  },
  {
    path: "/calculator",
    kind: "calculator",
    name: "Калькулятор",
    // Заголовок начинается со слова «растаможки»: ищут «калькулятор растаможки авто
    // из Китая», а не «калькулятор стоимости», и раньше главного слова в названии
    // страницы не было вовсе.
    h1: "Калькулятор растаможки и доставки авто из Китая в Минск",
    seoTitle: `Калькулятор растаможки авто из Китая в Беларуси ${CURRENT_YEAR} | abcars.by`,
    seoDescription: "Посчитайте растаможку и доставку авто из Китая в Минск: пошлина по типу двигателя и возрасту, перевозка, сборы и итоговая сумма по этапам.",
    lead: "Введите цену продавца, тип двигателя и год — посчитаем растаможку, доставку и итоговую сумму до Минска.",
  },
]);

const BY_PATH = new Map(TOOL_PAGES.map((page) => [page.path, page]));

/** Страница-инструмент по адресу или null. */
export const findToolPage = (path) => BY_PATH.get(String(path || "").replace(/\/+$/, "")) || null;

// ── Живые цифры страниц ──────────────────────────────────────────────────────
// Всё, что ниже, считается из тех же данных, что и цена в карточке. Приложение и
// статическая сборка зовут одни и те же функции: иначе страница для человека и
// страница для поисковика разошлись бы в цифрах при первой же правке тарифов.

const ru = new Intl.NumberFormat("ru-RU");
const money = (value) => `${ru.format(Math.round(value))} $`;
const moneyRange = ([low, high]) => `${ru.format(Math.round(low))}–${ru.format(Math.round(high))} $`;
const plural = (value, one, few, many) => {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
};
const daysRange = ([low, high]) => `${low}–${high} ${plural(high, "день", "дня", "дней")}`;
// Доли из расчёта приходят числами вида 0.011 — в текст они идут как «1,1%».
const percent = (value) => `${String(Math.round(value * 1000) / 10).replace(".", ",")}%`;
const percentRange = ([low, high]) => `${percent(low).replace("%", "")}–${percent(high)}`;

// Границы плеча внутри Китая по всем зонам: от города у самой границы до самого
// далёкого. В расчёте карточки берётся зона конкретного города.
const transitRange = (key) => {
  const values = Object.values(CHINA_TRANSIT_ZONES).map((zone) => zone[key]);
  return [Math.min(...values.map(([low]) => low)), Math.max(...values.map(([, high]) => high))];
};

/** Полный срок доставки: сумма этапов от выкупа до выдачи. */
export const deliveryTotalDays = () => {
  const transit = transitRange("days");
  const stages = [DELIVERY_STAGE_DAYS.buyout, transit, DELIVERY_STAGE_DAYS.intl, DELIVERY_STAGE_DAYS.svh];
  return [stages.reduce((sum, [low]) => sum + low, 0), stages.reduce((sum, [, high]) => sum + high, 0)];
};

/**
 * Полоса главных цифр под вступлением. У каждой страницы свои: на квоте это остаток
 * и темп, на растаможке — ставки, на доставке и в калькуляторе — крупные строки сметы.
 */
export function toolPageStats(kind) {
  if (kind === "quota") {
    const state = evQuotaState();
    const stats = [
      { value: ru.format(state.remaining), label: "осталось у граждан" },
      { value: ru.format(state.spent), label: `выбрано с начала ${EV_QUOTA.year} года` },
    ];
    if (state.exhausted) {
      stats.push({ value: "15%", label: "пошлина без льготы" });
      if (state.exhaustedOnLabel) stats.push({ value: state.exhaustedOnLabel, label: "квота закончилась" });
      return stats;
    }
    if (state.perWeek) stats.push({ value: `≈ ${ru.format(state.perWeek)}`, label: "машин в неделю сейчас" });
    stats.push(
      state.runsOutLabel && !state.overdue && !state.stale
        ? { value: state.runsOutLabel, label: "льгота закончится около" }
        : { value: state.asOfLabel, label: "последняя сводка таможни" },
    );
    return stats;
  }
  if (kind === "customs") {
    const quotaOver = isEvQuotaExhausted();
    return [
      {
        value: quotaOver ? percent(PRICING.evDutyPercent) : "0%",
        label: quotaOver ? "электромобиль без квоты" : "электромобиль по льготе",
      },
      { value: "по объёму", label: "гибрид с розеткой" },
      { value: "≈ 38%", label: "гибрид с генератором" },
      { value: "5 лет", label: "порог для НДС 20%" },
    ];
  }
  if (kind === "cost") {
    return [
      { value: "≈ 2/3", label: "доля цены продавца в итоге" },
      { value: moneyRange(PRICING.intlDeliveryUsd), label: "автовоз до Минска" },
      { value: money(PRICING.serviceUsd), label: "наше сопровождение" },
      { value: daysRange(deliveryTotalDays()), label: "от выкупа до выдачи" },
    ];
  }
  return [];
}

// Пример платежа на одной цене: сколько добавляет таможня электромобилю, бензиновой
// машине, гибриду с розеткой и гибриду с генератором. Два бензиновых мотора в примере
// стоят рядом нарочно — на них видно, что объём меняет платёж сильнее, чем всё
// остальное. Считается тем же расчётом, что и карточка, поэтому цифры в примере
// всегда совпадают с каталогом.
const CUSTOMS_EXAMPLE_PRICE = 20000;
const CUSTOMS_EXAMPLE_YEAR = 2023;

/** Пример: одна цена, разные типы двигателя. */
export function customsExample() {
  // Режим считаем по настоящему состоянию квоты, а не по переключателю цен: рядом
  // стоит текст про действующую льготу, и цифра не должна ему противоречить.
  const quotaOver = isEvQuotaExhausted();
  const base = {
    source: "Che168",
    usdPrice: CUSTOMS_EXAMPLE_PRICE,
    chinaPrice: 0,
    year: CUSTOMS_EXAMPLE_YEAR,
    city: "guangzhou",
    curbWeight: 1500,
  };
  const cases = [
    { name: "Электромобиль", car: { ...base, type: "Электромобиль", engine: "" } },
    { name: "Бензин, 1,5 л", car: { ...base, type: "ДВС", engine: "1.5T" } },
    { name: "Бензин, 2,0 л", car: { ...base, type: "ДВС", engine: "2.0T" } },
    { name: "Гибрид с розеткой, 1,5 л", car: { ...base, type: "Гибрид", engine: "1.5L" } },
    { name: "Гибрид с генератором", car: { ...base, type: "Гибрид", engine: "", sourceFuelType: "Range Extender" } },
  ];
  return {
    title: `Пример растаможки: машина за ${money(CUSTOMS_EXAMPLE_PRICE)}`,
    columns: ["Тип двигателя", "Таможня и оформление", "Итого до Минска"],
    rows: cases.map(({ name, car }) => {
      const estimate = estimateLandedCost(car, { quotaOver });
      return [name, `≈ ${money(estimate.customsUsd)}`, `≈ ${money(estimate.totalUsd)}`];
    }),
    note: `Машина ${CUSTOMS_EXAMPLE_YEAR} года выпуска из Гуанчжоу, обычный кузов. Остальные этапы у всех одинаковые — вся разница в строке таможни. Свои цифры можно посчитать в калькуляторе.`,
  };
}

/** Таблица этапов на странице стоимости доставки: сколько и сколько по времени. */
export function deliveryStages() {
  const transitUsd = transitRange("usd");
  const transitDays = transitRange("days");
  return {
    title: "Этапы доставки авто из Китая и ориентиры по суммам",
    columns: ["Этап", "Ориентир", "Срок"],
    rows: [
      ["Автомобиль у продавца", "цена объявления", "—"],
      [
        "Выкуп и перевод денег",
        `${percentRange(PRICING.buyoutPercent)}, минимум ${moneyRange(PRICING.buyoutMinUsd)}`,
        daysRange(DELIVERY_STAGE_DAYS.buyout),
      ],
      ["Экспортные документы", moneyRange(PRICING.exportDocsUsd), "вместе с выкупом"],
      ["Плечо до границы", `${moneyRange(transitUsd)} по зоне`, daysRange(transitDays)],
      ["Автовоз Хоргос — Минск", moneyRange(PRICING.intlDeliveryUsd), daysRange(DELIVERY_STAGE_DAYS.intl)],
      ["Надбавка за крупный кузов", `+ ${moneyRange(PRICING.bigCarExtraUsd)}`, "—"],
      ["Таможня и оформление", `от ${money(PRICING.customsFeesUsd.upTo3Years)}`, "вместе с выдачей"],
      ["Склад в Минске и выдача", moneyRange(PRICING.svhUsd), daysRange(DELIVERY_STAGE_DAYS.svh)],
      ["Наше сопровождение", money(PRICING.serviceUsd), "весь срок"],
    ],
    note: `Полный срок от выкупа до выдачи — ${daysRange(deliveryTotalDays())}. Таможня здесь посчитана по электромобилю с льготой: у гибрида эта строка заметно больше. Суммы этапов — ориентиры по открытым тарифам перевозчиков и платёжных агентов, а не согласованный прайс. Итог по конкретной машине складывает калькулятор.`,
  };
}

// Готовые расчёты на странице калькулятора. Сама форма — скрипт: поисковик её не
// запускает и до этой правки видел страницу, где про калькулятор рассказано, но не
// посчитано ничего. Табличка закрывает эту дыру и заодно отвечает на запросы вида
// «авто из Китая за 20 000 сколько выйдет в Минске»: одна цена — четыре типа машины.
// Считается тем же расчётом, что и карточка, поэтому расходиться с каталогом не может.
const CALCULATOR_EXAMPLE_PRICES = [10000, 15000, 20000, 30000];
const CALCULATOR_EXAMPLE_YEAR = 2023;

/** Примеры: одна цена продавца — четыре типа машины. */
export function calculatorExamples() {
  const quotaOver = isEvQuotaExhausted();
  const base = { source: "Che168", chinaPrice: 0, year: CALCULATOR_EXAMPLE_YEAR, city: "guangzhou", curbWeight: 1500 };
  const kinds = [
    ["Электромобиль", { type: "Электромобиль", engine: "" }],
    ["Бензин, 1,5 л", { type: "ДВС", engine: "1.5L" }],
    ["Бензин, 2,0 л", { type: "ДВС", engine: "2.0L" }],
    ["Гибрид с генератором", { type: "Гибрид", engine: "", sourceFuelType: "Range Extender" }],
  ];
  return {
    title: "Примеры расчёта: сколько выходит до Минска",
    columns: ["Цена продавца", ...kinds.map(([name]) => name)],
    rows: CALCULATOR_EXAMPLE_PRICES.map((usdPrice) => [
      money(usdPrice),
      ...kinds.map(([, car]) => `≈ ${money(estimateLandedCost({ ...base, ...car, usdPrice }, { quotaOver }).totalUsd)}`),
    ]),
    note: `Машина ${CALCULATOR_EXAMPLE_YEAR} года выпуска из Гуанчжоу, обычный кузов. Гибрид с розеткой считается так же, как бензиновая машина того же объёма, — отдельного столбца ему не нужно. В каждой сумме уже учтены выкуп и перевод денег, экспортные документы, обе перевозки, таможня, склад в Минске и наши услуги. Свою машину — с другим годом, объёмом двигателя и городом продавца — посчитайте в форме выше.`,
  };
}

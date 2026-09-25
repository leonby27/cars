// Страницы-инструменты: остаток квоты, калькулятор растаможки и из чего складывается
// цена доставки. Отдельные адреса им нужны потому, что это самостоятельные запросы —
// «сколько осталось квоты на электромобили», «калькулятор растаможки авто из Китая»,
// «сколько стоит привезти авто из Китая». У конкурентов такие страницы есть и выходят
// в поиске; у нас всё это было спрятано внутри карточки машины.
//
// Калькулятор считает только таможенный платёж: страна отправления, город продавца
// и размер кузова из формы убраны — на пошлину, НДС и сборы они не влияют, а
// превращали расчёт растаможки в расчёт доставки. Доставка живёт на своей странице.
//
// 18.09.2026 растаможка и калькулятор сведены в одну страницу (`/customs`). Раньше их
// было две, и они отвечали на один и тот же вопрос: у всех девяти сайтов из первой
// страницы поиска по «калькулятор растаможки» страница одна — сверху форма, под ней
// объяснение. Две наши страницы делили между собой один запрос, и поисковик выбирал
// то одну, то другую. Адрес `/calculator` уводит сюда постоянной переадресацией
// (`deploy/nginx-abcars-site.conf`).
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
import { DUTY_RATE_TABLES, customsPayment, estimateLandedCost, PRICING } from "./pricing.js";
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
    h1: `Квота на электромобили в Беларуси ${EV_QUOTA.year}-${EV_QUOTA.year + 1}`,
    seoTitle: `Квота на электромобили в Беларуси ${EV_QUOTA.year}-${EV_QUOTA.year + 1} | abcars.by`,
    seoDescription: `Остаток квоты на беспошлинный ввоз электромобилей в Беларуси в ${EV_QUOTA.year} году и актуальная информация о возможной квоте на ${EV_QUOTA.year + 1} год.`,
    lead: "Официальный остаток для физлиц и юрлиц.",
  },
  {
    path: "/customs",
    kind: "customs",
    name: "Калькулятор растаможки",
    // Заголовок страницы универсальный: платёж считается по правилам Беларуси и от
    // страны ввоза не зависит вообще. Китай назван в заголовке для поиска и во
    // вступлении — оттуда приходит почти весь наш спрос, — но сам расчёт подходит
    // и для Кореи, и для Европы, и для США.
    h1: `Калькулятор растаможки авто в Беларуси ${CURRENT_YEAR}`,
    seoTitle: `Калькулятор растаможки авто из Китая в Беларусь ${CURRENT_YEAR} | abcars.by`,
    // Описание держим короче 160 знаков: длинный хвост в выдаче всё равно обрезается
    // многоточием, и обрезается он ровно на том месте, где мы называем цифры.
    seoDescription: "Посчитайте растаможку авто: пошлина по объёму двигателя и возрасту, НДС, утильсбор и сборы. Ставки для электромобиля, гибрида и бензиновой машины.",
    // Подпись под заголовком короткая нарочно: за страницей приходят посчитать, и
    // длинное вступление отодвигало форму на пол-экрана вниз.
    lead: "Пошлина, НДС и сборы по вашей машине — за минуту.",
  },
  {
    path: "/delivery-cost",
    kind: "cost",
    name: "Стоимость доставки",
    h1: "Стоимость доставки авто из Китая",
    seoTitle: `Сколько стоит привезти авто из Китая в Беларусь ${CURRENT_YEAR} | abcars.by`,
    seoDescription: `Из чего складывается итоговая цена авто из Китая в ${CURRENT_YEAR} году: выкуп, документы, автовоз до Минска, таможня и услуги сервиса — с ориентирами по этапам.`,
    lead: "Считаем доставку CIP до Минска.",
  },
  {
    path: "/china-brands",
    kind: "brands",
    name: "Марки из Китая",
    h1: "Китайские марки автомобилей",
    seoTitle: "Китайские марки авто: значки, названия, как читаются | abcars.by",
    seoDescription: "Справочник китайских марок: значок, как читается название, кому принадлежит марка и какие машины делает. Плюс привычные марки, которые собирают в Китае.",
    lead: "Кто их выпускает и какие машины они делают.",
  },
  {
    path: "/range",
    kind: "range",
    name: "Реальный запас хода",
    // Заголовок про расчёт вообще, а не только про зиму: он считает и мороз, и жару,
    // и трассу. В заголовке для поиска зима осталась — спрашивают чаще всего именно
    // про неё.
    h1: "Калькулятор запаса хода электромобилей",
    seoTitle: "Реальный запас хода электромобиля зимой — калькулятор | abcars.by",
    seoDescription: "Переведите паспортный запас хода CLTC в реальный: поправка на мороз, скорость, химию батареи и возраст машины. Таблица по температурам от +20 до −20.",
    // Подпись под заголовком короткая нарочно: за страницей приходят посчитать, и
    // длинное вступление отодвигало форму вниз.
    lead: "Сколько останется в итоге от паспортных данных.",
  },
  {
    path: "/price-belarus",
    kind: "market",
    name: "Дешевле ли из Китая",
    h1: "Где дешевле купить авто: из Китая или в Беларуси",
    seoTitle: "Выгодно ли пригнать авто из Китая в Беларусь — сравнение цен | abcars.by",
    seoDescription: "Одна и та же машина: сколько стоит в Беларуси и сколько выходит привезти из Китая под ключ. Сравнение по моделям и годам выпуска с разницей в деньгах.",
    lead: "Честно сравниваем цены на одинаковые машины.",
  },
]);

const BY_PATH = new Map(TOOL_PAGES.map((page) => [page.path, page]));

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/**
 * Дата под заголовком страницы-расчёта: «данные на такое-то число».
 *
 * Зачем видимая дата, когда в разметке уже есть `dateModified`: за этими страницами
 * приходят именно за цифрой — сколько осталось квоты, сколько стоит растаможка. И
 * человек, и пересказывающий нас чат-бот первым делом спрашивают, на когда цифра.
 * Без даты свежий расчёт выглядит так же, как забытый год назад.
 *
 * Дата настоящая, а не день сборки. У квоты это день последней сводки таможни — той
 * самой, откуда взят остаток. У остальных страниц суммы в рублях считаются по курсу
 * Нацбанка, и его дата (`PRICING.rateDate`) и есть честный ответ «на когда». Ставки
 * пошлин меняются раз в годы, курс — каждую ночь, поэтому по курсу и датируем.
 */
export function toolUpdatedLabel(tool) {
  const day = (value) => {
    const date = value instanceof Date ? value : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  };
  // У страницы сравнения своя дата — день сбора чужих объявлений, и она стоит прямо
  // под таблицей. Курс Нацбанка к ней отношения не имеет: сравниваются доллары.
  if (tool?.kind === "market") return null;
  if (tool?.kind === "quota") {
    // Год здесь обязателен, хотя в шапке сайта сводка подписана без него: эту строку
    // цитируют вместе с цифрой остатка, и «на 5 сентября» без года ничего не значит.
    const label = day(new Date(evQuotaState({ audience: "personal" }).asOfMs));
    return label ? `Данные на ${label}` : null;
  }
  // rateDate приходит из pricing.js в виде «18.09.2026».
  const parts = String(PRICING.rateDate || "").split(".");
  if (parts.length !== 3) return null;
  const parsed = day(new Date(Date.UTC(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))));
  return parsed ? `Ставки и курсы на ${parsed}` : null;
}

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
      { value: money(PRICING.serviceUsd), label: "услуги сервиса" },
      { value: daysRange(deliveryTotalDays()), label: "от выкупа до выдачи" },
    ];
  }
  return [];
}

// Готовые суммы платежа для поисковика. Форму он не запускает, поэтому без такой
// таблицы страница расчёта приходит в поиск без единой посчитанной цифры — а
// спрашивают именно её: «сколько стоит растаможка авто из Китая», «растаможка 2 литра
// старше пяти лет». Считается той же функцией, что и строка таможни в карточке.
//
// Раньше здесь была сетка «цена × тип двигателя». Её убрали: у бензиновых машин
// платёж от цены не зависит вообще, и три столбца из четырёх повторяли одно и то же
// число, а под таблицей приходилось объяснять, почему это не ошибка. Объём и возраст
// меняют платёж по-настоящему — девять разных чисел вместо шестнадцати повторов.
const CUSTOMS_EXAMPLE_VOLUMES = [1500, 2000, 3000];
const CUSTOMS_EXAMPLE_PRICE = 20000;

/** Таблица: платёж по объёму двигателя и возрасту машины. */
export function customsExample() {
  const payment = (engineCc, ageYears) =>
    customsPayment({ customsValueUsd: CUSTOMS_EXAMPLE_PRICE, kind: "ice", engineCc, ageYears }).totalUsd;
  // Режим считаем по настоящему состоянию квоты, а не по переключателю цен: рядом
  // стоит текст про действующую льготу, и цифра не должна ему противоречить.
  const quotaOver = isEvQuotaExhausted();
  const ev = customsPayment({ customsValueUsd: CUSTOMS_EXAMPLE_PRICE, kind: "ev", ageYears: 3, quotaOver }).totalUsd;
  const erev = customsPayment({ customsValueUsd: CUSTOMS_EXAMPLE_PRICE, kind: "erev", ageYears: 3 }).totalUsd;
  return {
    title: "Сколько стоит растаможка: платёж по объёму двигателя и возрасту",
    columns: ["Объём двигателя", "До 3 лет включительно", "Старше 3, до 5 лет", "Старше 5 лет"],
    rows: CUSTOMS_EXAMPLE_VOLUMES.map((engineCc) => [
      // Литры всегда с десятыми: «2 л» и «1,5 л» в одном столбце читаются как разный формат.
      `${(engineCc / 1000).toFixed(1).replace(".", ",")} л`,
      ...[2, 4, 6].map((ageYears) => `≈ ${money(payment(engineCc, ageYears))}`),
    ]),
    note: `Бензин, дизель и гибрид с розеткой считаются одинаково — по объёму двигателя и возрасту. У машины не старше трёх лет в платёж входит ещё и доля от стоимости, поэтому в этом столбце взята машина за ${money(CUSTOMS_EXAMPLE_PRICE)}. Электромобилю и гибриду с генератором пошлину считают от цены: на той же машине за ${money(CUSTOMS_EXAMPLE_PRICE)} это ≈ ${money(ev)} и ≈ ${money(erev)}. Утильсбор и таможенный сбор уже входят в эти суммы и второй раз не прибавляются. Свою машину посчитайте в форме выше.`,
  };
}

// Ставки ЕАЭС для частных лиц — то, из чего складывается пошлина. У сильнейших
// конкурентов эти таблицы и есть главный материал страницы, а у нас ставки были
// только описаны словами. Таблицы собираются из тех же чисел, по которым считает
// калькулятор: переписать ставку в одном месте и забыть про другое нельзя.
const eur = (value) => `${String(value).replace(".", ",")} €`;
const ccRange = (rows, index) => {
  const from = index === 0 ? 0 : rows[index - 1].limit;
  const to = rows[index].limit;
  if (to === Infinity) return `от ${ru.format(from)} см³`;
  return from ? `${ru.format(from)}–${ru.format(to)} см³` : `до ${ru.format(to)} см³`;
};

/**
 * Ставки пошлины таблицами. Их две, а не три: обе возрастные ступени старше трёх
 * лет считаются по одной и той же шкале за кубический сантиметр, и разводить их
 * по разным таблицам значило дважды переписать один столбец объёмов.
 */
export function dutyRateTables() {
  const { upTo3Years, from3to5, over5 } = DUTY_RATE_TABLES;
  return [
    {
      title: "Машина до трёх лет включительно: доля от стоимости",
      columns: ["Стоимость машины", "Пошлина", "Но не меньше"],
      rows: upTo3Years.map((row, index) => [
        row.limit === Infinity ? `от ${ru.format(upTo3Years[index - 1].limit)} €` : index === 0 ? `до ${ru.format(row.limit)} €` : `${ru.format(upTo3Years[index - 1].limit)}–${ru.format(row.limit)} €`,
        percent(row.percent),
        `${eur(row.minRate)} за 1 см³`,
      ]),
      note: "Считают по большему из двух: доля от стоимости или ставка за объём. У свежей машины это самая дорогая ступень.",
    },
    {
      title: "Машина старше трёх лет: ставка за 1 см³ объёма",
      columns: ["Объём двигателя", "Старше 3, до 5 лет", "Старше 5 лет"],
      rows: from3to5.map((row, index) => [
        ccRange(from3to5, index),
        eur(row.rate),
        eur(over5[index].rate),
      ]),
      note: "Стоимость машины на пошлину уже не влияет — важен только мотор. Ступень старше трёх, но не старше пяти лет самая выгодная. После пяти лет ставка за кубический сантиметр примерно вдвое выше; отдельный НДС сверху не добавляется, потому что единая ставка уже включает налоги.",
    },
  ];
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
      ["Услуги сервиса", money(PRICING.serviceUsd), "—"],
    ],
    note: `Полный срок от выкупа до выдачи — ${daysRange(deliveryTotalDays())}. Таможня здесь посчитана по электромобилю с льготой: у гибрида эта строка заметно больше. Суммы этапов — ориентиры по открытым тарифам перевозчиков и платёжных агентов, а не согласованный прайс. Итог по конкретной машине считает калькулятор растаможки.`,
  };
}

// ── Калькулятор: варианты ответов ────────────────────────────────────────────
// Список полей лежит здесь, а не в разметке, потому что его читают двое:
// приложение рисует настоящую форму, а сборка для поисковика — ту же форму
// обычной разметкой. До этой правки поисковик видел страницу калькулятора без
// единого поля ввода, и по запросу «калькулятор растаможки» мы предлагали ему
// страницу, на которой, с его точки зрения, калькулятора нет.

/** Четыре типа двигателя: по ним и расходятся правила расчёта пошлины. */
export const CALC_KINDS = Object.freeze([
  { id: "ev", name: "Электромобиль", volume: false },
  { id: "phev", name: "Гибрид с розеткой", volume: true },
  { id: "erev", name: "Гибрид с генератором", volume: false },
  { id: "ice", name: "Бензин или дизель", volume: true },
]);

/** Валюты, в которых можно ввести цену машины. */
export const CALC_CURRENCIES = Object.freeze([
  { id: "usd", name: "$", label: "доллары" },
  { id: "eur", name: "€", label: "евро" },
  { id: "byn", name: "BYN", label: "белорусские рубли" },
]);

/** Годы выпуска в списке: десять последних, свежий сверху. */
export const calcYears = () => Array.from({ length: 10 }, (_, index) => String(CURRENT_YEAR - index));

// ── Ссылка на конкретный расчёт ──────────────────────────────────────────────
//
// Посчитанное нужно уметь переслать. Без этого человек считает растаможку, кидает
// ссылку в чат — и там открывается пустая форма с ценой по умолчанию, а разговор
// начинается заново. Поэтому состояние формы умеет складываться в адрес и читаться
// обратно.
//
// Имена полей короткие и постоянные: адрес живёт в чужой переписке годами, и менять
// их потом нельзя — старые ссылки перестанут восстанавливать расчёт. Значения —
// внутренние ключи (`ev`, `china`, `guangzhou`), а не подписи на экране: подпись
// можно переписать, ключ остаётся.
//
// Чего в адресе нет, того и не восстанавливаем: незнакомое значение молча
// отбрасывается, а поле остаётся со своим обычным значением. Битая ссылка из чужой
// переписки должна открывать рабочий калькулятор, а не ошибку.
const CALC_PARAM_KEYS = Object.freeze({
  kind: "kind", price: "price", currency: "cur",
  engineCc: "cc", year: "year", refund50: "refund",
});

const pickId = (list, value) => (list.some((item) => item.id === value) ? value : null);

/** Состояние калькулятора → строка запроса для ссылки. */
export function calcShareSearch(state) {
  const params = new URLSearchParams();
  const put = (key, value) => {
    if (value !== null && value !== undefined && value !== "") params.set(CALC_PARAM_KEYS[key], String(value));
  };
  put("kind", state.kind);
  put("price", Math.round(Number(state.price) || 0) || null);
  put("currency", state.currency);
  // Объём спрашивается не у всех типов двигателя: у электромобиля и гибрида с
  // генератором пошлина считается от стоимости, и лишнее число в адресе только
  // сбивало бы с толку того, кто ссылку читает.
  if (CALC_KINDS.find((item) => item.id === state.kind)?.volume) put("engineCc", Math.round(Number(state.engineCc) || 0) || null);
  put("year", state.year);
  // У электромобиля на этом месте формы стоит переключатель квоты. Скрытое
  // возмещение из ранее выбранного типа двигателя в ссылку не переносим.
  if (state.kind !== "ev" && state.refund50) put("refund50", 1);
  return params.toString();
}

/** Строка запроса → состояние калькулятора. Неизвестное отбрасывается. */
export function calcStateFromSearch(search) {
  const params = new URLSearchParams(String(search || ""));
  const state = {};
  const kind = pickId(CALC_KINDS, params.get(CALC_PARAM_KEYS.kind));
  if (kind) state.kind = kind;
  const currency = pickId(CALC_CURRENCIES, params.get(CALC_PARAM_KEYS.currency));
  if (currency) state.currency = currency;
  // Цену и объём держим в разумных границах: по чужой ссылке в поле не должно
  // приезжать ни пусто, ни миллион долларов со случайными знаками.
  const price = Math.round(Number(params.get(CALC_PARAM_KEYS.price)));
  if (Number.isFinite(price) && price > 0 && price <= 100000000) state.price = price;
  const engineCc = Math.round(Number(params.get(CALC_PARAM_KEYS.engineCc)));
  if (Number.isFinite(engineCc) && engineCc >= 100 && engineCc <= 10000) state.engineCc = engineCc;
  const year = String(params.get(CALC_PARAM_KEYS.year) || "");
  if (calcYears().includes(year)) state.year = year;
  if (params.get(CALC_PARAM_KEYS.refund50) === "1") state.refund50 = true;
  return state;
}

/** Все имена полей расчёта — для правила Clean-param в robots.txt. */
export const calcParamNames = () => Object.values(CALC_PARAM_KEYS);

/** Описание формы для сборки страницы поисковика: подпись поля и его варианты. */
export const calculatorFields = () => [
  { label: "Тип двигателя", options: CALC_KINDS.map((item) => item.name) },
  { label: "Цена машины", input: "number", hint: "в долларах, евро или белорусских рублях" },
  { label: "Объём двигателя, см³", input: "number", hint: "у электромобиля и гибрида с генератором не спрашивается" },
  { label: "Год выпуска", options: calcYears() },
  { label: "Возмещение 50% по указу № 140", input: "checkbox" },
];

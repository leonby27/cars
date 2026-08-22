// Остаток квоты на беспошлинный ввоз электромобилей в Беларусь.
//
// Вся цена «под ключ» в каталоге держится на тарифной льготе: пошлина 0% пока
// действует количественная квота 2026 года (Решение Совета ЕЭК № 111, в силе
// с 22 января 2026). Квоту для юрлиц выбрали 24 июля, у граждан остаток тает
// примерно на 250 машин в неделю — поэтому цифру показываем в шапке.
//
// Источник — еженедельные сводки ГТК в телеграм-канале с тегом #электромобили.
// Обновляется скриптом scripts/update-ev-quota.mjs (npm run quota).

export const EV_QUOTA = {
  year: 2026,
  // Объёмы квоты на год: торговый оборот (юрлица) и личное пользование (граждане).
  personalTotal: 6200,
  businessTotal: 13800,
  startedOn: "2026-01-22",
  businessExhaustedOn: "2026-07-24",
  sourceUrl: "https://t.me/s/customs_bel",
  sourceName: "сводки ГТК",
  // Сводки ГТК: [дата, осталось у граждан, осталось у юрлиц].
  // null — в этот раз таможня назвала только одну из двух цифр.
  reports: [
    ["2026-05-07", 3673, 8091],
    ["2026-05-15", 3483, 7960],
    ["2026-05-22", 3332, 7576],
    ["2026-05-29", 3161, 7303],
    ["2026-06-05", 2975, 6985],
    ["2026-06-12", 2795, 6655],
    ["2026-06-19", 2610, 6434],
    ["2026-06-26", 2425, 5528],
    ["2026-07-02", 2279, 5001],
    ["2026-07-10", 2088, 2858],
    ["2026-07-14", 1987, 810],
    ["2026-07-24", 1708, 0],
    ["2026-07-31", 1511, 0],
    ["2026-08-07", 1260, 0],
    ["2026-08-14", 1027, 0],
    ["2026-08-21", 758, 0],
  ],
};

// Аварийный рубильник на случай, если квота кончится раньше, чем выйдет сводка
// таможни: с `true` сайт считает льготу законченной, не дожидаясь нуля в данных.
// Обычное состояние — false: пошлина 15% включится сама, как только в сводке
// появится ноль.
export const EV_QUOTA_ASSUME_EXHAUSTED = false;

// Оба состояния можно посмотреть без пересборки, добавив к адресу страницы
// `?quota=over` (как будто квота кончилась) или `?quota=live` (как есть в сводках).
const quotaOverrideFromUrl = () => {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("quota");
  if (value === "over") return true;
  if (value === "live") return false;
  return null;
};

// Переключатель «Цены с квотами» в карточке остатка: посетитель может заранее
// посмотреть, во сколько выйдет машина, когда льгота кончится. Выбор храним в
// браузере, чтобы он не сбрасывался при переходах по сайту.
const QUOTA_PRICING_KEY = "evcars-quota-pricing";

// Льгота кончилась по данным сводок (или по аварийному рубильнику) — тогда
// выбирать нечего: пошлина в ценах в любом случае.
const quotaGone = () => EV_QUOTA_ASSUME_EXHAUSTED || evQuotaState({ audience: "personal" }).exhausted;

/**
 * Кончилась ли льгота на самом деле. Отличается от режима цен: переключатель
 * показывает будущие цены, но тексты про действующую нулевую пошлину при этом
 * остаются правдой, пока квота есть.
 */
export const isEvQuotaExhausted = () => {
  const override = quotaOverrideFromUrl();
  return override !== null ? override : quotaGone();
};

const quotaPricingChoice = () => {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(QUOTA_PRICING_KEY) !== "off";
  } catch {
    // Приватный режим Safari запрещает хранилище — тогда просто держим льготу.
    return true;
  }
};

/** Кончилась ли льгота для граждан — от этого зависит пошлина в расчёте цены. */
export const isEvQuotaOver = () => {
  const override = quotaOverrideFromUrl();
  if (override !== null) return override;
  if (quotaGone()) return true;
  return !quotaPricingChoice();
};

/** Можно ли вообще выбирать режим цен: пока квота есть и адрес страницы не задаёт своё. */
export const evQuotaPricingAvailable = () => quotaOverrideFromUrl() === null && !quotaGone();

/** Включены ли сейчас цены по льготной квоте. По умолчанию — да, пока квота есть. */
export const isEvQuotaPricingOn = () => !isEvQuotaOver();

/**
 * Запоминает выбранный режим цен. Сам пересчёт делает вызывающая сторона: цены
 * считаются при перерисовке, страницу перезагружать не нужно.
 */
export const rememberEvQuotaPricing = (on) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUOTA_PRICING_KEY, on ? "on" : "off");
  } catch {
    // Хранилище запрещено — выбор проживёт до конца сессии, и только.
  }
};

const DAY_MS = 86400000;
// Темп считаем по последним четырём неделям: весной квота уходила вдвое медленнее,
// чем сейчас, и прогноз по всей истории врал бы в сторону «ещё успеете».
const RATE_WINDOW_DAYS = 28;

const MONTHS_NOMINATIVE = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_GENITIVE = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

// Даты сводок — календарные дни без времени, поэтому считаем всё в UTC:
// иначе в минском часовом поясе «21 августа» превращалось бы в 20-е.
const dayMs = (iso) => {
  const [year, month, day] = String(iso).split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};
const monthStartMs = (ms) => {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};
const nextMonthMs = (ms) => {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
};

export const formatQuotaDay = (ms) => {
  const date = new Date(ms);
  return `${date.getUTCDate()} ${MONTHS_GENITIVE[date.getUTCMonth()]}`;
};

// Квота одна, но делится на две: гражданам («физ. лица») и торговому обороту
// («юр. лица»). Считаем их одинаково, отличается только колонка в сводках.
const seriesFor = (audience) => {
  const column = audience === "business" ? 2 : 1;
  const total = audience === "business" ? EV_QUOTA.businessTotal : EV_QUOTA.personalTotal;
  const points = EV_QUOTA.reports
    .filter((report) => Number.isFinite(report[column]))
    .map((report) => ({ ms: dayMs(report[0]), remaining: report[column] }));
  // Начало отсчёта — день вступления квоты в силу с полным объёмом: без него
  // не с чем сравнивать первую сводку.
  return {
    total,
    points: [{ ms: dayMs(EV_QUOTA.startedOn), remaining: total }, ...points].sort((a, b) => a.ms - b.ms),
  };
};

// Остаток на произвольный день: между сводками — по прямой, за пределами
// истории — крайним известным значением.
const remainingAt = (points, ms) => {
  if (ms <= points[0].ms) return points[0].remaining;
  const last = points[points.length - 1];
  if (ms >= last.ms) return last.remaining;
  for (let i = 1; i < points.length; i += 1) {
    const before = points[i - 1];
    const after = points[i];
    if (ms <= after.ms) {
      const share = (ms - before.ms) / (after.ms - before.ms);
      return before.remaining + (after.remaining - before.remaining) * share;
    }
  }
  return last.remaining;
};

// Остаток квоты по месяцам: сколько машин оставалось к концу каждого месяца.
// Первая сводка ГТК вышла только 7 мая 2026: ни у таможни, ни в открытой статистике
// нет расхода квоты по январю — апрелю, поэтому начало года идёт одной строкой,
// а по месяцам расписан весь остальной год. Разбить первые месяцы значило бы
// придумать цифры, которых никто не публиковал.
const spentByPeriod = (points) => {
  const first = points[0];
  const firstReport = points[1] || first;
  const last = points[points.length - 1];
  const periods = [];
  const monthsFrom = monthStartMs(firstReport.ms);
  // Считаем не разницу округлённых остатков, а разницу округлённых «сколько ушло
  // с начала года»: тогда месяцы складываются в общий расход ровно, без лишней
  // единицы от округлений на границах.
  const usedBy = (ms) => Math.round(first.remaining - remainingAt(points, ms));

  if (monthsFrom > first.ms) {
    const fromMonth = new Date(first.ms).getUTCMonth();
    const toMonth = new Date(monthsFrom - DAY_MS).getUTCMonth();
    periods.push({
      key: "before-reports",
      label: MONTHS_NOMINATIVE[toMonth],
      spent: usedBy(monthsFrom),
      left: first.remaining - usedBy(monthsFrom),
      partial: true,
      future: false,
    });
  }

  for (let start = monthsFrom; start <= last.ms; start = nextMonthMs(start)) {
    const from = Math.max(start, first.ms);
    const to = Math.min(nextMonthMs(start), last.ms);
    if (to <= from) continue;
    const month = new Date(start).getUTCMonth();
    const wholeMonth = from === start && to === nextMonthMs(start);
    periods.push({
      key: `${new Date(start).getUTCFullYear()}-${month + 1}`,
      label: MONTHS_NOMINATIVE[month],
      spent: usedBy(to) - usedBy(from),
      left: first.remaining - usedBy(to),
      // Текущий месяц ещё не закрыт; дату, по которую он посчитан, карточка
      // показывает один раз в подписи к остатку.
      partial: !wholeMonth,
      future: false,
    });
  }

  // Оставшиеся месяцы года держат каркас года: квота расписана до декабря, а
  // кончится сильно раньше. Остатка у них нет — прочерк вместо выдуманной цифры.
  const lastYear = new Date(last.ms).getUTCFullYear();
  for (let month = new Date(last.ms).getUTCMonth() + 1; month <= 11; month += 1) {
    periods.push({
      key: `${lastYear}-${month + 1}`,
      label: MONTHS_NOMINATIVE[month],
      spent: 0,
      left: null,
      partial: false,
      future: true,
    });
  }

  // Список идёт по календарю: от начала года к декабрю.
  return periods;
};

/**
 * Состояние квоты на сегодня: остаток, расход по месяцам и прогноз даты
 * исчерпания. `audience` — «personal» (граждане) или «business» (юрлица).
 * `today` нужен тестам и подсказке «данные устарели» — цифры вшиты в сборку,
 * и без свежего запуска скрипта они постепенно врут.
 */
export function evQuotaState({ audience = "personal", today = new Date() } = {}) {
  const { total, points } = seriesFor(audience);
  const last = points[points.length - 1];
  const remaining = last.remaining;
  const todayMs = dayMs(new Date(today).toISOString().slice(0, 10));

  const windowStart = last.ms - RATE_WINDOW_DAYS * DAY_MS;
  const base = [...points].reverse().find((point) => point.ms <= windowStart) || points[0];
  const days = Math.max(1, Math.round((last.ms - base.ms) / DAY_MS));
  const perDay = Math.max(0, (base.remaining - remaining) / days);
  // Темп идёт в текст как «около N машин в неделю», поэтому округляем до десятков:
  // точность до одной машины в такой фразе выглядит фальшиво.
  const perWeek = Math.round((perDay * 7) / 10) * 10;

  const daysLeft = perDay > 0 ? Math.ceil(remaining / perDay) : null;
  const runsOutMs = daysLeft === null ? null : last.ms + daysLeft * DAY_MS;

  return {
    total,
    remaining,
    spent: total - remaining,
    // Полоса в карточке показывает израсходованное: чем ближе к концу квоты,
    // тем она полнее.
    usedShare: total > 0 ? (total - remaining) / total : 0,
    asOfMs: last.ms,
    asOfLabel: formatQuotaDay(last.ms),
    periods: spentByPeriod(points),
    perWeek,
    daysLeft,
    runsOutMs,
    runsOutLabel: runsOutMs === null ? null : formatQuotaDay(runsOutMs),
    exhausted: remaining <= 0,
    // День, когда квоту выбрали до нуля: у юрлиц это 24 июля.
    exhaustedOnLabel: (() => {
      const zero = points.find((point) => point.remaining <= 0);
      return zero ? formatQuotaDay(zero.ms) : null;
    })(),
    // Прогнозная дата уже прошла, а свежей сводки в сборке нет — обещать
    // «льгота ещё действует» в этом случае нельзя.
    overdue: runsOutMs !== null && runsOutMs < todayMs,
    // Сводки выходят по пятницам; две пропущенные недели — знак, что скрипт
    // обновления давно не запускали.
    stale: todayMs - last.ms > 14 * DAY_MS,
  };
}

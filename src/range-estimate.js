// Перевод паспортного запаса хода в реальный: цикл измерения, температура, скорость,
// химия батареи и возраст машины.
//
// Зачем это нужно. Почти у всех машин нашего каталога запас хода указан по китайскому
// циклу CLTC — самому щадящему из существующих: средняя скорость в нём 29 км/ч, без
// обогрева и кондиционера. В Беларуси зимой машина проезжает примерно вдвое меньше, и
// человек, поверивший паспортной цифре, обнаруживает это в первый мороз.
//
// ВАЖНО про происхождение чисел. Это оценка по опубликованным исследованиям, а не наши
// замеры — мы не гоняли машины по морозу и не имеем права делать вид, что гоняли.
// На чём основано:
//   • разница циклов: пересчёт CLTC/NEDC/WLTP к EPA, который ближе всего к реальной
//     езде (общепринятые множители ~0,72 для CLTC и ~0,88 для WLTP);
//   • холод: исследование AAA (2026) на стенде — минус 39% при −7 °C с включённым
//     обогревом; данные Recurrent по 30 тысячам машин в живой эксплуатации — около
//     минус 22% при 0 °C. Берём кривую ближе к живым данным, они на большей выборке;
//   • разница химий: у батарей LFP на морозе внутреннее сопротивление растёт сильнее,
//     чем у тройных (NMC), и потери в среднем на четверть больше;
//   • тепловой насос: по данным Recurrent сохраняет около 10% запаса на холоде.
//
// Поэтому в тексте страницы и в подписи под расчётом прямо сказано, что это ориентир.
// Обещать точность до километра нельзя: на неё влияют стиль езды, ветер, резина,
// давление в шинах и то, грелась ли машина от розетки перед выездом.

/** Множители приведения паспортного цикла к реальной езде в мягкую погоду. */
export const RANGE_CYCLES = Object.freeze([
  // Только сокращения: страна в скобках («CLTC (китайский)») не влезала в узкое
  // поле рядом с паспортным запасом хода, а чем какой цикл отличается, разобрано
  // в первом же пункте под расчётом.
  { id: "cltc", name: "CLTC", factor: 0.72, note: "Стоит почти у всех машин из Китая" },
  { id: "nedc", name: "NEDC", factor: 0.70, note: "Встречается у машин до 2021 года" },
  { id: "wltp", name: "WLTP", factor: 0.88, note: "Бывает у машин, сделанных на экспорт" },
  { id: "epa", name: "EPA", factor: 1, note: "Ближе всего к реальной езде" },
]);

/** Режим движения: в городе электромобиль экономичнее, на трассе — заметно хуже. */
export const RANGE_MODES = Object.freeze([
  { id: "city", name: "Город, до 60 км/ч", factor: 1.1 },
  { id: "mixed", name: "Смешанный", factor: 1 },
  { id: "highway", name: "Трасса, 110 км/ч", factor: 0.8 },
  { id: "fast", name: "Трасса, 130 км/ч", factor: 0.7 },
]);

/** Химия батареи: так она называется в характеристиках машины. */
export const RANGE_CHEMISTRY = Object.freeze([
  { id: "nmc", name: "Тройная (NMC)", coldExtra: 0 },
  { id: "lfp", name: "Литий-железо-фосфатная (LFP)", coldExtra: 0.25 },
]);

// Температурная кривая: доля запаса хода, которая остаётся при этой температуре у
// батареи с тройной химией и включённом обогреве салона. Между узлами считаем по
// прямой — точность исходных данных всё равно не позволяет большего.
const TEMPERATURE_CURVE = Object.freeze([
  // −40 — продолжение той же кривой, а не замер: ниже тридцати мороза опубликованных
  // исследований нет. Шаг между узлами там же, где и выше: минус шесть сотых на
  // десять градусов. Без этого узла шкала ниже −30 упиралась бы в одно число, и
  // казалось бы, что расчёт сломался.
  [-40, 0.44],
  [-30, 0.50],
  [-20, 0.56],
  [-10, 0.66],
  [0, 0.78],
  [10, 0.92],
  [20, 1],
  [30, 0.92], // в жару расход растёт из-за кондиционера, но слабее, чем в мороз
  [40, 0.86],
]);

/** Доля запаса хода, остающаяся при такой температуре. */
export function temperatureFactor(celsius) {
  const value = Math.max(TEMPERATURE_CURVE[0][0], Math.min(TEMPERATURE_CURVE.at(-1)[0], Number(celsius) || 0));
  for (let index = 1; index < TEMPERATURE_CURVE.length; index += 1) {
    const [leftTemp, leftFactor] = TEMPERATURE_CURVE[index - 1];
    const [rightTemp, rightFactor] = TEMPERATURE_CURVE[index];
    if (value <= rightTemp) {
      const share = (value - leftTemp) / (rightTemp - leftTemp);
      return leftFactor + (rightFactor - leftFactor) * share;
    }
  }
  return TEMPERATURE_CURVE.at(-1)[1];
}

/** Потеря ёмкости с возрастом: около 2% в год, но не больше 15% за всё время. */
export function ageFactor(years) {
  const value = Math.max(0, Number(years) || 0);
  return Math.max(0.85, 1 - value * 0.02);
}

const byId = (list, id) => list.find((item) => item.id === id) || list[0];

/**
 * Реальный запас хода.
 *
 * @param {object} input
 * @param {number} input.rated       — паспортный запас хода, км
 * @param {string} input.cycle       — по какому циклу он измерен
 * @param {number} input.celsius     — температура за окном
 * @param {string} input.mode        — режим движения
 * @param {string} input.chemistry   — химия батареи
 * @param {number} input.ageYears    — возраст машины
 * @param {boolean} input.heatPump   — есть ли тепловой насос
 * @returns {{km:number, share:number, mild:number, parts:object}}
 */
export function realRange({ rated, cycle = "cltc", celsius = 20, mode = "mixed", chemistry = "nmc", ageYears = 0, heatPump = false }) {
  const ratedKm = Math.max(0, Number(rated) || 0);
  const cycleItem = byId(RANGE_CYCLES, cycle);
  const modeItem = byId(RANGE_MODES, mode);
  const chemistryItem = byId(RANGE_CHEMISTRY, chemistry);
  // Отправная точка: сколько машина проезжает в мягкую погоду в смешанном режиме.
  const mild = ratedKm * cycleItem.factor;
  let temperature = temperatureFactor(celsius);
  // На холоде разница химий и тепловой насос работают только с той частью, которая
  // теряется из-за мороза: в +20 они не меняют ничего.
  if (temperature < 1) {
    const loss = 1 - temperature;
    temperature = 1 - loss * (1 + chemistryItem.coldExtra);
    if (heatPump && Number(celsius) < 15) temperature = Math.min(1, temperature + loss * 0.3);
  }
  const share = Math.max(0.2, temperature) * modeItem.factor * ageFactor(ageYears);
  return {
    km: Math.round(mild * share),
    mild: Math.round(mild),
    share,
    parts: {
      cycle: cycleItem.factor,
      temperature,
      mode: modeItem.factor,
      age: ageFactor(ageYears),
    },
  };
}

/** Строки готовой таблицы: температура × режим движения. Их видит и поисковик. */
export const RANGE_TABLE_TEMPERATURES = Object.freeze([20, 0, -10, -20]);

export function rangeTable({ rated, cycle = "cltc", chemistry = "nmc", ageYears = 0 }) {
  const label = (celsius) => (celsius > 0 ? `+${celsius} °C` : `${celsius} °C`);
  return {
    title: "Сколько машина проедет на самом деле",
    columns: ["Погода", ...RANGE_MODES.map((item) => item.name)],
    rows: RANGE_TABLE_TEMPERATURES.map((celsius) => [
      label(celsius),
      ...RANGE_MODES.map((item) => `${realRange({ rated, cycle, celsius, mode: item.id, chemistry, ageYears }).km} км`),
    ]),
    note: "Оценка по опубликованным исследованиям холода и разницы циклов измерения, а не наши замеры. Реальную цифру меняют стиль езды, ветер, резина и то, грелась ли машина от розетки перед выездом.",
  };
}

/** Годы выпуска в списке: десять последних, свежий сверху — как в калькуляторе
   растаможки. Возраст машины расчёт выводит из года сам. */
export const rangeYears = () => Array.from({ length: 10 }, (_, index) => String(new Date().getFullYear() - index));

/** Описание формы для сборки страницы поисковика: подпись поля и его варианты. */
export const rangeFields = () => [
  { label: "Паспортный запас хода, км", input: "number", hint: "цифра из характеристик машины" },
  { label: "Цикл", options: RANGE_CYCLES.map((item) => item.name) },
  { label: "Температура за окном, °C", input: "number", hint: "от −40 до +40" },
  { label: "Как ездите", options: RANGE_MODES.map((item) => item.name) },
  { label: "Батарея", options: RANGE_CHEMISTRY.map((item) => item.name) },
  { label: "Год выпуска", options: rangeYears() },
  { label: "Есть тепловой насос", input: "checkbox" },
];

/**
 * Готовая таблица «паспорт → зима» для страницы поисковика: скрипты он не запускает,
 * а посчитанные числа видит. Берём типичные паспортные значения китайских машин.
 */
export const RANGE_EXAMPLE_RATED = Object.freeze([300, 400, 500, 600, 700]);

export function ratedToWinterTable(celsius = -10) {
  const label = celsius > 0 ? `+${celsius} °C` : `${celsius} °C`;
  return {
    title: `Паспортный запас хода по CLTC и сколько остаётся при ${label}`,
    columns: ["По паспорту", "В тёплую погоду", `Зимой, ${label}`, "Зимой на трассе"],
    rows: RANGE_EXAMPLE_RATED.map((rated) => [
      `${rated} км`,
      `${realRange({ rated, cycle: "cltc", celsius: 20, mode: "mixed" }).km} км`,
      `${realRange({ rated, cycle: "cltc", celsius, mode: "mixed" }).km} км`,
      `${realRange({ rated, cycle: "cltc", celsius, mode: "highway" }).km} км`,
    ]),
    note: "Расчёт для батареи с тройной химией на машине трёх лет. У литий-железо-фосфатной батареи зимние числа примерно на десятую часть ниже. Это оценка по опубликованным исследованиям, а не наши замеры.",
  };
}

/* Ссылка на конкретный расчёт — как у калькулятора растаможки. Без неё пересланная
   ссылка открывала бы пустую форму, и разговор начинался бы заново: «а ты посчитай
   на минус двадцать». Имена полей короткие: адрес читают глазами в переписке. */
const RANGE_PARAM_KEYS = Object.freeze({
  rated: "km", cycle: "cycle", celsius: "t",
  mode: "mode", chemistry: "battery", ageYears: "age", heatPump: "pump",
});

const rangePickId = (list, value) => (list.some((item) => item.id === value) ? value : null);

/** Состояние расчёта → строка запроса для ссылки. */
export function rangeShareSearch(state) {
  const params = new URLSearchParams();
  const put = (key, value) => {
    if (value !== null && value !== undefined && value !== "") params.set(RANGE_PARAM_KEYS[key], String(value));
  };
  put("rated", Math.round(Number(state?.rated) || 0) || null);
  put("cycle", state?.cycle);
  // Ноль градусов — настоящее значение, а не «пусто»: проверяем на число, а не на
  // истинность, иначе расчёт «при нуле» терялся бы в ссылке.
  if (Number.isFinite(Number(state?.celsius))) put("celsius", Math.round(Number(state.celsius)));
  put("mode", state?.mode);
  put("chemistry", state?.chemistry);
  if (Number.isFinite(Number(state?.ageYears))) put("ageYears", Math.round(Number(state.ageYears)));
  if (state?.heatPump) put("heatPump", 1);
  return params.toString();
}

/** Строка запроса → состояние расчёта. Неизвестное и невозможное отбрасывается. */
export function rangeStateFromSearch(search) {
  const params = new URLSearchParams(String(search || ""));
  const state = {};
  const rated = Math.round(Number(params.get(RANGE_PARAM_KEYS.rated)));
  if (Number.isFinite(rated) && rated >= 50 && rated <= 1500) state.rated = rated;
  const cycle = rangePickId(RANGE_CYCLES, params.get(RANGE_PARAM_KEYS.cycle));
  if (cycle) state.cycle = cycle;
  const celsius = Math.round(Number(params.get(RANGE_PARAM_KEYS.celsius)));
  if (params.get(RANGE_PARAM_KEYS.celsius) !== null && Number.isFinite(celsius) && celsius >= -40 && celsius <= 50) state.celsius = celsius;
  const mode = rangePickId(RANGE_MODES, params.get(RANGE_PARAM_KEYS.mode));
  if (mode) state.mode = mode;
  const chemistry = rangePickId(RANGE_CHEMISTRY, params.get(RANGE_PARAM_KEYS.chemistry));
  if (chemistry) state.chemistry = chemistry;
  const ageYears = Math.round(Number(params.get(RANGE_PARAM_KEYS.ageYears)));
  if (params.get(RANGE_PARAM_KEYS.ageYears) !== null && Number.isFinite(ageYears) && ageYears >= 0 && ageYears <= 15) state.ageYears = ageYears;
  if (params.get(RANGE_PARAM_KEYS.heatPump) === "1") state.heatPump = true;
  return state;
}

/** Имена полей расчёта — для правила Clean-param в robots.txt. */
export const rangeParamNames = () => Object.values(RANGE_PARAM_KEYS);

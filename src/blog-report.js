/**
 * Отчёт по рынку — третий вид материала журнала (после подборки и сравнения).
 *
 * Отличие от остальных: в нём нет постоянного текста с выводами, всё содержимое —
 * посчитанные цифры. Поэтому здесь лежит и форма отчёта (что в нём за блоки), и
 * рисование графика: график нужен и приложению, и версии страницы для поисковика,
 * а рисовать его дважды — верный способ получить два разных графика.
 *
 * Цифры берутся из недельных снимков цен (`scripts/snapshot-prices.mjs`) и считаются
 * в `src/price-index.js`. Пока снимков меньше двух, настоящий отчёт невозможен —
 * поэтому здесь же лежит образец с условными числами: по нему видно, как отчёт
 * выглядит, и он не показывается ни в списке журнала, ни поисковикам.
 */

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** «31 авг» — подпись под точкой графика. */
export const shortDay = (value) => {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
};

/** Число с пробелами между тысячами. */
export const groups = (value) => String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+$)/g, " ");

/** «−1,4%» или «+0,8%». Ноль пишем без знака: «0%» честнее, чем «+0%». */
export const percent = (value, digits = 1) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  const number = Number(value);
  const text = Math.abs(number).toFixed(digits).replace(".", ",");
  if (Math.abs(number) < 0.05) return "0%";
  return `${number < 0 ? "−" : "+"}${text}%`;
};

/**
 * График индекса: одна линия по неделям и пунктирная отметка сотни — уровня первой
 * недели наблюдений. Возвращается готовая разметка: её вставляет и приложение, и
 * сборка страницы для поисковика.
 *
 * Цвета берутся переменными оформления сайта, поэтому график сам работает в тёмной
 * теме. Линия зелёная, когда корзина подешевела, и красная, когда подорожала: это
 * те же цвета, что у стрелки цены на карточке машины.
 */
export function indexChartSvg(points, { width = 720, height = 240 } = {}) {
  const data = (points || []).filter((point) => Number.isFinite(point?.value));
  if (data.length < 2) return "";
  const padLeft = 46;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 30;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  const values = data.map((point) => point.value);
  // Сотню держим в поле всегда: без неё падение с 99,8 до 99,2 выглядело бы обвалом.
  const top = Math.max(...values, 100);
  const bottom = Math.min(...values, 100);
  // Запас в десятую долю размаха, но не меньше половины пункта: на ровном ряде
  // линия иначе прилипает к краю.
  const pad = Math.max((top - bottom) * 0.15, 0.5);
  const max = top + pad;
  const min = bottom - pad;
  const x = (index) => padLeft + (innerWidth * index) / (data.length - 1);
  const y = (value) => padTop + innerHeight * (1 - (value - min) / (max - min));

  const line = data.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(padTop + innerHeight).toFixed(1)} L${padLeft.toFixed(1)},${(padTop + innerHeight).toFixed(1)} Z`;
  const last = data[data.length - 1];
  const rising = last.value >= data[0].value;
  const stroke = rising ? "var(--accent)" : "var(--green)";

  // Подписи по горизонтали: первая, последняя и середина. Все восемь дат в ряд не
  // помещаются на телефоне и налезают друг на друга.
  const labelled = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
  const xLabels = data
    .map((point, index) =>
      labelled.has(index)
        ? `<text x="${x(index).toFixed(1)}" y="${height - 8}" text-anchor="${index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}" font-size="12" fill="var(--muted)">${shortDay(point.date)}</text>`
        : "",
    )
    .join("");

  const gridValues = [max, (max + min) / 2, min];
  const grid = gridValues
    .map((value) => {
      const position = y(value).toFixed(1);
      return `<line x1="${padLeft}" y1="${position}" x2="${width - padRight}" y2="${position}" stroke="var(--line)" stroke-width="1" />` +
        `<text x="${padLeft - 8}" y="${(Number(position) + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="var(--muted)">${value.toFixed(1).replace(".", ",")}</text>`;
    })
    .join("");

  const hundred = y(100).toFixed(1);
  return `<svg class="report-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Индекс цены под ключ по неделям: последнее значение ${last.value.toFixed(1).replace(".", ",")}" preserveAspectRatio="none">
  ${grid}
  <line x1="${padLeft}" y1="${hundred}" x2="${width - padRight}" y2="${hundred}" stroke="var(--line-strong)" stroke-width="1" stroke-dasharray="4 4" />
  <path d="${area}" fill="${stroke}" fill-opacity="0.08" />
  <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
  <circle cx="${x(data.length - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="4.5" fill="${stroke}" />
  ${xLabels}
</svg>`;
}

/**
 * Образец отчёта: цифры условные, взяты правдоподобными, чтобы было видно, как
 * материал выглядит целиком. Показывается только по прямой ссылке — материал помечен
 * черновиком, поэтому в списке журнала, на главной, в карте сайта и у поисковиков
 * его нет. Когда накопятся настоящие снимки, образец заменяется живым отчётом.
 */
export const SAMPLE_REPORT = Object.freeze({
  sample: true,
  weekLabel: "25–31 августа 2026",
  index: {
    changePct: -0.8,
    baskets: 412,
    listings: 18340,
    points: [
      { date: "2026-07-12", value: 100 },
      { date: "2026-07-19", value: 100.4 },
      { date: "2026-07-26", value: 100.1 },
      { date: "2026-08-02", value: 99.3 },
      { date: "2026-08-09", value: 99.5 },
      { date: "2026-08-16", value: 98.8 },
      { date: "2026-08-23", value: 98.4 },
      { date: "2026-08-30", value: 97.6 },
    ],
  },
  cheaper: [
    { brand: "Zeekr", model: "001", year: 2023, listings: 214, nowUsd: 24900, changePct: -3.4 },
    { brand: "Li Auto", model: "L7", year: 2023, listings: 168, nowUsd: 28600, changePct: -2.9 },
    { brand: "BYD", model: "Han", year: 2023, listings: 305, nowUsd: 19700, changePct: -2.4 },
    { brand: "Nio", model: "ET5", year: 2022, listings: 96, nowUsd: 22100, changePct: -2.1 },
    { brand: "Xpeng", model: "P7", year: 2023, listings: 122, nowUsd: 21400, changePct: -1.8 },
  ],
  dearer: [
    { brand: "Xiaomi", model: "SU7", year: 2024, listings: 187, nowUsd: 32800, changePct: 2.6 },
    { brand: "AITO", model: "M7", year: 2023, listings: 143, nowUsd: 29900, changePct: 1.7 },
    { brand: "Tesla", model: "Model Y", year: 2022, listings: 402, nowUsd: 23300, changePct: 1.2 },
  ],
  quota: { left: 437, perWeek: 268, weeksLeft: 2 },
  newcomers: [
    { brand: "Xiaomi", model: "YU7", listings: 14, fromUsd: 31900 },
    { brand: "Zeekr", model: "9X", listings: 6, fromUsd: 58400 },
    { brand: "Denza", model: "Z9 GT", listings: 9, fromUsd: 42700 },
  ],
  rate: { usdByn: 3.0578, changePct: 0.3, dateLabel: "1 сентября 2026" },
  stock: { total: 65743, week: 1284 },
});

const DAY_MS = 86_400_000;
const minskDate = new Intl.DateTimeFormat("en-CA", { timeZone:"Europe/Minsk", year:"numeric", month:"2-digit", day:"2-digit" });
const dayNumber = day => Date.parse(day) / DAY_MS;
const dateString = day => new Date(day * DAY_MS).toISOString().slice(0, 10);
const visitKeys = ["visits", "yandex", "yandex_ai", "google", "google_ai", "chatgpt"];
const viewsPerVisitor = (views, visitors) => visitors > 0 ? (Number(views) || 0) / visitors : 0;

function weeklyAverages(daily, start, end) {
  const byDate = new Map(daily.map(item => [item.day, item]));
  const weeks = [];
  for (let first = dayNumber(start); first <= end;) {
    const weekday = (new Date(first * DAY_MS).getUTCDay() + 6) % 7;
    const last = Math.min(end, first + 6 - weekday);
    const week = { day:dateString(first), lastDay:dateString(last), views:0 };
    let daysWithVisitors = 0;
    for (let day = first; day <= last; day++) {
      const item = byDate.get(dateString(day));
      for (const key of visitKeys) week[key] = (week[key] || 0) + (Number(item?.[key]) || 0);
      if (item?.visitors > 0) {
        week.views += item.views;
        daysWithVisitors++;
      }
    }
    for (const key of visitKeys) week[key] /= last - first + 1;
    week.views /= daysWithVisitors || 1;
    weeks.push(week);
    first = last + 1;
  }
  return weeks;
}

// Источники относятся к заходам. Просмотры делим на уникальных посетителей за сутки.
export function visitsChart(daily, period, now = new Date(), metric = "visits", height = 270, { weekly = false, from } = {}) {
  const today = minskDate.format(new Date(now));
  const end = dayNumber(today) - (period === "yesterday" ? 1 : 0);
  const single = period === "today" || period === "yesterday";
  const count = single ? 1 : Number(period) || 7;
  const isViews = metric === "views";
  const data = isViews ? daily.map(item => ({ ...item, views:viewsPerVisitor(item.views, item.visitors) })) : daily;
  const rows = weekly && data.length ? weeklyAverages(data, from ? minskDate.format(new Date(from)) : data[0].day, dayNumber(today)) : data;
  const scaled = isViews ? ["views"] : visitKeys;
  const minStep = isViews || weekly ? 0.01 : 1;
  const max = Math.max(minStep === 1 ? 1 : 0.1, ...rows.flatMap(item => scaled.map(key => Number(item[key]) || 0)));
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(minStep, [1, 2, 5, 10].find(value => value * magnitude >= rough) * magnitude);
  const ceiling = Math.ceil(max / step) * step;
  const chartY = value => 90 - (Number(value) || 0) / ceiling * 80;
  const points = rows.map((item, index) => {
    const visits = Number(item.visits) || 0;
    const yandex = Number(item.yandex) || 0;
    const google = Number(item.google) || 0;
    const yandex_ai = Number(item.yandex_ai) || 0;
    const google_ai = Number(item.google_ai) || 0;
    const chatgpt = Number(item.chatgpt) || 0;
    const views = Number(item.views) || 0;
    // «В это время» показываем только у прошедших дней: у сегодняшнего оно совпадает
    // с итогом дня, и строка в подсказке была бы пустой по смыслу.
    const lastDay = item.lastDay || item.day;
    const isToday = lastDay === today;
    const sameTimeValue = key => weekly || isToday || item[key] == null || !Number.isFinite(Number(item[key])) ? null : Number(item[key]);
    const viewsToNow = sameTimeValue("views_to_now");
    return {
      ...item, visits, yandex, yandex_ai, google, google_ai, chatgpt, views,
      isToday,
      value: metric === "views" ? views : visits,
      valueToNow: isViews ? viewsToNow === null || item.visitors_to_now == null ? null : viewsPerVisitor(viewsToNow, item.visitors_to_now) : sameTimeValue("visits_to_now"),
      yandexToNow: sameTimeValue("yandex_to_now"),
      googleToNow: sameTimeValue("google_to_now"),
      yandexAiToNow: sameTimeValue("yandex_ai_to_now"),
      googleAiToNow: sameTimeValue("google_ai_to_now"),
      x: rows.length > 1 ? index / (rows.length - 1) * 100 : 50,
      y:chartY(metric === "views" ? views : visits),
      yandexY:chartY(yandex),
      googleY:chartY(google),
      yandexAiY:chartY(yandex_ai),
      googleAiY:chartY(google_ai),
      chatgptY:chartY(chatgpt),
      selected: dayNumber(lastDay) >= end - count + 1 && dayNumber(item.day) <= end,
    };
  });
  // Уплотняем только сетку: масштаб и положение точек при растягивании не меняются.
  const plotHeight = Number.isFinite(height) && height > 0 ? height : 270;
  const divisions = [1, 2, 5, 10].filter(part => Number.isInteger(Number((step / part / minStep).toFixed(6))) && step / part >= minStep && plotHeight * .8 / (ceiling / step * part) >= 42);
  const tickStep = step / (divisions.at(-1) || 1);
  const ticks = Array.from({ length: Math.round(ceiling / tickStep) + 1 }, (_, i) => ({ value: Number((i * tickStep).toFixed(2)), y: 90 - i * tickStep / ceiling * 80 }));
  return { points, ticks, single };
}

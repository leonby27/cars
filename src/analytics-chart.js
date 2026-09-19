// График рисует либо заходы, либо просмотры карточек. Линии источников (Яндекс,
// Google) относятся только к заходам: у просмотра нет своего источника — он достаётся
// ему от захода, внутри которого случился.
export function visitsChart(daily, period, now = new Date(), metric = "visits") {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const dayNumber = value => Math.floor(Date.parse(String(value).slice(0, 10)) / 86400000);
  const end = dayNumber(today) - (period === "yesterday" ? 1 : 0);
  const single = period === "today" || period === "yesterday";
  const count = single ? 1 : Number(period) || 7;
  const scaled = metric === "views" ? ["views"] : ["visits", "yandex", "google"];
  const max = Math.max(1, ...daily.flatMap(item => scaled.map(key => Number(item[key]) || 0)));
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].find(value => value * magnitude >= rough) * magnitude);
  const ceiling = Math.ceil(max / step) * step;
  const chartY = value => 90 - (Number(value) || 0) / ceiling * 80;
  const points = daily.map((item, index) => {
    const visits = Number(item.visits) || 0;
    const yandex = Number(item.yandex) || 0;
    const google = Number(item.google) || 0;
    const views = Number(item.views) || 0;
    // «В это время» показываем только у прошедших дней: у сегодняшнего оно совпадает
    // с итогом дня, и строка в подсказке была бы пустой по смыслу.
    const toNow = Number(metric === "views" ? item.views_to_now : item.visits_to_now);
    return {
      ...item, visits, yandex, google, views,
      value: metric === "views" ? views : visits,
      valueToNow: item.day === today || !Number.isFinite(toNow) ? null : toNow,
      x: daily.length > 1 ? index / (daily.length - 1) * 100 : 50,
      y:chartY(metric === "views" ? views : visits),
      yandexY:chartY(yandex),
      googleY:chartY(google),
      selected: dayNumber(item.day) >= end - count + 1 && dayNumber(item.day) <= end,
    };
  });
  const ticks = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => ({ value: i * step, y: 90 - i * step / ceiling * 80 }));
  return { points, ticks, single };
}

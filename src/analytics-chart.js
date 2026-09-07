export function visitsChart(daily, period, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Minsk", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const dayNumber = value => Math.floor(Date.parse(String(value).slice(0, 10)) / 86400000);
  const end = dayNumber(today) - (period === "yesterday" ? 1 : 0);
  const single = period === "today" || period === "yesterday";
  const count = single ? 1 : Number(period) || 7;
  const max = Math.max(1, ...daily.map(item => Number(item.visitors) || 0));
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].find(value => value * magnitude >= rough) * magnitude);
  const ceiling = Math.ceil(max / step) * step;
  const points = daily.map((item, index) => ({
    ...item, visitors: Number(item.visitors) || 0,
    x: daily.length > 1 ? index / (daily.length - 1) * 100 : 50,
    y: 90 - (Number(item.visitors) || 0) / ceiling * 80,
    selected: dayNumber(item.day) >= end - count + 1 && dayNumber(item.day) <= end,
  }));
  const ticks = Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => ({ value: i * step, y: 90 - i * step / ceiling * 80 }));
  return { points, ticks, single };
}

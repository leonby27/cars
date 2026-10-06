// Зафиксированная версия плана. Факт обновляется отдельно и никогда не меняет
// параметры ожиданий: иначе сравнение плана с результатом теряет смысл.
export const ANALYTICS_PLAN = Object.freeze({
  version:"2026-10-06",
  start:"2026-10-01",
  months:12,
  calibrationThrough:"2026-10-05",
  anchor:"2026-10-02",
  level:615 / 7,
  filters:Object.freeze({ acquisition:"organic", activity:"actions", traffic:"without-quota" }),
  scenarios:Object.freeze({
    cautious:Object.freeze({ increment:12.268199233716475, damping:.85 }),
    base:Object.freeze({ increment:30.690909090909088, damping:.90 }),
    strong:Object.freeze({ increment:42.06153846153846, damping:.96 }),
  }),
  calibrationDays:Object.freeze({ "2026-10-01":84, "2026-10-02":77, "2026-10-03":79, "2026-10-04":93, "2026-10-05":124 }),
});

// Тот же снимок и метод, но отдельная калибровка переходов Яндекса + Google.
export const ANALYTICS_SEARCH_PLAN = Object.freeze({
  ...ANALYTICS_PLAN,
  level:437 / 7,
  scenarios:Object.freeze({
    cautious:Object.freeze({ increment:9.102490421455938, damping:.85 }),
    base:Object.freeze({ increment:25.92727272727273, damping:.90 }),
    strong:Object.freeze({ increment:35.07692307692308, damping:.96 }),
  }),
  calibrationDays:Object.freeze({ "2026-10-01":58, "2026-10-02":49, "2026-10-03":56, "2026-10-04":71, "2026-10-05":89 }),
});

const DAY = 86_400_000;
const dayNumber = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY);
const dayKey = (number) => new Date(number * DAY).toISOString().slice(0,10);
export const minskPlanDay = (now = Date.now()) => new Date(new Date(now).getTime() + 3 * 3_600_000).toISOString().slice(0,10);
export const planMonthLabel = (month) => new Intl.DateTimeFormat("ru-RU", { month:"long", year:"numeric", timeZone:"UTC" }).format(new Date(`${month}-01T00:00:00Z`)).replace(/ г\.$/, "");

export function planDailyValue(day, scenario = "base", plan = ANALYTICS_PLAN) {
  if (Object.hasOwn(plan.calibrationDays, day)) return plan.calibrationDays[day];
  const { increment, damping } = plan.scenarios[scenario];
  const h = Math.max(0, (dayNumber(day) - dayNumber(plan.anchor)) / 7);
  const month = Number(day.slice(5,7));
  const season = month === 12 ? .90 : month === 1 ? .85 : 1;
  return (plan.level + increment * damping * (1 - damping ** h) / (1 - damping)) * season;
}

export function buildAnalyticsPlan(daily = [], now = Date.now(), plan = ANALYTICS_PLAN) {
  const today = minskPlanDay(now);
  const completedThrough = dayKey(dayNumber(today) - 1);
  const visits = new Map(daily.filter((row) => row.day < today).map((row) => [row.day, Math.max(0, Number(row.visits) || 0)]));
  const start = new Date(`${plan.start}T00:00:00Z`);
  const rows = Array.from({ length:plan.months }, (_, index) => {
    const first = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1) / DAY;
    const next = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index + 1, 1) / DAY;
    const elapsed = Math.max(0, Math.min(next, dayNumber(today)) - first);
    const sums = { cautious:0, base:0, strong:0 };
    let count = 0, expected = 0;
    for (let n = first; n < next; n++) {
      const day = dayKey(n);
      for (const scenario of Object.keys(sums)) sums[scenario] += planDailyValue(day, scenario, plan);
      if (n < first + elapsed) { count += visits.get(day) || 0; expected += planDailyValue(day, "base", plan); }
    }
    const projected = Object.fromEntries(Object.entries(sums).map(([key, value]) => [key, value / (next - first)]));
    const deviation = elapsed && expected > 0 ? (count / expected - 1) * 100 : null;
    return {
      month:dayKey(first).slice(0,7), days:next-first, elapsedDays:elapsed,
      ...projected,
      rounded:Object.fromEntries(Object.entries(projected).map(([key,value]) => [key, Math.round(value / 10) * 10])),
      actual:elapsed ? count / elapsed : null,
      expectedToDate:elapsed ? expected / elapsed : null,
      deviation,
      status:deviation === null ? "future" : deviation > 20 ? "ahead" : deviation < -20 ? "behind" : "on-plan",
    };
  });
  const latest = Array.from({ length:7 }, (_, i) => dayKey(dayNumber(today) - 7 + i));
  const nextWeek = Array.from({ length:7 }, (_, i) => dayKey(dayNumber(today) + i));
  const endExclusive = dayKey(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + plan.months, 1) / DAY);
  const weekInsidePlan = nextWeek.every((day) => day >= plan.start && day < endExclusive);
  return {
    version:plan.version, start:plan.start, endExclusive, calibrationThrough:plan.calibrationThrough,
    filters:plan.filters, generatedAt:new Date(now).toISOString(), completedThrough,
    rows,
    latestWeek:{ from:latest[0], to:latest.at(-1), average:latest.at(-1) < endExclusive ? latest.reduce((sum,day) => sum + (visits.get(day) || 0),0) / 7 : null },
    nextWeek:{ from:nextWeek[0], to:nextWeek.at(-1), average:weekInsidePlan ? nextWeek.reduce((sum,day) => sum + planDailyValue(day,"base",plan),0) / 7 : null },
  };
}

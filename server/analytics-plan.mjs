import { pool } from "./db.mjs";
import { getAnalyticsTrend } from "./analytics.mjs";
import { ANALYTICS_PLAN, ANALYTICS_SEARCH_PLAN, buildAnalyticsPlan } from "../src/analytics-plan.js";

export async function getAnalyticsPlan({ db = pool, now = Date.now() } = {}) {
  // История с сентября сохраняет исходную недельную базу. Фиксированный диапазон
  // не теряет факт первых месяцев, когда обычный 90-дневный график сдвигается.
  const end = new Date(`${ANALYTICS_PLAN.start}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + ANALYTICS_PLAN.months);
  const endDate = end.toISOString().slice(0,10);
  const range = { period:"plan", days:0, from:new Date("2026-09-01T00:00:00+03:00"), to:new Date(Math.min(new Date(now).getTime(), Date.parse(`${endDate}T00:00:00+03:00`))) };
  const trend = await getAnalyticsTrend(range, { db, now, ...ANALYTICS_PLAN.filters });
  const searchDaily = trend.daily.map((row) => ({ ...row, visits:(Number(row.yandex) || 0) + (Number(row.google) || 0) }));
  return { ...buildAnalyticsPlan(trend.daily, now), search:buildAnalyticsPlan(searchDaily, now, ANALYTICS_SEARCH_PLAN) };
}

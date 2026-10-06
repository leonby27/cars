import { useEffect, useMemo, useState } from "react";
import { ANALYTICS_SEARCH_PLAN, buildAnalyticsPlan, planMonthLabel } from "./analytics-plan.js";
import { visitsChart } from "./analytics-chart.js";

const number = (value) => value === null || value === undefined ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits:1 }).format(value);
const shortMonth = (value) => new Intl.DateTimeFormat("ru-RU", { month:"short", year:"2-digit", timeZone:"UTC" }).format(new Date(`${value}-01T00:00:00Z`));

function PlanChart({ rows, now }) {
  const { points, ticks } = visitsChart(rows.map((row) => ({ day:`${row.month}-15`, visits:Math.max(row.rounded.strong, row.actual || 0) })), "365", now);
  const ceiling = ticks.at(-1).value;
  const y = (value) => 90 - value / ceiling * 80;
  const actual = rows.map((row,index) => ({ ...row, x:points[index].x })).filter((row) => row.actual !== null);
  return <div className="analytics-line-chart analytics-plan-chart" role="group" aria-label="План и фактические посещения в среднем за день по месяцам">
    <div className="analytics-chart-body">
      <div className="analytics-chart-axis" aria-hidden="true">{ticks.map((tick) => <span key={tick.value} style={{ top:`${tick.y}%` }}>{tick.value}</span>)}</div>
      <div className="analytics-chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ticks.map((tick) => <line key={tick.value} className="analytics-chart-grid" x1="0" x2="100" y1={tick.y} y2={tick.y} />)}
          <polyline className="analytics-chart-line analytics-plan-line is-plan" points={rows.map((row,index) => `${points[index].x},${y(row.rounded.strong)}`).join(" ")} />
          {actual.length > 1 ? <polyline className="analytics-chart-line analytics-plan-line is-actual" points={actual.map((row) => `${row.x},${y(row.actual)}`).join(" ")} /> : null}
        </svg>
        {rows.map((row,index) => <button key={row.month} type="button" className="analytics-chart-point analytics-plan-point is-plan" style={{ left:`${points[index].x}%`, top:`${y(row.rounded.strong)}%` }} aria-label={`${planMonthLabel(row.month)}: план — ${number(row.rounded.strong)} посещений в сутки`}>
          <span className="analytics-chart-marker" />
          <span className="analytics-chart-tooltip" role="tooltip" data-position={y(row.rounded.strong) < 35 ? "below" : "above"} data-edge={points[index].x < 25 ? "left" : points[index].x > 75 ? "right" : "center"}>
            {planMonthLabel(row.month)}
            <strong>План: {number(row.rounded.strong)} в сутки</strong>
          </span>
        </button>)}
        {actual.map((row) => <button key={`actual-${row.month}`} type="button" className="analytics-chart-point analytics-plan-point is-actual" style={{ left:`${row.x}%`, top:`${y(row.actual)}%` }} aria-label={`${planMonthLabel(row.month)}: факт — ${number(row.actual)} посещений в сутки за ${row.elapsedDays} завершённых дней`}>
          <span className="analytics-chart-marker" />
          <span className="analytics-chart-tooltip" role="tooltip" data-position={y(row.actual) < 35 ? "below" : "above"} data-edge={row.x < 25 ? "left" : row.x > 75 ? "right" : "center"}>{planMonthLabel(row.month)}<strong>Факт: {number(row.actual)} в сутки</strong><span className="analytics-chart-tooltip-note">{row.elapsedDays} из {row.days} дней</span></span>
        </button>)}
      </div>
    </div>
    <div className="analytics-chart-dates">{points.filter((_,i) => [0,3,6,8,11].includes(i)).map((point) => <span key={point.day} style={{ left:`${point.x}%` }} data-edge={point.x === 0 ? "left" : point.x === 100 ? "right" : "center"}>{shortMonth(point.day.slice(0,7))}</span>)}</div>
    <div className="analytics-plan-legend"><span><i className="is-plan" aria-hidden="true" />План</span><span><i className="is-actual" aria-hidden="true" />Факт</span></div>
  </div>;
}

export function AnalyticsPlanSection({ generatedAt, info, controls, scope = "all" }) {
  const projections = useMemo(() => ({ all:buildAnalyticsPlan([], Date.now()), search:buildAnalyticsPlan([], Date.now(), ANALYTICS_SEARCH_PLAN) }), []);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/analytics/plan", { credentials:"same-origin", cache:"no-store", signal:controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("plan_unavailable");
        const result = await response.json();
        if (!controller.signal.aborted) { setData(result); setError(""); }
      })
      .catch((reason) => { if (reason.name !== "AbortError") setError("Не удалось обновить факт. План сохранён."); });
    return () => controller.abort();
  }, [generatedAt, retry]);
  const selected = scope === "search" ? data?.search : data;
  const rows = selected?.rows || projections[scope === "search" ? "search" : "all"].rows.map((row) => ({ ...row, actual:null, elapsedDays:0 }));
  return <div className="analytics-plan">
    {error ? <div className="analytics-error" role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Повторить</button></div> : null}
    <section className="analytics-panel">
      <div className="analytics-panel-heading analytics-plan-heading"><h2>План на 12 месяцев по трафику в сутки {info}</h2>{controls}</div>
      <PlanChart rows={rows} now={selected?.generatedAt || generatedAt} />
      <div className="analytics-table-scroll"><table className="analytics-plan-table">
        <thead><tr><th>Месяц</th><th>План</th><th>Факт</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.month}>
          <td>{planMonthLabel(row.month)}</td><td><strong>{number(row.rounded.strong)}</strong></td>
          <td>{number(row.actual)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}

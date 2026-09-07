import { visitsChart } from "./analytics-chart.js";

const dateLabel = day => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Minsk" }).format(new Date(day));

export function AnalyticsVisitsChart({ daily, period, now }) {
  const { points, ticks, single } = visitsChart(daily, period, now);
  const labelStep = Math.max(1, Math.ceil(points.length / 8));
  return <div className="analytics-line-chart" aria-label="График посещений по дням">
    <div className="analytics-chart-axis-title">Посещения</div>
    <div className="analytics-chart-body">
      <div className="analytics-chart-axis" aria-hidden="true">{ticks.map(tick => <span key={tick.value} style={{ top: `${tick.y}%` }}>{tick.value}</span>)}</div>
      <div className="analytics-chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ticks.map(tick => <line key={tick.value} className="analytics-chart-grid" x1="0" x2="100" y1={tick.y} y2={tick.y} />)}
          <polyline className="analytics-chart-line analytics-chart-visitors" points={points.map(point => `${point.x},${point.y}`).join(" ")} />
          {!single && points.slice(1).map((point, index) => points[index].selected && point.selected ? <line key={point.day} className="analytics-chart-line analytics-chart-selected" x1={points[index].x} y1={points[index].y} x2={point.x} y2={point.y} /> : null)}
        </svg>
        {points.map(point => <button key={point.day} type="button" className={`analytics-chart-point${point.selected ? " is-highlighted" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%`, width: `min(24px, ${100 / Math.max(1, points.length - 1)}%)` }} aria-label={`${dateLabel(point.day)}: посещений — ${point.visitors}`}>
          <span className="analytics-chart-marker" />
          <span className="analytics-chart-tooltip" role="tooltip" data-edge={point.x < 15 ? "left" : point.x > 85 ? "right" : "center"}>{dateLabel(point.day)}<strong>Посещений: {point.visitors}</strong></span>
        </button>)}
      </div>
    </div>
    <div className="analytics-chart-dates">{points.filter((_, index) => index % labelStep === 0 || index === points.length - 1).map(point => <span key={point.day} style={{ left: `${point.x}%` }} data-edge={point.x === 0 ? "left" : point.x === 100 ? "right" : "center"}>{dateLabel(point.day)}</span>)}</div>
  </div>;
}

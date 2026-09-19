import { visitsChart } from "./analytics-chart.js";

const dateLabel = day => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Minsk" }).format(new Date(day));
// К дате везде добавляется день недели: по будням и выходным заходы ведут себя
// по-разному, и без этого каждый всплеск приходится сверять с календарём.
const weekdayLabel = day => new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "Europe/Minsk" }).format(new Date(day));
const pointLabel = day => `${dateLabel(day)}, ${weekdayLabel(day)}`;
// Одна и та же картинка показывает заходы или просмотры карточек — меняются только
// подписи: на оси, в подсказке и в описании для чтения с экрана.
const METRICS = {
  visits:{ axis:"Заходы", chart:"График заходов по дням", point:"заходов", tooltip:"Заходов" },
  views:{ axis:"Просмотры авто", chart:"График просмотров авто по дням", point:"просмотров авто", tooltip:"Просмотров" },
};

export function AnalyticsVisitsChart({ daily, period, now, sources = [], metric = "visits" }) {
  const labels = METRICS[metric] || METRICS.visits;
  const { points, ticks, single } = visitsChart(daily, period, now, metric);
  // Подписи под графиком стали длиннее на день недели, поэтому их и реже: восемь
  // штук с хвостом «, чт» налезали бы друг на друга.
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  // Разбивка по поисковикам есть только у заходов: просмотр наследует источник захода.
  const sourceLines = metric === "visits" ? [
    { id:"yandex", y:"yandexY", label:"Яндекс" },
    { id:"google", y:"googleY", label:"Google" },
  ].filter((item) => sources.includes(item.id)) : [];
  return <div className="analytics-line-chart" aria-label={labels.chart}>
    <div className="analytics-chart-axis-title">{labels.axis}</div>
    <div className="analytics-chart-body">
      <div className="analytics-chart-axis" aria-hidden="true">{ticks.map(tick => <span key={tick.value} style={{ top: `${tick.y}%` }}>{tick.value}</span>)}</div>
      <div className="analytics-chart-plot">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ticks.map(tick => <line key={tick.value} className="analytics-chart-grid" x1="0" x2="100" y1={tick.y} y2={tick.y} />)}
          <polyline className="analytics-chart-line analytics-chart-visitors" points={points.map(point => `${point.x},${point.y}`).join(" ")} />
          {sourceLines.map((source) => <polyline key={source.id} className={`analytics-chart-line analytics-chart-source is-${source.id}`} points={points.map(point => `${point.x},${point[source.y]}`).join(" ")} />)}
          {!single && points.slice(1).map((point, index) => points[index].selected && point.selected ? <line key={point.day} className="analytics-chart-line analytics-chart-selected" x1={points[index].x} y1={points[index].y} x2={point.x} y2={point.y} /> : null)}
        </svg>
        {points.map(point => <button key={point.day} type="button" className={`analytics-chart-point${point.selected ? " is-highlighted" : ""}`} style={{ left: `${point.x}%`, top: `${point.y}%`, width: `min(24px, ${100 / Math.max(1, points.length - 1)}%)` }} aria-label={`${pointLabel(point.day)}: ${labels.point} — ${point.value}${point.valueToNow === null ? "" : `, к этому времени суток — ${point.valueToNow}`}`}>
          <span className="analytics-chart-marker" />
          <span className="analytics-chart-tooltip" role="tooltip" data-edge={point.x < 15 ? "left" : point.x > 85 ? "right" : "center"}>{pointLabel(point.day)}<strong>{labels.tooltip}: {point.value}</strong>{point.valueToNow === null ? null : <span className="analytics-chart-tooltip-note">В это время: {point.valueToNow}</span>}</span>
        </button>)}
        {sourceLines.flatMap((source) => points.map((point) => <button key={`${source.id}-${point.day}`} type="button" className={`analytics-chart-point analytics-chart-source-point is-${source.id}`} style={{ left:`${point.x}%`, top:`${point[source.y]}%`, width: `min(24px, ${100 / Math.max(1, points.length - 1)}%)` }} aria-label={`${pointLabel(point.day)}: заходов из ${source.label} — ${point[source.id]}`}>
          <span className="analytics-chart-marker" />
          <span className="analytics-chart-tooltip" role="tooltip" data-edge={point.x < 15 ? "left" : point.x > 85 ? "right" : "center"}>{pointLabel(point.day)}<strong>{source.label}: {point[source.id]}</strong></span>
        </button>))}
      </div>
    </div>
    <div className="analytics-chart-dates">{points.filter((_, index) => index % labelStep === 0 || index === points.length - 1).map(point => <span key={point.day} style={{ left: `${point.x}%` }} data-edge={point.x === 0 ? "left" : point.x === 100 ? "right" : "center"}>{pointLabel(point.day)}</span>)}</div>
  </div>;
}

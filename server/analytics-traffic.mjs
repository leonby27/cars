import { QUOTA_LANDING_PATH_PATTERN } from "../src/analytics-quota-pages.js";

export const analyticsTrafficKind = (value) => value === "without-quota" ? "without-quota" : "all";

// Классифицируем весь заход до фильтра устройства и отчётного периода: иначе
// продолжение квотного захода в каталоге могло бы стать новым целевым заходом.
// Полночь ограничивает выборку: по правилам аналитики она всегда начинает заход.
export function analyticsTrafficSource(db, traffic, publicEvent, { from = "$1::timestamptz", to = "$2::timestamptz" } = {}) {
  if (analyticsTrafficKind(traffic) === "all") return { events:"analytics_events", db };
  const cte = `WITH traffic_ordered AS (
    SELECT e.*, (created_at AT TIME ZONE 'Europe/Minsk')::date AS traffic_day,
      created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at, id) AS traffic_gap,
      lag((created_at AT TIME ZONE 'Europe/Minsk')::date) OVER (PARTITION BY visitor_id ORDER BY created_at, id) AS traffic_previous_day
    FROM analytics_events e
    WHERE created_at >= (date_trunc('day', (${from}) AT TIME ZONE 'Europe/Minsk') AT TIME ZONE 'Europe/Minsk')
      AND created_at < ${to} AND ${publicEvent}
  ), traffic_numbered AS (
    SELECT *, sum(CASE WHEN traffic_gap IS NULL OR traffic_gap > interval '30 minutes'
      OR traffic_previous_day IS DISTINCT FROM traffic_day THEN 1 ELSE 0 END)
      OVER (PARTITION BY visitor_id ORDER BY created_at, id ROWS UNBOUNDED PRECEDING) AS traffic_visit
    FROM traffic_ordered
  ), traffic_labelled AS (
    SELECT *, first_value(path) OVER (PARTITION BY visitor_id, traffic_visit ORDER BY created_at, id) AS traffic_landing_path
    FROM traffic_numbered
  ), traffic_events AS (
    SELECT * FROM traffic_labelled
    WHERE lower(split_part(split_part(traffic_landing_path, '?', 1), '#', 1)) !~ '${QUOTA_LANDING_PATH_PATTERN}'
  )`;
  return {
    events:"traffic_events",
    db:{ query:(sql, params) => {
      if (!/\btraffic_events\b/.test(sql)) return db.query(sql, params);
      return db.query(/^\s*WITH\b/i.test(sql)
        ? `${cte}, ${sql.replace(/^\s*WITH\s+/i, "")}`
        : `${cte} ${sql}`, params);
    } },
  };
}

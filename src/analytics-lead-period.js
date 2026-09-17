// Заявки приходят с сервера целиком, без периода: их немного, и грузить их заново на
// каждое переключение незачем. Период, выбранный в шапке аналитики, применяется к уже
// полученному списку — здесь только границы этого периода.
export const leadPeriodNotes = {
  today:"За сегодня",
  yesterday:"За вчера",
  7:"За последние 7 дней",
  30:"За последние 30 дней",
  90:"За последние 90 дней",
};
export const leadPeriodNote = (id) => leadPeriodNotes[id] || "За всё время работы";

// Беларусь круглый год живёт по UTC+3, поэтому сутки отсчитываем от минской полуночи —
// теми же границами, что и сервер (startOfMinskDay в server/analytics.mjs). Иначе ночью
// «сегодня» в заявках и в карточках разделов показывало бы разные дни.
const MINSK_OFFSET_MS = 3 * 3_600_000;
const startOfMinskDay = (daysBack, moment) =>
  (Math.floor((moment + MINSK_OFFSET_MS) / 86_400_000) - daysBack) * 86_400_000 - MINSK_OFFSET_MS;

// Границы полуоткрытые: начало включаем, конец — нет, иначе заявка ровно в полночь
// попала бы и во «вчера», и в «сегодня». У периодов, которые кончаются «сейчас», верхней
// границы нет совсем: часы браузера могут отставать от сервера, и свежая заявка не должна
// из-за этого пропасть из списка.
export function leadPeriodRange(id, now = Date.now()) {
  const moment = now instanceof Date ? now.getTime() : Number(new Date(now));
  if (!Number.isFinite(moment)) return null;
  if (id === "today") return { from:startOfMinskDay(0, moment), to:Infinity };
  if (id === "yesterday") return { from:startOfMinskDay(1, moment), to:startOfMinskDay(0, moment) };
  const days = [7, 30, 90].includes(Number(id)) ? Number(id) : 0;
  return days ? { from:moment - days * 86_400_000, to:Infinity } : null;
}

export function filterLeadsByPeriod(leads, id, now = Date.now()) {
  const list = Array.isArray(leads) ? leads : [];
  const range = leadPeriodRange(id, now);
  if (!range) return list;
  return list.filter((lead) => {
    const at = Date.parse(lead?.createdAt);
    return Number.isFinite(at) && at >= range.from && at < range.to;
  });
}

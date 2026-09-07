const sameLocalDay = (left, right) => left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate();

// Для сегодняшних заходов расстояние во времени полезнее календарной даты:
// менеджер сразу видит, был человек пять минут назад или несколько часов назад.
export const formatVisitDate = (value, nowValue = new Date()) => {
  const date = new Date(value);
  const now = new Date(nowValue);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return "—";
  if (!sameLocalDay(date, now)) {
    return new Intl.DateTimeFormat("ru-RU", { dateStyle:"short", timeStyle:"short" }).format(date);
  }
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (elapsedMinutes < 1) return "Только что";
  const relative = new Intl.RelativeTimeFormat("ru-RU", { numeric:"always" });
  if (elapsedMinutes < 60) return relative.format(-elapsedMinutes, "minute");
  return relative.format(-Math.floor(elapsedMinutes / 60), "hour");
};

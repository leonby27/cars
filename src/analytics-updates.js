// Без `viewing` сервер только возвращает непрочитанные счётчики. Конкретный
// раздел передаём лишь после явного нажатия пользователя — тогда сервер отмечает
// его просмотренным.
export const analyticsUpdatesUrl = (viewing = "") => {
  const section = String(viewing || "").trim();
  return section
    ? `/api/analytics/updates?viewing=${encodeURIComponent(section)}`
    : "/api/analytics/updates";
};

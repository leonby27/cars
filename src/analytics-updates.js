// Без `viewing` сервер только возвращает непрочитанные счётчики. Конкретный
// раздел передаём после явного нажатия или при выходе из аналитики.
export const analyticsUpdatesUrl = (viewing = "") => {
  const section = String(viewing || "").trim();
  return section
    ? `/api/analytics/updates?viewing=${encodeURIComponent(section)}`
    : "/api/analytics/updates";
};

// pagehide срабатывает при закрытии, перезагрузке и уходе со страницы.
// keepalive позволяет запросу завершиться уже после закрытия вкладки.
// Переключение на соседнюю вкладку не считается выходом из аналитики.
export function watchAnalyticsExit(getViewedSections, target = window, send = fetch) {
  const onPageHide = () => {
    for (const section of new Set(getViewedSections())) {
      send(analyticsUpdatesUrl(section), {
        credentials:"same-origin", cache:"no-store", keepalive:true,
      }).catch(() => {});
    }
  };
  target.addEventListener("pagehide", onPageHide);
  return () => target.removeEventListener("pagehide", onPageHide);
}

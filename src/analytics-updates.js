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

// Внутри «Каталога» три вкладки со своими счётчиками: страницы каталога, авто и
// избранное. Пункт бокового меню показывает их сумму — иначе просмотренные авто
// видно только после того, как раздел откроешь.
export const SECTION_TABS = { vehicles:["vehicles", "vehicle_cars", "vehicle_favorites"] };

export const sectionFreshCount = (updates = {}, section = "") =>
  (SECTION_TABS[section] || [section]).reduce((sum, key) => sum + (Number(updates[key]) || 0), 0);

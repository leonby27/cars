import { analyticsActivityKind } from "./analytics-activity.js";
import { analyticsAcquisitionKind } from "./analytics-acquisition.js";

// Без `viewing` сервер только возвращает непрочитанные счётчики. Конкретный
// раздел передаём после явного нажатия или при выходе из аналитики.
// Несколько разделов сразу — массивом: сервер отметит их одним запросом.
export const analyticsUpdatesUrl = (viewing = "", traffic = "all", acquisition = "all", activity = "all") => {
  const section = (Array.isArray(viewing) ? viewing : [viewing]).map((item) => String(item || "").trim()).filter(Boolean).join(",");
  const url = section
    ? `/api/analytics/updates?viewing=${encodeURIComponent(section)}`
    : "/api/analytics/updates";
  const params = [];
  if (traffic === "without-quota") params.push("traffic=without-quota");
  const channel = analyticsAcquisitionKind(acquisition);
  if (channel !== "all") params.push(`acquisition=${channel}`);
  if (analyticsActivityKind(activity) === "actions") params.push("activity=actions");
  return params.length ? `${url}${section ? "&" : "?"}${params.join("&")}` : url;
};

// pagehide срабатывает при закрытии, перезагрузке и уходе со страницы.
// keepalive позволяет запросу завершиться уже после закрытия вкладки.
// Переключение на соседнюю вкладку не считается выходом из аналитики.
export function watchAnalyticsExit(getViewedSections, target = window, send = fetch, getFilters = () => ({})) {
  const onPageHide = () => {
    const { traffic, acquisition, activity } = getFilters();
    for (const section of new Set(getViewedSections())) {
      send(analyticsUpdatesUrl(section, traffic, acquisition, activity), {
        credentials:"same-origin", cache:"no-store", keepalive:true,
      }).catch(() => {});
    }
  };
  target.addEventListener("pagehide", onPageHide);
  return () => target.removeEventListener("pagehide", onPageHide);
}

// Отметки каталога сохраняем для совместимости, но его новые просмотры
// показываем только в общей карточке просмотров страниц в обзоре.
export const SECTION_TABS = { vehicles:["vehicles", "vehicle_cars", "vehicle_favorites"] };

// Все счётчики раздела: у «Каталога» — три вкладки, у остальных — он сам.
export const sectionTabs = (section = "") => SECTION_TABS[section] || [section];

export const sectionFreshCount = (updates = {}, section = "") => section === "vehicles" ? 0 :
  sectionTabs(section).reduce((sum, key) => sum + (Number(updates[key]) || 0), 0);

// Только повторное нажатие активного обзора отмечает всё, кроме заявок.
// Обычный вход в обзор по-прежнему позволяет сначала увидеть новые счётчики.
const OVERVIEW_RESET_SECTIONS = ["overview", "vehicles", "vehicle_cars", "vehicle_favorites", "searches", "customers", "contact_interest"];
export const navigationViewedSections = (next, current) => next === "overview" && current === "overview"
  ? [...OVERVIEW_RESET_SECTIONS]
  : [...new Set([...sectionTabs(next), ...(current === "vehicles" && next !== "vehicles" ? sectionTabs("vehicles") : [])])];

export function clearAnalyticsUpdates(updates, viewedSections) {
  return {
    ...updates,
    ...Object.fromEntries(viewedSections.map((key) => [key, 0])),
    ...(viewedSections.includes("overview") ? { page_views:0 } : {}),
    ...(viewedSections.includes("contact_interest") ? { contact_interest_details:{} } : {}),
  };
}

// Форму набора фильтров задаёт фронтенд; сервер принимает только известные ключи
// и строковые значения разумной длины, чтобы в базу не попадал произвольный JSON.
const FILTER_KEYS = ["type", "brand", "model", "bodyType", "color", "yearMin", "yearMax", "mileage", "priceMin", "priceMax", "drive", "owners", "battery", "condition", "accel", "tire", "torque", "range", "engine", "power", "gearbox", "fuel", "excludeBrand", "excludeModel", "excludeBodyType", "excludeColor", "excludeType", "excludeDrive", "sort"];
const LIST_KEYS = new Set(["model", "bodyType", "color", "excludeBrand", "excludeModel", "excludeBodyType", "excludeColor", "excludeType", "excludeDrive"]);
// Ключи, появившиеся позже запуска сохранённых поисков: вкладка со старой сборкой
// их не шлёт, и это не повод отклонять весь набор — просто ключа не будет.
const OPTIONAL_KEYS = new Set(["accel", "tire", "torque", "range", "engine", "power", "gearbox", "fuel"]);
const MAX_FILTER_VALUE = 80;
const MAX_FILTER_LIST = 30;

export function normalizeSearchFilters(filters) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) return null;
  const normalized = {};
  for (const key of FILTER_KEYS) {
    const value = filters[key];
    if (LIST_KEYS.has(key)) {
      if (value === undefined || value === null) { normalized[key] = []; continue; }
      if (!Array.isArray(value) || value.length > MAX_FILTER_LIST) return null;
      if (value.some((item) => typeof item !== "string" || !item.trim() || item.length > MAX_FILTER_VALUE)) return null;
      normalized[key] = value.map((item) => item.trim());
      continue;
    }
    if ((value === undefined || value === null) && OPTIONAL_KEYS.has(key)) continue;
    if (typeof value !== "string" || !value.trim() || value.length > MAX_FILTER_VALUE) return null;
    normalized[key] = value.trim();
  }
  // Лишние ключи не запрещаем, а отбрасываем: старый клиент после обновления
  // формы фильтров не должен получать отказ на ровном месте.
  return normalized;
}

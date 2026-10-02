// Один снимок для готового HTML и первого кадра браузера. Здесь нет запросов:
// отсутствие сохранённых данных оставляет обычные скелетоны блоков.
export function homeBootFromSnapshot(saved) {
  const popularModels = Array.isArray(saved) ? saved : Array.isArray(saved?.models) ? saved.models : [];
  const brandModelTabs = Array.isArray(saved?.brands) ? saved.brands : [];
  const homeShowcase = Array.isArray(saved?.showcase) ? saved.showcase : [];
  const total = Number(saved?.catalogFacts?.total);
  return {
    ...(popularModels.length || homeShowcase.length ? { popularModels, brandModelTabs, homeShowcase } : {}),
    ...(Number.isFinite(total) && total > 0 ? {
      catalogFacts: { total, updatedAt: String(saved.catalogFacts.updatedAt || "") },
    } : {}),
  };
}

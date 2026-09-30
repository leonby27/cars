const isReportGroup = (group) => /^Осмотр:\s*/u.test(group?.name || "") || group?.name === "Страховая история";

export function reportGroupsForCar(car) {
  return (car?.technicalSpecs?.groups || []).filter(isReportGroup);
}

// Публичная карточка содержит только названия разделов отчёта. Значения приходят
// отдельным запросом после проверки сессии и не попадают в общий CDN-кэш или HTML.
export function publicCarWithoutReport(car) {
  if (!car) return car;
  const groups = car.technicalSpecs?.groups;
  if (!Array.isArray(groups)) return car;
  const reportGroups = groups.filter(isReportGroup);
  if (!reportGroups.length) return car;
  const publicGroups = groups.filter((group) => !isReportGroup(group));
  return {
    ...car,
    reportPreview: reportGroups.map((group) => ({ name:group.name })),
    technicalSpecs: { ...car.technicalSpecs, groups:publicGroups, count:publicGroups.reduce((total, group) => total + (group.items?.length || 0), 0) },
  };
}

import { catalogInput, feedInput, priceInput, duplicateInput, botInput } from './deploy-impact.mjs';
export function deploymentPlan(files, { knownBase = true, pricingRefreshed = false } = {}) {
  const changes = [...new Set(files)];
  const dataChanges = changes.filter(catalogInput);
  const full = !knownBase || pricingRefreshed || dataChanges.length > 0;
  return {
    mode:full ? 'full' : 'presentation',
    reuseCatalog:!full,
    reuseFeed:knownBase && !pricingRefreshed && !changes.some(feedInput),
    recalculatePrices:!knownBase || pricingRefreshed || changes.some(priceInput),
    checkDuplicates:!knownBase || changes.some(duplicateInput),
    migrate:!knownBase || changes.some(file=>file.startsWith('db/migrations/') || file === 'scripts/db-migrate.mjs'),
    restartBot:!knownBase || changes.some(botInput),
    reasons:!knownBase ? ['Нет исходной ревизии для сравнения']
      : pricingRefreshed ? ['Обновлены курсы или квоты']
      : dataChanges.length ? dataChanges : ['Изменены только интерфейс, оформление или проверки'],
  };
}

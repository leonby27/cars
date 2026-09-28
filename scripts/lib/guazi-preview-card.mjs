export const GUAZI_PREVIEW_ID = 'guazi-preview-y2ud7mtru4';
export const GUAZI_PREVIEW_PATH = '/cars/preview-y2ud7mtru4';

/** Keep only fields from the public product page and matched Chinese description. */
export function publicGuaziPreviewSource(source) {
  if (source?.productId !== 'y2ud7mtru4') throw new Error('Expected the public Tesla sample');
  return {
    productId: source.productId, sourceUrl: source.sourceUrl, observedAt: source.observedAt,
    brand: source.brand, model: source.model, modelYear: source.modelYear,
    mileageKm: source.mileageKm, manufactureDate: source.manufactureDate,
    firstRegistration: source.firstRegistration, vin: source.vin,
    catalogFields: source.catalogFields, batteryHealth: source.batteryHealth,
    technicalSpecs: source.technicalSpecs, images: source.images, prices: source.prices,
    china: source.china,
    // This grade is extracted from the public reportDetailLite, not the authenticated report.
    inspection: { exportGrade: source.inspection?.exportGrade ?? null },
  };
}

// Translation of the exact repair excerpt in this car's public Chinese description.
// Do not supplement it with findings or measurements from the full inspection.
const publicRepairTranslations = new Map([
  ['后围板及右底边梁有轻微钣金修复，属局部外观维护。', 'В описании указан кузовной ремонт задней панели и правого нижнего бокового элемента.'],
]);

/** No full-report dependency, authenticated request, or report-photo fallback. */
export function buildGuaziPreviewCard(input, photos) {
  const source = publicGuaziPreviewSource(input);
  const saved = new Map(photos.filter(p => p.status === 'saved').map(p => [p.url, p]));
  const images = source.images.map(img => {
    const photo = saved.get(img.sourceUrl);
    if (!photo || !/^photos\/y2ud7mtru4\/\d+-[a-f0-9]{16}\.(jpg|png|webp)$/.test(photo.file)) throw new Error('Missing local photo');
    return `/__local-guazi/${photo.file}`;
  });
  const fob = source.prices?.find(p => p.basis === 'FOB' && p.currency === 'USD' && p.port === 'Horgos, China' && Number.isFinite(p.amount) && p.amount > 0);
  if (!fob) throw new Error('Missing FOB quote for Horgos; another port cannot use the Horgos delivery route');
  const condition = source.china?.condition || {};
  const summary = (condition.repairExcerpts || []).map(text => publicRepairTranslations.get(text)).filter(Boolean).join(' ');
  return {
    id: GUAZI_PREVIEW_ID, source: 'Guazi', sourceId: source.productId, sourceUrl: source.sourceUrl,
    localPreview: true, title: 'Tesla Model Y 2024', brand: source.brand, model: source.model, trim: 'Rear-Wheel-Drive',
    year: source.modelYear, type: 'Электромобиль', bodyType: 'Кроссовер', city: 'Чэнду',
    mileage: source.mileageKm, manufactureDate: source.manufactureDate, firstRegistration: source.firstRegistration,
    vin: source.vin, ...source.catalogFields, batteryHealth: source.batteryHealth,
    priceBasis: 'FOB', fobPriceUsd: fob.amount, fobPort: 'Horgos',
    chinaPrice: source.china?.status === 'matched' ? source.china.price?.amount : null, priceRating: null, appearanceScore: condition.appearanceScore,
    conditionGrade: source.inspection.exportGrade, conditionGradeLabel: 'Оценка в карточке', chinaGrade: source.china?.grade ?? null,
    conditionSummary: summary || null,
    insuranceClaims: condition.insuranceClaimCount, transfers: source.china?.transferCount ?? null,
    technicalSpecs: source.technicalSpecs, images, image: images[0],
    exteriorImageCount: source.images.filter(img => img.groups.includes('exterior')).length,
    importedAt: source.observedAt, checkedAt: source.observedAt, updatedAt: source.observedAt,
    sourceSnapshot: { observedAt: source.observedAt, chinaUrl: source.china?.sourceUrl ?? null, exportPrices: source.prices },
  };
}

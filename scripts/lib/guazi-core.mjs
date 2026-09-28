import { canonicalImportBrand, canonicalImportName, IMPORT_BRANDS, importPolicyViolation, isAbovePriceCeiling } from '../../config/import-policy.mjs';
import { PRICING, estimateLandedCost } from '../../src/pricing.js';
import { normalizeCard, productId, sourceUrl } from './guazi-pilot-data.mjs';

export function coreBrand(name, config) { return config.sourceBrandAliases[name] || canonicalImportBrand(name); }
export const publicFuel = fuel => ({BEV:'Электромобиль',PHEV:'Гибрид',REEV:'Гибрид',EREV:'Гибрид',HEV:'Гибрид',Gasoline:'ДВС'})[fuel] || null;
export function registrationYear(value) {
  const match = String(value || '').match(/^(20\d{2})(?:[.-]?(0[1-9]|1[0-2]))(?:[.-]?\d{2})?$/);
  return match ? Number(match[1]) : null;
}
export function vehiclePriceCny(text) {
  const match = String(text ?? '').trim().match(/^(\d+(?:,\d{3})*(?:\.\d+)?)\s*(万元|万|元|CNY|人民币)?$/i);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(',','')) * (/万/.test(match[2] || '') ? 10000 : 1);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}
export function brandFilters(brand, filters) { return filters.chineseBrands.includes(brand) ? filters.chinese : filters.other; }

export function makeSegments(brands, filters, config) {
  const segments = [];
  for (const source of brands) {
    const brand = coreBrand(source.name, config);
    if (!IMPORT_BRANDS.includes(brand)) continue;
    if (!/^\d+$/.test(String(source.id))) throw new Error('Invalid observed brand ID');
    const own = brandFilters(brand, filters);
    for (const fuel of config.fuels) {
      const url = new URL('https://en.guazi.com/used-cars/');
      for (const [key,value] of Object.entries({tradeType:'buyItNow',brandId:source.id,fuelType:fuel.queryCode,licenseYear:`${own.minYear},`})) url.searchParams.set(key,value);
      segments.push({id:`${source.id}-${fuel.key}`,brand,sourceBrand:source.name,sourceBrandId:String(source.id),covers:[brand,...(config.parentBrandCoverage[brand]||[])],fuel:fuel.key,sourceFuelNames:fuel.sourceNames,fuelCode:fuel.queryCode,minRegistrationYear:own.minYear,minVehicleUsd:own.minPrice*1000,maxVehicleUsd:own.maxPrice*1000,url:url.href});
    }
  }
  return segments;
}
export function searchBody(segment, config, pageNum, eligibility) {
  if (!Number.isInteger(pageNum) || pageNum < 1 || ![0,1].includes(eligibility)) throw new Error('Invalid list partition');
  return {language:'en',brandId:segment.sourceBrandId,fuelTypes:[segment.fuelCode],licenseYearStart:segment.minRegistrationYear,businessType:5,businesses:[1,2,5,6,7,8,9,10],clientScene:'cars',sourceFrom:'wap',countryCode:config.countryCode,pageSize:config.pageSize,pageNum,exportPolicyEligible:eligibility};
}
export function listCandidate(item, segment) {
  if (!/^[a-z0-9]{10}$/.test(item.productId || '')) throw new Error('Invalid candidate ID');
  const url = sourceUrl(`https://en.guazi.com/products/${item.seoUri}`);
  if (productId(url) !== item.productId) throw new Error('List identity mismatch');
  // Check source-side filtering before spending a detail request; unknown values need review.
  const violations = [];
  if (String(item.brandId) !== segment.sourceBrandId) violations.push('list_brand_mismatch');
  if (!segment.sourceFuelNames.includes(item.fuelTypeName)) violations.push('list_fuel_mismatch');
  const year = registrationYear(item.licenseDate);
  if (year === null) violations.push('registration_unknown');
  else if (year < segment.minRegistrationYear) violations.push('registration_year');
  return {id:item.productId,url,segmentId:segment.id,brand:segment.brand,fuel:item.fuelTypeName,registrationYear:year,violations};
}
export function normalizeCoreCard(capture, config) {
  const card = normalizeCard(capture.rawData, capture.url, capture.observedAt);
  const sourceBrand = coreBrand(capture.rawData.makeNameEn, config);
  const type = publicFuel(card.fuel);
  const name = canonicalImportName(config.sourceBrandAliases[capture.rawData.makeNameEn] || capture.rawData.makeNameEn, card.model, type, {rawModel:card.title});
  const provisional = {brand:name.brand,model:name.model,year:card.modelYear,type};
  const violation = importPolicyViolation(provisional);
  // Pilot selection was BEV-only; core policy is explicit and covers all four feeds.
  card.selection = {eligible:!violation,violations:violation?[violation]:[]};
  card.catalogIdentity = {...provisional,sourceBrand};
  return card;
}
export function evaluateCoreCard(card, segment, config, rate = (PRICING.cnyBynPer10 / 10) / PRICING.usdByn) {
  const reject = reason => ({status:'rejected',reason});
  const pending = reason => ({status:'needs_review',reason});
  if (!card.selection.eligible) return reject(card.selection.violations.join('; '));
  if (!segment.sourceFuelNames.includes(card.fuel)) return pending('detail_fuel_mismatch');
  if (card.catalogIdentity.sourceBrand !== segment.brand) return pending('detail_brand_mismatch');
  const year = registrationYear(card.firstRegistration);
  if (year === null) return pending('registration_unknown');
  if (year < segment.minRegistrationYear) return reject('registration_year');
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid currency rate');
  const isFob = config.priceBasis === 'FOB';
  const quote = isFob ? card.prices.find(p=>p.basis==='FOB' && p.currency==='USD' && p.port==='Horgos, China' && Number.isFinite(p.amount) && p.amount>0) : null;
  if (isFob && !quote) return pending('fob_horgos_missing');
  if (!isFob && card.china?.status !== 'matched') return pending(`china_${card.china?.status || 'missing'}`);
  const domestic = card.china?.status === 'matched' ? vehiclePriceCny(card.china.fields?.full_payment) : null;
  if (!isFob && domestic === null) return pending('vehicle_price_missing');
  const vehicleUsd = isFob ? quote.amount : domestic * rate;
  // price_cny remains a required legacy database column, explicitly marked as
  // a converted quote for FOB. All displayed totals use the original USD quote.
  const cny = isFob ? Math.round(quote.amount/rate) : domestic;
  if (vehicleUsd < segment.minVehicleUsd || vehicleUsd > segment.maxVehicleUsd) return reject(isFob?'fob_price_range':'vehicle_price_range');
  const fields = card.catalogFields;
  const rows = card.technicalSpecs.groups.flatMap(g=>g.items);
  const field = re => rows.find(row=>re.test(row.name))?.value;
  const sourceEngine = card.specifications.engine || null;
  const engineModel = field(/^Engine Model$/i) || null;
  const ccText = field(/^Displacement \(mL\)$|^Displacement \(ml\)$|^Displacement \(cc\)$/i);
  const literText = card.specifications.engineDisplacement || field(/^Displacement \(L\)$/i);
  const engineLiters = ccText && /^\d+$/.test(ccText) ? Number(ccText)/1000 : /^\d+(?:\.\d+)?$/.test(String(literText || '')) ? Number(literText) : Number(String(sourceEngine || '').match(/(\d+(?:\.\d+)?)\s*[LT]\b/i)?.[1]);
  const engineCc = Number.isFinite(engineLiters) && engineLiters >= 0.5 && engineLiters <= 8 ? Math.round(engineLiters*1000) : null;
  const engine = engineCc === null ? null : `${engineCc/1000}L`;
  const positive = text => /^\d+(?:\.\d+)?$/.test(String(text || '')) && Number(text)>0 ? Number(text) : null;
  const engineHorsepower = positive(field(/^Maximum Horsepower \(ps\)$/i) || card.specifications.horsepower);
  const type = card.catalogIdentity.type;
  const motorOnly = ['BEV','REEV','EREV'].includes(card.fuel);
  const horsepower = motorOnly ? fields.horsepower : card.fuel === 'Gasoline' ? engineHorsepower : null;
  if (type !== 'Электромобиль' && engineCc === null) return pending('engine_volume_unknown');
  const car = {
    id:`guazi-${card.productId}`,source:'Guazi',sourceId:card.productId,externalId:card.productId,sourceUrl:card.sourceUrl,
    brand:card.catalogIdentity.brand,model:card.catalogIdentity.model,year:card.modelYear,type,
    title:card.title,mileage:card.mileageKm,city:card.location,manufactureDate:card.manufactureDate,firstRegistration:card.firstRegistration,vin:card.vin,
    ...fields,horsepower,horsepowerDerivation:motorOnly?fields.horsepowerDerivation:null,engineHorsepower,motorHorsepower:fields.horsepower,engine,sourceEngine,engineModel,engineCc,engineVolume:engineCc===null?null:engineCc/1000,
    sourceFuelType:['REEV','EREV'].includes(card.fuel)?'Extended range':card.fuel,
    bodyType:card.specifications.bodyType,technicalSpecs:card.technicalSpecs,
    chinaPrice:cny,priceBasis:isFob?'FOB':'domestic_vehicle_cny',
    ...(isFob?{fobPriceUsd:quote.amount,fobPort:'Horgos',chinaPriceBasis:'converted_fob',usdPrice:quote.amount}:{}),
    priceSourceUrl:isFob?card.sourceUrl:card.china.sourceUrl,priceObservedAt:isFob?card.observedAt:card.china.fetchedAt,
    conditionGrade:card.inspection.exportGrade,chinaGrade:card.china?.grade,appearanceScore:card.china?.condition?.appearanceScore,
    batteryHealth:card.batteryHealth,insuranceClaims:card.china?.condition?.insuranceClaimCount,transfers:card.china?.transferCount,
    condition:card.china?.condition,conditionConflicts:card.china?.conflicts,
    images:card.images.map(image=>image.sourceUrl),image:card.images[0]?.sourceUrl,
    observedAt:card.observedAt,importedAt:card.observedAt,availabilityStatus:'unverified',
  };
  const estimate = estimateLandedCost(car);
  if (!Number.isFinite(estimate.totalUsd)) return pending('estimate_unavailable');
  if (isAbovePriceCeiling(estimate.totalUsd)) return reject('landed_price_ceiling');
  return {status:'accepted',priceBasis:car.priceBasis,priceUsd:vehicleUsd,...(isFob?{fobPriceUsd:quote.amount}:{vehiclePriceCny:cny,vehiclePriceUsd:vehicleUsd}),rate,rateDate:PRICING.rateDate,estimatedTotalUsd:estimate.totalUsd,car};
}

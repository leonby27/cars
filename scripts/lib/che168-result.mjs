import { che168DetailMatchesListing } from './che168-parser.mjs';
import { positiveSourceAmount } from './source-money.mjs';

// HTTP 200 / a Flight shell / missing price do not prove a sale. Without
// affirmative source evidence keep the previous record and defer the check.
export function che168DetailOutcome(payload, externalId, status) {
  const unknown = reason => ({ verdict: 'unknown', status, reason });
  if (status !== 200) return unknown('http-error');
  if (!payload?.detail) return unknown('detail-missing');
  if (String(payload.detail.infoid) === '0') return unknown('placeholder-id');
  if (!che168DetailMatchesListing(payload, externalId)) return unknown('identity-mismatch');
  const price = positiveSourceAmount(payload.detail.price);
  if (price === null || che168PriceCny(price) < 1 || che168PriceCny(price) > 2147483647) return unknown('price-unverified');
  return { verdict: 'alive', price };
}

export const CHE168_VERIFICATION_VERSION = 1;
export const CHE168_USD_TO_CNY = 7.15;
export const isChe168ListingId = id => /^[1-9]\d*$/.test(String(id));
export const che168DetailUrl = id => isChe168ListingId(id) ? `https://global.che168.com/en/detail/${id}` : null;
export const che168PriceCny = usd => Math.round(usd * CHE168_USD_TO_CNY / 100) * 100;

export function assertChe168Evidence(evidence, externalId, verdict, price) {
  const url = che168DetailUrl(externalId);
  const source = verdict === 'sold' ? 'public-sold-panel' : 'public-active-card';
  const validFields = verdict === 'sold'
    ? evidence?.returnedId == null || evidence.returnedId === '0' || evidence.returnedId === String(externalId)
    : evidence?.returnedId === String(externalId) && evidence.currency === 'USD'
      && evidence.basis === 'Vehicle Price' && positiveSourceAmount(price) === price && evidence.amount === price
      && che168PriceCny(price) > 0 && che168PriceCny(price) <= 2147483647;
  if (!url || evidence?.externalId !== String(externalId) || evidence.url !== url || evidence.status !== 200
    || evidence.version !== CHE168_VERIFICATION_VERSION || evidence.source !== source
    || !Number.isFinite(Date.parse(evidence.observedAt)) || !validFields) {
    throw Object.assign(new Error(`Che168: результат проверки не подтверждён для ${externalId}`), { code: 'CHE168_INTEGRITY_FAILED' });
  }
}

export function assertVerifiedChe168Car(car) {
  assertChe168Evidence(car.sourceAvailability, car.externalId, 'alive', car.usdPrice);
  if (car.source !== 'Che168' || car.id !== `che168-${car.externalId}` || car.sourceUrl !== car.sourceAvailability.url
    || car.priceBasis !== 'Vehicle Price' || car.sourcePriceUsd !== car.usdPrice
    || car.chinaPrice !== che168PriceCny(car.usdPrice) || (car.sourcePrice ?? car.chinaPrice) !== car.chinaPrice
    || (car.sourceCurrency != null && car.sourceCurrency !== 'CNY')
    || car.checkedAt !== car.sourceAvailability.observedAt) {
    throw Object.assign(new Error(`Che168: запись не соответствует проверенной карточке ${car.externalId}`), { code: 'CHE168_INTEGRITY_FAILED' });
  }
}

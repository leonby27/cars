import {SITE} from './site-profile.js';
export const BRAND_PRICE_SEGMENTS = Object.freeze([
  Object.freeze({ label: "Все сегменты", min: null, max: null }),
  Object.freeze({ label: SITE.market==="RU"?"До 2 000 000 ₽":"До 20 000 $", min: null, max: SITE.market==="RU"?2000000:20000 }),
  Object.freeze({ label: SITE.market==="RU"?"2 000 000–4 000 000 ₽":"20 000–40 000 $", min: SITE.market==="RU"?2000000:20000, max: SITE.market==="RU"?4000000:40000 }),
  Object.freeze({ label: SITE.market==="RU"?"От 4 000 000 ₽":"От 40 000 $", min: SITE.market==="RU"?4000000:40000, max: null }),
]);

export function brandMatchesPriceSegment(facts, selectedLabel) {
  const segment = BRAND_PRICE_SEGMENTS.find((item) => item.label === selectedLabel) || BRAND_PRICE_SEGMENTS[0];
  if (segment.min == null && segment.max == null) return true;
  return (facts?.priceRanges || []).some((range) => {
    const min = range.min == null ? Number.NaN : Number(range.min);
    const max = range.max == null ? Number.NaN : Number(range.max);
    if (!Number.isFinite(min) && !Number.isFinite(max)) return false;
    const lower = Number.isFinite(min) ? min : max;
    const upper = Number.isFinite(max) ? max : min;
    return (segment.min == null || upper >= segment.min) && (segment.max == null || lower <= segment.max);
  });
}

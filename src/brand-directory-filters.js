export const BRAND_PRICE_SEGMENTS = Object.freeze([
  Object.freeze({ label: "Все сегменты", min: null, max: null }),
  Object.freeze({ label: "До 20 000 $", min: null, max: 20000 }),
  Object.freeze({ label: "20 000–40 000 $", min: 20000, max: 40000 }),
  Object.freeze({ label: "От 40 000 $", min: 40000, max: null }),
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

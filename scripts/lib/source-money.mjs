// Prices are whole amounts, never the first number in a label, range or error.
// Guazi has been observed using both "$" and "$$" prefixes.
export function positiveSourceAmount(value, { dollars = false } = {}) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (dollars) text = text.replace(/^(?:US\s*\$|\${1,2}|USD)\s*/i, '').replace(/\s+USD$/i, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replaceAll(',', ''));
  return Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
}

export function sourceQuoteChange(previous, current, reportingThreshold = 100) {
  const before = positiveSourceAmount(previous);
  const after = positiveSourceAmount(current);
  if (after === null) throw Error('Unverified source price');
  return { changed: before !== after, significant: before === null || Math.abs(after - before) >= reportingThreshold };
}

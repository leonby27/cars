export function formatRoundedListingCount(value) {
  const count = Math.max(0, Math.floor(Number(value) || 0));
  if (count < 100) return `${count}+`;
  return `${Math.floor(count / 100) * 100}+`;
}

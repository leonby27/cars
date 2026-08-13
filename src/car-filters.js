export function minimumYear(value) {
  return Number(String(value || "").match(/\d{4}/)?.[0] || 0);
}

export function matchesMinimumYear(car, value) {
  return Number(car.year) >= minimumYear(value);
}

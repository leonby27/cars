export function minimumYear(value) {
  return Number(String(value || "").match(/\d{4}/)?.[0] || 0);
}

export function matchesMinimumYear(car, value) {
  return Number(car.year) >= minimumYear(value);
}

export function sortCars(cars, sort = "newest") {
  const sorted = [...cars];
  const listedAt = (car) => {
    if (!car.sourceListedAt) return null;
    const timestamp = new Date(car.sourceListedAt).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  };
  const landedPrice = (car) => Number(car.estimatedTotalUsd ?? car.totalUsd ?? 0);
  const year = (car) => Number(car.year) || null;
  const range = (car) => Number(car.range ?? car.electricRange ?? car.combinedRange) || null;
  const compareNullable = (a, b, direction = 1) => {
    if (a == null) return b == null ? 0 : 1;
    if (b == null) return -1;
    return (a - b) * direction;
  };

  if (sort === "price_asc") return sorted.sort((a, b) => landedPrice(a) - landedPrice(b));
  if (sort === "price_desc") return sorted.sort((a, b) => landedPrice(b) - landedPrice(a));
  if (sort === "mileage_asc") return sorted.sort((a, b) => Number(a.mileage) - Number(b.mileage));
  if (sort === "range_desc") return sorted.sort((a, b) => compareNullable(range(a), range(b), -1));
  if (sort === "year_desc") return sorted.sort((a, b) => compareNullable(year(a), year(b), -1));
  if (sort === "year_asc") return sorted.sort((a, b) => compareNullable(year(a), year(b)));
  return sorted.sort((a, b) => compareNullable(listedAt(a), listedAt(b), -1));
}

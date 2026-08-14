export function minimumYear(value) {
  return Number(String(value || "").match(/\d{4}/)?.[0] || 0);
}

export function matchesMinimumYear(car, value) {
  return Number(car.year) >= minimumYear(value);
}

export function sortCars(cars, sort = "newest") {
  const sorted = [...cars];
  const checkedAt = (car) => {
    const timestamp = new Date(car.checkedAt || car.importedAt || 0).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };
  const landedPrice = (car) => Number(car.estimatedTotalUsd ?? car.totalUsd ?? 0);

  if (sort === "price_asc") return sorted.sort((a, b) => landedPrice(a) - landedPrice(b));
  if (sort === "price_desc") return sorted.sort((a, b) => landedPrice(b) - landedPrice(a));
  if (sort === "mileage_asc") return sorted.sort((a, b) => Number(a.mileage) - Number(b.mileage));
  return sorted.sort((a, b) => checkedAt(b) - checkedAt(a));
}

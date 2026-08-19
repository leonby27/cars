import { seededRandom, varietyOrder } from "./car-variety.js";

// Границы приходят числами или null — ярлыки селектов остаются в UI.
export function matchesYearRange(car, yearMin, yearMax) {
  const year = Number(car.year) || 0;
  return (!yearMin || year >= Number(yearMin)) && (!yearMax || year <= Number(yearMax));
}

export function sortCars(cars, sort = "newest", seed = "") {
  const sorted = [...cars];
  const listedAt = (car) => {
    const value = car.sourceListedAt || car.firstSeenAt || car.importedAt;
    if (!value) return null;
    const timestamp = new Date(value).getTime();
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

  if (sort === "default") return varietyOrder(sorted, seededRandom(seed));
  if (sort === "price_asc") return sorted.sort((a, b) => landedPrice(a) - landedPrice(b));
  if (sort === "price_desc") return sorted.sort((a, b) => landedPrice(b) - landedPrice(a));
  if (sort === "mileage_asc") return sorted.sort((a, b) => Number(a.mileage) - Number(b.mileage));
  if (sort === "range_desc") return sorted.sort((a, b) => compareNullable(range(a), range(b), -1));
  if (sort === "year_desc") return sorted.sort((a, b) => compareNullable(year(a), year(b), -1));
  if (sort === "year_asc") return sorted.sort((a, b) => compareNullable(year(a), year(b)));
  return sorted.sort((a, b) => compareNullable(listedAt(a), listedAt(b), -1));
}

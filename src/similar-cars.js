import { normalizeBodyType } from "./body-types.js";
import { estimateLandedCost } from "./pricing.js";

export const SIMILAR_CAR_BUDGET_TOLERANCE = 0.2;

const normalizedText = (value) => String(value || "").trim().toLocaleLowerCase("ru-RU");
const modelIdentity = (car) => `${normalizedText(car?.brand)}::${normalizedText(car?.model)}`;
const landedPrice = (car) => {
  if (!(Number(car?.chinaPrice) > 0)) return 0;
  return Number(estimateLandedCost(car).totalUsd) || 0;
};

export function selectSimilarCars(current, cars, limit = 12) {
  if (!current || !Array.isArray(cars) || limit <= 0) return [];

  const currentBodyType = normalizeBodyType(current);
  const currentModel = modelIdentity(current);
  const currentPrice = landedPrice(current);
  if (currentBodyType === "Не определён" || !currentPrice) return [];

  return cars
    .filter((candidate) => {
      if (!candidate || candidate.id === current.id) return false;
      if (modelIdentity(candidate) === currentModel) return false;
      if (normalizeBodyType(candidate) !== currentBodyType) return false;

      const candidatePrice = landedPrice(candidate);
      return candidatePrice > 0 && Math.abs(candidatePrice - currentPrice) / currentPrice <= SIMILAR_CAR_BUDGET_TOLERANCE;
    })
    .map((candidate) => ({
      candidate,
      priceDifference: Math.abs(landedPrice(candidate) - currentPrice),
      yearDifference: Math.abs((Number(candidate.year) || 0) - (Number(current.year) || 0)),
    }))
    .sort(
      (left, right) =>
        left.priceDifference - right.priceDifference ||
        left.yearDifference - right.yearDifference ||
        String(left.candidate.id).localeCompare(String(right.candidate.id)),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

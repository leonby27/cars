import { normalizeBodyType } from "./body-types.js";
import { estimateLandedCost } from "./pricing.js";

export const SIMILAR_CAR_BUDGET_TOLERANCE = 0.2;
// Second budget band: kept only because the strict one leaves rare cars (an Audi
// A6L among Chinese sedans) with one or two recommendations at most.
export const SIMILAR_CAR_WIDE_BUDGET_TOLERANCE = 0.45;

// Bodies a buyer usually cross-shops: the low group and the tall group. A match
// inside a group ranks below an exact body type but above an unrelated one.
const bodyGroups = [
  new Set(["Седан", "Лифтбек", "Хэтчбек", "Универсал"]),
  new Set(["SUV / кроссовер", "Минивэн"]),
];

const normalizedText = (value) => String(value || "").trim().toLocaleLowerCase("ru-RU");
const modelIdentity = (car) => `${normalizedText(car?.brand)}::${normalizedText(car?.model)}`;
const landedPrice = (car) => {
  if (!(Number(car?.chinaPrice) > 0)) return 0;
  return Number(estimateLandedCost(car).totalUsd) || 0;
};

const bodyAffinity = (candidateBody, currentBody) => {
  if (candidateBody === currentBody) return 0;
  if (bodyGroups.some((group) => group.has(candidateBody) && group.has(currentBody))) return 1;
  return 2;
};

// Exact body plus the strict budget comes first, then the same body in the wide
// budget, and unrelated bodies only fill what is left.
const tier = (affinity, priceBand) => (affinity === 2 ? 4 + priceBand : affinity + priceBand * 2);

export function selectSimilarCars(current, cars, limit = 60) {
  if (!current || !Array.isArray(cars) || limit <= 0) return [];

  const currentBodyType = normalizeBodyType(current);
  const currentModel = modelIdentity(current);
  const currentPrice = landedPrice(current);
  if (!currentPrice) return [];

  return cars
    .map((candidate) => {
      if (!candidate || candidate.id === current.id) return null;
      if (modelIdentity(candidate) === currentModel) return null;

      const candidatePrice = landedPrice(candidate);
      if (!(candidatePrice > 0)) return null;
      const priceDifference = Math.abs(candidatePrice - currentPrice);
      const priceRatio = priceDifference / currentPrice;
      if (priceRatio > SIMILAR_CAR_WIDE_BUDGET_TOLERANCE) return null;

      const candidateBodyType = normalizeBodyType(candidate);
      // An undetermined body on either side cannot be compared, so such a card
      // only competes on budget.
      const affinity =
        currentBodyType === "Не определён" || candidateBodyType === "Не определён"
          ? 2
          : bodyAffinity(candidateBodyType, currentBodyType);

      return {
        candidate,
        tier: tier(affinity, priceRatio <= SIMILAR_CAR_BUDGET_TOLERANCE ? 0 : 1),
        priceDifference,
        yearDifference: Math.abs((Number(candidate.year) || 0) - (Number(current.year) || 0)),
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        left.tier - right.tier ||
        left.priceDifference - right.priceDifference ||
        left.yearDifference - right.yearDifference ||
        String(left.candidate.id).localeCompare(String(right.candidate.id)),
    )
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

import { estimateLandedCost } from "./pricing.js";

// How many pool cards are weighed when choosing the next card of a feed.
export const FEED_CANDIDATE_WINDOW = 24;
const priceBracket = (car) => Math.round((Number(car.estimatedTotalUsd) || estimateLandedCost(car).totalUsd || 0) / 5000);

// Landed cost is expensive to recompute, and the variety pass reads it for every
// candidate it weighs, so each car keeps the comparison keys it was built with.
const varietyKeys = new WeakMap();
const varietyKey = (car) => {
  let key = varietyKeys.get(car);
  if (!key) {
    key = { brand:car.brand, model:car.model, bodyType:car.bodyType, price:priceBracket(car) };
    varietyKeys.set(car, key);
  }
  return key;
};

// How different a candidate is from the cards just shown, as a penalty counted down
// from zero. Plain shuffling is not enough: the pool leans towards whatever an import
// last added, so a run of the same model, body type and price lands next to each
// other. Brand and model weigh most because that is what a visitor notices first, and
// a repeat right under the previous card weighs more than one three cards up —
// without that, every candidate ties as soon as the recent cards cover the field.
export const varietyScore = (car, recent) => {
  const key = varietyKey(car);
  let penalty = 0;
  for (let index = 0; index < recent.length; index += 1) {
    const item = varietyKey(recent[index]);
    const matched = (item.brand === key.brand ? 8 : 0) + (item.model === key.model ? 4 : 0) + (item.bodyType === key.bodyType ? 2 : 0) + (item.price === key.price ? 1 : 0);
    penalty += matched / (recent.length - index);
  }
  return -penalty;
};
const PERFECT_VARIETY_SCORE = 0;

export function shuffleCars(cars, random = Math.random) {
  const shuffled = [...cars];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

// A plain shuffle is repeatable but not deterministic, and the catalog has to keep
// one order while a visitor pages through it, so callers pass a seed instead.
export function seededRandom(seed) {
  let state = 0x9e3779b9;
  for (const character of String(seed)) state = Math.imul(state ^ character.charCodeAt(0), 0x01000193) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Shuffle, then walk the result choosing the most different card left inside a
// small window. Same idea as the home feed, applied to a whole list at once.
export function varietyOrder(cars, random = Math.random, preceding = []) {
  if (cars.length < 3) return [...cars];
  const pool = shuffleCars(cars, random);
  const ordered = [];
  const window = [];
  // Cards already on screen count as recent, so appending a page does not seam two
  // similar cards together.
  const recent = preceding.slice(-3);
  let cursor = 0;
  while (ordered.length < pool.length) {
    while (window.length < FEED_CANDIDATE_WINDOW && cursor < pool.length) window.push(pool[cursor++]);
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < window.length; index += 1) {
      const score = varietyScore(window[index], recent);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
      if (bestScore === PERFECT_VARIETY_SCORE) break;
    }
    const [car] = window.splice(bestIndex, 1);
    ordered.push(car);
    recent.push(car);
    if (recent.length > 3) recent.shift();
  }
  return ordered;
}

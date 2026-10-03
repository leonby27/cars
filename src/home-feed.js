import { CORE_MODELS } from "./social-priority-models.js";
import { shuffleCars, varietyScore, FEED_CANDIDATE_WINDOW } from "./car-variety.js";

export const HOME_PRIORITY_SHARE = 0.75;
const modelKey = (car) => JSON.stringify([car.brand, car.model]);
const socialModels = new Set(CORE_MODELS.map(modelKey));
export const isHomePriority = (car) => car.available !== false
  && socialModels.has(modelKey(car)) && Number(car.homeMarketSavingPercent) > 0;

// Every four slots include three priority cars. The first ten slots therefore
// include eight, and twenty include fifteen; appending preserves the same mix.
export function selectHomeFeed(cars, count, { random = Math.random, preceding = [], offset = 0 } = {}) {
  const unique = [...new Map(cars.filter(car => car?.id && car.available !== false).map(car => [car.id, car])).values()];
  const pools = [false, true].map(priority => shuffleCars(unique.filter(car => isHomePriority(car) === priority), random));
  const chosen = [];
  const recent = preceding.slice(-3);
  while (chosen.length < count && pools.some(pool => pool.length)) {
    const wantPriority = (offset + chosen.length) % 4 !== 3;
    const pool = pools[Number(wantPriority)].length ? pools[Number(wantPriority)] : pools[Number(!wantPriority)];
    let bestIndex = 0, bestScore = -Infinity;
    for (let index = 0; index < Math.min(pool.length, FEED_CANDIDATE_WINDOW); index++) {
      // Strong savings get a modest preference without turning the feed into
      // repeated models. Both the social list and a real saving are required.
      const score = varietyScore(pool[index], recent) + (isHomePriority(pool[index]) && Number(pool[index].homeMarketSavingPercent) >= 10 ? 2 : 0);
      if (score > bestScore) { bestIndex = index; bestScore = score; }
    }
    const [car] = pool.splice(bestIndex, 1);
    chosen.push(car);
    recent.push(car);
    if (recent.length > 3) recent.shift();
  }
  return chosen;
}

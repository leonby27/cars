export const FRESH_CANDIDATE_LIMIT = 1000;

// Input is newest first. Take one new model per brand on each round, then
// preserve chronological order for repeated models and everything past the cap.
export function freshCatalogOrder(cars) {
  const candidates = cars.slice(0, FRESH_CANDIDATE_LIMIT);
  const brands = new Map();
  for (const car of candidates) {
    if (!brands.has(car.brand)) brands.set(car.brand, new Map());
    const models = brands.get(car.brand);
    if (!models.has(car.model)) models.set(car.model, car);
  }
  const queues = [...brands.values()].map(models => [...models.values()]);
  const heads = [];
  for (let round = 0; queues.some(queue => round < queue.length); round++) {
    for (const queue of queues) if (queue[round]) heads.push(queue[round]);
  }
  const selected = new Set(heads.map(car => car.id));
  return [...heads, ...candidates.filter(car => !selected.has(car.id)), ...cars.slice(FRESH_CANDIDATE_LIMIT)];
}

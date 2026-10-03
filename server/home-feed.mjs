import { CORE_MODELS } from "../src/social-priority-models.js";
import { vehicleMarketSample } from "../src/vehicle-market-savings.js";

const mileageEdges = [0, 20001, 50001, 100001, 150001, 200001];

// Reuse the vehicle comparison's sufficient-sample/year/mileage fallback rules.
// Each interval has one reference: the Belarus median, in delivered USD without
// quota or Decree 140, matching stored listing prices and social publications.
export function homeMarketReferences(data) {
  const references = [];
  for (const card of data?.cards || []) {
    if (card.longVersion) continue;
    for (const year of card.years || []) for (let index = 0; index <= mileageEdges.length; index++) {
      const unknownMileage = index === mileageEdges.length;
      const mileage = unknownMileage ? null : mileageEdges[index];
      const sample = vehicleMarketSample({ brand:card.brand, model:card.model, type:card.type, year:year.year, mileage }, { cards:[card] });
      const median = sample?.prices?.belarus?.median;
      if (!Number.isFinite(median) || median <= 0) continue;
      references.push({ brand:card.brand, model:card.model, type:card.type, year:Number(year.year),
        mileage_min:mileage, mileage_max:unknownMileage ? null : (mileageEdges[index + 1] ?? null), median });
    }
  }
  return references;
}

// Rank narrow listing tuples before loading photos/payloads. Keep both groups
// available to the shared 75% selector; a short group can use the other's spare
// cars. Model ranks spread the candidate pool across models before repeats.
export function homeFeedQuery({ where, values, limit, references, carSelect }) {
  const referenceParam = `$${values.length + 1}`;
  const socialParam = `$${values.length + 2}`;
  const limitParam = `$${values.length + 3}`;
  return {
    values:[...values, JSON.stringify(references), JSON.stringify(CORE_MODELS), limit],
    text:`WITH reference AS (
      SELECT * FROM jsonb_to_recordset(${referenceParam}::jsonb) AS r(brand text, model text, type text, year int, mileage_min int, mileage_max int, median numeric)
    ), social AS (
      SELECT * FROM jsonb_to_recordset(${socialParam}::jsonb) AS s(brand text, model text)
    ), candidates AS (
      SELECT l.id, v.brand, v.model,
        CASE WHEN l.estimated_total_usd > 0 AND l.estimated_total_usd < r.median
          THEN (r.median-l.estimated_total_usd)/r.median*100 ELSE 0 END AS saving,
        (s.brand IS NOT NULL AND COALESCE(l.estimated_total_usd > 0 AND l.estimated_total_usd < r.median, false)) AS priority
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id
      LEFT JOIN social s ON s.brand=v.brand AND s.model=v.model
      LEFT JOIN reference r ON r.brand=v.brand AND r.model=v.model AND r.type=v.powertrain AND r.year=v.model_year
        AND ((r.mileage_min IS NULL AND (l.mileage_km IS NULL OR l.mileage_km < 0))
          OR (l.mileage_km>=r.mileage_min AND (r.mileage_max IS NULL OR l.mileage_km<r.mileage_max)))
      ${where}
    ), model_ranked AS (
      SELECT *, row_number() OVER (PARTITION BY priority, brand, model ORDER BY random()) AS model_rank FROM candidates
    ), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY priority ORDER BY model_rank, random()) AS group_rank FROM model_ranked
    ), picked AS (SELECT * FROM ranked WHERE group_rank<=${limitParam})
    ${carSelect}, p.saving AS home_market_saving_percent FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id JOIN picked p ON p.id=l.id`,
  };
}

import { FRESH_CANDIDATE_LIMIT } from '../src/catalog-fresh.js';

// One global freshness window; filters select its matching prefix. LIMIT comes
// before every ranking window, and full rows are read only for the page/lookahead.
export function freshCatalogQuery({ where, values, limit, offset, carSelect, poolWhere = where }) {
  const take = `$${values.length + 1}::int`;
  const skip = `$${values.length + 2}::int`;
  const cap = FRESH_CANDIDATE_LIMIT;
  const candidates = poolWhere === where ? 'SELECT * FROM fresh_pool' : `SELECT l.id, l.listed_at, v.brand, v.model
      FROM fresh_pool f JOIN listings l ON l.id=f.id JOIN vehicles v ON v.id=l.vehicle_id ${where}`;
  return {
    values: [...values, limit, offset],
    text: `WITH fresh_pool AS MATERIALIZED (
      SELECT l.id, l.listed_at, v.brand, v.model
      FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${poolWhere}
      ORDER BY l.listed_at DESC NULLS LAST, l.id LIMIT ${cap}
    ), candidates AS MATERIALIZED (
      ${candidates}
    ), chronological AS (
      SELECT *, row_number() OVER (ORDER BY listed_at DESC NULLS LAST, id) AS fresh_position
      FROM candidates
    ), model_heads AS (
      SELECT *, row_number() OVER (PARTITION BY brand, model ORDER BY fresh_position) AS model_rank,
        min(fresh_position) OVER (PARTITION BY brand) AS brand_position
      FROM chronological
    ), model_rounds AS (
      SELECT *, row_number() OVER (PARTITION BY brand ORDER BY model_rank, fresh_position) AS brand_round
      FROM model_heads
    ), ordered AS (
      SELECT id, row_number() OVER (ORDER BY
        CASE WHEN model_rank=1 THEN brand_round END NULLS LAST,
        CASE WHEN model_rank=1 THEN brand_position END NULLS LAST,
        fresh_position) AS position
      FROM model_rounds
    ), picked AS (
      (SELECT id, position FROM ordered ORDER BY position LIMIT ${take} OFFSET ${skip})
      UNION ALL
      SELECT tail.id, GREATEST((SELECT count(*) FROM candidates), ${skip})
        +row_number() OVER (ORDER BY tail.listed_at DESC NULLS LAST, tail.id)
      FROM (
        SELECT * FROM (
          SELECT l.id, l.listed_at
          FROM catalog_listings l JOIN vehicles v ON v.id=l.vehicle_id ${where}
          ORDER BY l.listed_at DESC NULLS LAST, l.id LIMIT ${skip}+${take}
        ) chronological_tail ORDER BY listed_at DESC NULLS LAST, id
        LIMIT GREATEST(0, ${skip}+${take}-GREATEST((SELECT count(*) FROM candidates), ${skip}))
        OFFSET GREATEST((SELECT count(*) FROM candidates), ${skip})
      ) tail
    )
    SELECT card.* FROM picked p CROSS JOIN LATERAL (
      ${carSelect} FROM listings l JOIN vehicles v ON v.id=l.vehicle_id
      WHERE l.id=p.id LIMIT 1
    ) card ORDER BY p.position`,
  };
}

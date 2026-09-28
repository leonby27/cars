#!/usr/bin/env node
import { pool, withTransaction } from "../server/db.mjs";
import { CROSS_SOURCE_DEDUPE_STRATEGY, findCrossSourceDuplicates } from "./lib/cross-source-dedupe.mjs";

const APPLY = process.argv.includes("--apply");

const { rows } = await pool.query(`
  SELECT l.id, l.source, l.status, l.first_registration AS "firstRegistration",
    l.mileage_km AS "mileageKm", l.price_cny AS "priceCny", l.city,
    v.brand, v.model, v.model_year AS "modelYear", v.powertrain, v.drivetrain,
    v.battery_kwh AS "batteryKwh", v.electric_range_km AS "electricRangeKm",
    v.specifications->>'bodyColor' AS color
  FROM listings l
  JOIN vehicles v ON v.id=l.vehicle_id
  WHERE l.source IN ('Che168','Guazi') AND l.status='active'
`);

const matches = findCrossSourceDuplicates(rows);
const summary = {
  mode: APPLY ? "apply" : "dry-run",
  strategy: CROSS_SOURCE_DEDUPE_STRATEGY,
  scanned: rows.length,
  matches: matches.length,
  samples: matches.slice(0, 5).map(({ duplicateId, canonicalId, signals }) => ({ duplicateId, canonicalId, signals })),
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  await pool.end();
  process.exit(0);
}

const applied = await withTransaction(async (client) => {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('abcars-cross-source-dedupe'))");
  await client.query(`CREATE TEMP TABLE desired_catalog_duplicates (
    duplicate_listing_id text PRIMARY KEY,
    canonical_listing_id text NOT NULL,
    strategy text NOT NULL,
    confidence smallint NOT NULL,
    signals jsonb NOT NULL
  ) ON COMMIT DROP`);

  for (let offset = 0; offset < matches.length; offset += 1000) {
    const batch = matches.slice(offset, offset + 1000);
    await client.query(`
      INSERT INTO desired_catalog_duplicates
        (duplicate_listing_id, canonical_listing_id, strategy, confidence, signals)
      SELECT x."duplicateId", x."canonicalId", x.strategy, x.confidence, x.signals
      FROM jsonb_to_recordset($1::jsonb) AS x(
        "duplicateId" text, "canonicalId" text, strategy text, confidence smallint, signals jsonb
      )
    `, [JSON.stringify(batch)]);
  }

  const removed = await client.query(`
    DELETE FROM catalog_duplicate_matches current
    WHERE current.strategy=$1
      AND NOT EXISTS (
        SELECT 1 FROM desired_catalog_duplicates desired
        WHERE desired.duplicate_listing_id=current.duplicate_listing_id
      )
  `, [CROSS_SOURCE_DEDUPE_STRATEGY]);

  const stored = await client.query(`
    INSERT INTO catalog_duplicate_matches
      (duplicate_listing_id, canonical_listing_id, strategy, confidence, signals)
    SELECT duplicate_listing_id, canonical_listing_id, strategy, confidence, signals
    FROM desired_catalog_duplicates
    ON CONFLICT (duplicate_listing_id) DO UPDATE SET
      canonical_listing_id=EXCLUDED.canonical_listing_id,
      strategy=EXCLUDED.strategy,
      confidence=EXCLUDED.confidence,
      signals=EXCLUDED.signals,
      last_confirmed_at=now()
    RETURNING (xmax=0) AS inserted
  `);

  return {
    inserted: stored.rows.filter((row) => row.inserted).length,
    confirmed: stored.rowCount,
    removed: removed.rowCount,
  };
});

console.log(JSON.stringify({ ...summary, ...applied }, null, 2));
await pool.end();

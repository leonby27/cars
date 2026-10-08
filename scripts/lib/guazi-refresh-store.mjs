import { createHash } from 'node:crypto';
import { productId } from './guazi-pilot-data.mjs';
import { isGuaziSoldCard } from './guazi-availability.mjs';

export function mergeRefreshedGuazi(previous, fresh) {
  if (fresh.source !== 'Guazi' || fresh.id !== `guazi-${fresh.externalId}` || productId(fresh.sourceUrl) !== fresh.externalId
    || fresh.priceBasis !== 'FOB' || fresh.fobPort !== 'Horgos' || !(fresh.fobPriceUsd > 0) || !fresh.images?.length) throw Error('Invalid refreshed Guazi car');
  const merged = { ...previous, ...fresh };
  // These are optional Chinese enrichment fields. A public export refresh must
  // not erase earlier observations or pretend they were checked again today.
  for (const key of ['conditionSummary', 'condition', 'conditionConflicts', 'chinaGrade', 'appearanceScore', 'insuranceClaims', 'transfers', 'description']) {
    if (fresh[key] == null && previous?.[key] != null) merged[key] = previous[key];
  }
  merged.importedAt = previous?.importedAt || fresh.importedAt;
  merged.priceHistory = [{ at: fresh.checkedAt, priceCny: fresh.chinaPrice }];
  delete merged.guaziUnavailabilityEvidence;
  delete merged.guaziSkip;
  return merged;
}

export function createGuaziRefreshStore({ pool, withTransaction, upsertCar, databaseUrl, finalize }) {
  const url = new URL(databaseUrl);
  const target = createHash('sha256').update(`${url.hostname}:${url.port || 5432}${url.pathname}`).digest('hex');
  return {
    target,
    async acquire() {
      const client = await pool.connect();
      try {
        const result = await client.query("SELECT pg_try_advisory_lock(hashtext('abcars-guazi-refresh')) AS acquired");
        if (!result.rows[0].acquired) throw Error('Круг 2 уже запущен');
      } catch (error) { client.release(); throw error; }
      return async () => {
        try { await client.query("SELECT pg_advisory_unlock(hashtext('abcars-guazi-refresh'))"); } finally { client.release(); }
      };
    },
    async snapshot() {
      const { rows } = await pool.query(`SELECT l.id, l.external_id AS "externalId", l.source_url AS "sourceUrl", v.brand, l.status
        FROM listings l JOIN vehicles v ON v.id=l.vehicle_id
        WHERE l.source='Guazi' AND l.status IN ('active','skipped') ORDER BY l.id`);
      return rows;
    },
    async upsert(fresh) {
      return withTransaction(async client => {
        const { rows } = await client.query('SELECT source, status, source_payload FROM listings WHERE id=$1 FOR UPDATE', [fresh.id]);
        if (rows.length && rows[0].source !== 'Guazi') throw Error('Guazi refresh cannot modify another source');
        const previousPrice = Number(rows[0]?.source_payload?.fobPriceUsd);
        await upsertCar(mergeRefreshedGuazi(rows[0]?.source_payload, fresh), client);
        const quoteChanged = rows.length > 0 && Number.isFinite(previousPrice) && previousPrice > 0 && previousPrice !== fresh.fobPriceUsd;
        return { action: !rows.length ? 'added' : rows[0].status && rows[0].status !== 'active' ? 'reactivated' : 'updated',
          quoteChanged, priceChanged: quoteChanged && Math.abs(previousPrice - fresh.fobPriceUsd) >= 100 };
      });
    },
    async countActive(brands = null) {
      const { rows } = await pool.query(`SELECT count(*)::int AS total FROM listings l
        JOIN vehicles v ON v.id=l.vehicle_id
        WHERE l.source='Guazi' AND l.status='active' AND ($1::text[] IS NULL OR v.brand = ANY($1::text[]))`, [brands]);
      return rows[0].total;
    },
    async markUnavailable(row, evidence) {
      if (!row || row.id !== `guazi-${row.externalId}`) throw Error('Unconfirmed Guazi unavailability');
      const observations = evidence.observations || [];
      const sourceSold = observations.length === 1 && isGuaziSoldCard(observations[0], row.externalId);
      const missingTwice = observations.length === 2
        && observations.every(o => o.unavailable && [404, 410].includes(o.httpStatus) && productId(o.url) === row.externalId);
      if (!sourceSold && !missingTwice) throw Error('Unconfirmed Guazi unavailability');
      await withTransaction(async client => {
        await client.query(`UPDATE listings SET status='unavailable', sold_at=COALESCE(sold_at,now()), last_checked_at=now(),
          source_payload=(source_payload - 'guaziSkip') || jsonb_build_object('guaziUnavailabilityEvidence',$2::jsonb,'availabilityStatus','unavailable'),
          content_changed_at=now()
          WHERE id=$1 AND source='Guazi' AND status IN ('active','skipped')`, [row.id, JSON.stringify(evidence)]);
      });
    },
    async markSkipped(row, details) {
      if (!row || row.id !== `guazi-${row.externalId}` || productId(row.sourceUrl) !== row.externalId || !details.reason) throw Error('Invalid Guazi skip');
      // A policy/data skip is neither a sale nor a deletion. Preserve the last
      // valid quote and its observation date, but remove it from public reads.
      await withTransaction(client => client.query(`UPDATE listings SET status='skipped', sold_at=NULL,
        last_checked_at=$3, content_changed_at=now(), source_payload=source_payload ||
        jsonb_build_object('availabilityStatus','skipped','guaziSkip',$2::jsonb)
        WHERE id=$1 AND source='Guazi' AND status IN ('active','skipped')`,
      [row.id, JSON.stringify(details), details.observedAt]));
    },
    async audit({ run, results, expectedRemaining }) {
      const { rows } = await pool.query(`WITH expected AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(id text, outcome text)
      ), mismatches AS (
        SELECT r.id FROM expected r LEFT JOIN listings l ON l.source='Guazi' AND l.external_id=r.id
        WHERE (r.outcome IN ('updated','added') AND (l.id IS NULL OR l.status<>'active'))
           OR (r.outcome='unavailable' AND (l.id IS NULL OR l.status<>'unavailable'
             OR l.source_payload->'guaziUnavailabilityEvidence'->>'run' IS DISTINCT FROM $2))
           OR (r.outcome='skipped' AND (l.status='active' OR (l.status='skipped'
             AND l.source_payload->'guaziSkip'->>'run' IS DISTINCT FROM $2)))
           OR (r.outcome='rejected' AND l.status='active')
      ) SELECT
        (SELECT count(*)::int FROM mismatches) AS mismatches,
        count(*)::int AS active,
        count(*) FILTER (WHERE l.id <> 'guazi-' || l.external_id OR position(l.external_id in l.source_url)=0
          OR l.source_payload->>'priceBasis' IS DISTINCT FROM 'FOB'
          OR l.source_payload->>'fobPort' IS DISTINCT FROM 'Horgos'
          OR COALESCE((l.source_payload->>'fobPriceUsd')::numeric,0)<=0
          OR l.source_payload->>'fobPriceUsd' IS DISTINCT FROM l.source_payload->>'usdPrice'
          OR l.source_payload->>'refreshRun' IS DISTINCT FROM $2
          OR COALESCE(l.estimated_total_usd,0)<=0 OR v.model_year<2020 OR v.model='' OR v.brand=''
          OR (v.powertrain<>'Электромобиль' AND COALESCE((v.specifications->>'engineVolume')::numeric,0)<=0)
          OR l.mileage_km<0 OR l.price_cny<=0 OR NOT EXISTS (SELECT 1 FROM listing_media m WHERE m.listing_id=l.id))::int AS invalid
        FROM listings l JOIN vehicles v ON v.id=l.vehicle_id WHERE l.source='Guazi' AND l.status='active'`,
      [JSON.stringify(results.map(({ id, outcome }) => ({ id, outcome }))), run]);
      const audit = rows[0];
      if (audit.mismatches || audit.invalid || audit.active !== expectedRemaining) {
        throw Object.assign(Error(`Guazi integrity check failed: results=${audit.mismatches}, invalid=${audit.invalid}, active=${audit.active}, expected=${expectedRemaining}`), { code: 'GUAZI_INTEGRITY_FAILED' });
      }
      return audit;
    },
    finalize,
  };
}

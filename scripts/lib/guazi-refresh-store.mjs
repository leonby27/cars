import { createHash } from 'node:crypto';
import { productId } from './guazi-pilot-data.mjs';

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
      const { rows } = await pool.query(`SELECT l.id, l.external_id AS "externalId", l.source_url AS "sourceUrl", v.brand
        FROM listings l JOIN vehicles v ON v.id=l.vehicle_id
        WHERE l.source='Guazi' AND l.status='active' ORDER BY l.id`);
      return rows;
    },
    async upsert(fresh) {
      return withTransaction(async client => {
        const { rows } = await client.query('SELECT source, source_payload FROM listings WHERE id=$1 FOR UPDATE', [fresh.id]);
        if (rows.length && rows[0].source !== 'Guazi') throw Error('Guazi refresh cannot modify another source');
        await upsertCar(mergeRefreshedGuazi(rows[0]?.source_payload, fresh), client);
        return rows.length ? 'updated' : 'added';
      });
    },
    async markUnavailable(row, evidence) {
      if (!row || row.id !== `guazi-${row.externalId}` || evidence.observations?.length !== 2
        || evidence.observations.some(o => !o.unavailable || ![404, 410].includes(o.httpStatus) || productId(o.url) !== row.externalId)) throw Error('Unconfirmed Guazi unavailability');
      await withTransaction(async client => {
        await client.query(`UPDATE listings SET status='unavailable', sold_at=COALESCE(sold_at,now()), last_checked_at=now(),
          source_payload=source_payload || jsonb_build_object('guaziUnavailabilityEvidence',$2::jsonb)
          WHERE id=$1 AND source='Guazi' AND status='active'`, [row.id, JSON.stringify(evidence)]);
      });
    },
    finalize,
  };
}

import { assertChe168Evidence, che168PriceCny } from './che168-result.mjs';

export async function writeChe168Observations(client, updates) {
  for (const { id, evidence, sold, usd, cny, changed, significant, est } of updates) {
    assertChe168Evidence(evidence, evidence?.externalId, sold ? 'sold' : 'alive', usd);
    const validValues = sold ? !changed && !significant && usd == null && cny == null
      : cny === che168PriceCny(usd) && Number.isFinite(est) && est > 0;
    if (id !== `che168-${evidence.externalId}` || !validValues) {
      throw Object.assign(new Error('Che168: идентичность записи или цена не подтверждена'), { code: 'CHE168_INTEGRITY_FAILED' });
    }
  }
  const payload = JSON.stringify(updates);
  const written = await client.query(`UPDATE listings l SET
      status=CASE WHEN v.sold THEN 'unavailable' ELSE 'active' END,
      sold_at=CASE WHEN v.sold THEN COALESCE(l.sold_at, (v.evidence->>'observedAt')::timestamptz) END,
      price_cny=CASE WHEN v.changed THEN v.cny ELSE l.price_cny END,
      estimated_total_usd=CASE WHEN v.sold THEN l.estimated_total_usd ELSE v.est END,
      source_payload=(l.source_payload - 'catalogQuarantine') || jsonb_build_object('sourceAvailability', v.evidence)
        || CASE WHEN v.changed THEN jsonb_build_object('usdPrice',v.usd,'sourcePriceUsd',v.usd,'chinaPrice',v.cny)
          || CASE WHEN l.source_payload ? 'sourcePrice' THEN jsonb_build_object('sourcePrice',v.cny) ELSE '{}'::jsonb END
        ELSE '{}'::jsonb END,
      previous_price_usd=CASE WHEN v.significant AND v.old_usd>0 THEN v.old_usd ELSE l.previous_price_usd END,
      price_changed_at=CASE WHEN v.significant AND v.old_usd>0 THEN now() ELSE l.price_changed_at END,
      last_checked_at=(v.evidence->>'observedAt')::timestamptz,
      last_seen_at=CASE WHEN v.sold THEN l.last_seen_at ELSE (v.evidence->>'observedAt')::timestamptz END,
      content_changed_at=CASE WHEN v.sold OR v.changed OR l.status='skipped' THEN now() ELSE l.content_changed_at END
    FROM jsonb_to_recordset($1::jsonb) AS v(id text, sold boolean, changed boolean, significant boolean,
        cny integer, usd numeric, est numeric, old_usd numeric, evidence jsonb)
    WHERE l.id=v.id AND l.source='Che168' AND l.external_id=(v.evidence->>'externalId')
      AND l.status IN ('active','skipped')
      AND COALESCE(l.last_checked_at, '-infinity') <= (v.evidence->>'observedAt')::timestamptz
      AND COALESCE((l.source_payload->'catalogQuarantine'->>'observedAt')::timestamptz, '-infinity')
        <= (v.evidence->>'observedAt')::timestamptz`, [payload]);
  if (written.rowCount !== updates.length) throw Object.assign(new Error('Che168: проверка записи пакета не сошлась'), { code: 'CHE168_INTEGRITY_FAILED' });
  const changed = updates.filter(item => item.changed);
  if (changed.length) await client.query(`INSERT INTO price_history (listing_id, observed_at, price_cny)
    SELECT v.id, (v.evidence->>'observedAt')::timestamptz, v.cny
    FROM jsonb_to_recordset($1::jsonb) AS v(id text, cny integer, evidence jsonb)
    ON CONFLICT DO NOTHING`, [JSON.stringify(changed)]);
}

// The caller wraps the complete snapshot in a transaction. The observation
// identifies rows already committed if the process stopped before saving its
// checkpoint. Price history is replay-safe under its existing unique key.
export async function writeChe168ListSnapshot(client, updates, startedAt) {
  for (let offset = 0; offset < updates.length; offset += 1000) {
    const batch = updates.slice(offset, offset + 1000);
    const payload = JSON.stringify(batch);
    const written = await client.query(`UPDATE listings l SET
        status=CASE WHEN v.outcome='hidden' THEN 'skipped' ELSE l.status END,
        sold_at=CASE WHEN v.outcome='hidden' THEN NULL ELSE l.sold_at END,
        price_cny=CASE WHEN v.outcome='price' THEN v.cny ELSE l.price_cny END,
        estimated_total_usd=CASE WHEN v.outcome='price' THEN v.est ELSE l.estimated_total_usd END,
        previous_price_usd=CASE WHEN v.significant THEN v.previous::numeric ELSE l.previous_price_usd END,
        price_changed_at=CASE WHEN v.significant THEN $2::timestamptz ELSE l.price_changed_at END,
        last_seen_at=CASE WHEN v.reason='absent-from-list' THEN l.last_seen_at ELSE $2::timestamptz END,
        content_changed_at=CASE WHEN v.outcome IN ('price','hidden') THEN now() ELSE l.content_changed_at END,
        source_payload=l.source_payload || jsonb_build_object('che168ListObservation',
          jsonb_strip_nulls(jsonb_build_object('cycleStartedAt',$2::text,'reason',v.reason,
            'observedUsd',COALESCE(v.usd,v."observedUsd"))))
          || CASE WHEN v.outcome='hidden' THEN jsonb_build_object('catalogQuarantine',
            jsonb_build_object('reason',v.reason,'observedAt',$2::text)) ELSE '{}'::jsonb END
          || CASE WHEN v.outcome='price' THEN jsonb_build_object('usdPrice',v.usd,'sourcePriceUsd',v.usd,'chinaPrice',v.cny)
            || CASE WHEN l.source_payload ? 'sourcePrice' THEN jsonb_build_object('sourcePrice',v.cny) ELSE '{}'::jsonb END
            ELSE '{}'::jsonb END
      FROM jsonb_to_recordset($1::jsonb) AS v(id text, "externalId" text, "previous" text,
          outcome text, reason text, usd numeric, cny integer, est numeric, significant boolean, "observedUsd" numeric)
      WHERE l.id=v.id AND l.source='Che168' AND l.external_id=v."externalId" AND l.status='active'
        AND (l.source_payload->>'usdPrice') IS NOT DISTINCT FROM v.previous
        AND (l.source_payload->'che168ListObservation'->>'cycleStartedAt') IS DISTINCT FROM $2::text
        AND COALESCE(l.last_seen_at, '-infinity') <= $2::timestamptz
        AND COALESCE(l.last_checked_at, '-infinity') <= $2::timestamptz
        AND COALESCE((l.source_payload->'catalogQuarantine'->>'observedAt')::timestamptz, '-infinity') <= $2::timestamptz`, [payload, startedAt]);
    if (written.rowCount !== batch.length) {
      const result = await client.query(`SELECT count(*)::int AS count FROM listings
        WHERE source='Che168' AND id=ANY($1::text[])
          AND source_payload->'che168ListObservation'->>'cycleStartedAt'=$2`, [batch.map(row => row.id), startedAt]);
      if (result.rows[0].count !== batch.length) {
        throw Object.assign(Error('Che168: каталог изменился после сбора выдачи; начните новый круг'),
          { code: 'CHE168_SNAPSHOT_WRITE_CONFLICT', stage: 'запись снимка' });
      }
    }
    const prices = batch.filter(row => row.outcome === 'price');
    if (prices.length) await client.query(`INSERT INTO price_history (listing_id, observed_at, price_cny)
      SELECT v.id, $2::timestamptz, v.cny FROM jsonb_to_recordset($1::jsonb) AS v(id text,cny integer)
      ON CONFLICT DO NOTHING`, [JSON.stringify(prices), startedAt]);
  }
}

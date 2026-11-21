import { importedContentHash, upsertCar } from '../../server/repository.mjs';
import { estimateMarketOffer } from '../../src/markets/estimate-offer.js';
import { SITE } from '../../src/site-profile.js';
import { encarIncident } from './encar-parser.mjs';

// Run inside the caller's transaction. A verified price/status can change while
// optional history is refused; retain the saved history and technical sheet.
const historyFields = ['owners', 'transfers', 'claims', 'claimsCount', 'totalLoss',
  'inspection', 'battery', 'batteryCapacity', 'batteryType', 'batteryBrand',
  'batteryHealth', 'electricRange', 'combinedRange', 'range',
  'evBattery', 'technicalSpecs'];
const historyGroup = group => /^(?:Осмотр:|Страховая история$|Батарея$)/.test(group.name);

export async function upsertEncarCar(car, db, upsert = upsertCar, options) {
  let current = car;
  const { rows } = await db.query("SELECT source_payload FROM listings WHERE source='Encar' AND external_id=$1 FOR UPDATE", [car.externalId]);
  const previous = rows[0]?.source_payload;
  if (previous) {
    let retained = false;
    if (previous.sourceVehicleId != null && car.sourceVehicleId != null
      && String(previous.sourceVehicleId) !== String(car.sourceVehicleId)) {
      throw new Error('Encar: сохранённая история принадлежит другой машине');
    }
    current = { ...car };
    for (const field of historyFields) if (Object.hasOwn(previous, field)
      && (car.historyUnavailable || current[field] == null)) {
      current[field] = previous[field];
      if (previous[field] != null && (field !== 'technicalSpecs' || previous[field].groups?.some(historyGroup))) retained = true;
    }
    if (!car.historyUnavailable) {
      if (current.inspection && previous.inspection) {
        if (Object.keys(previous.inspection).some(key => previous.inspection[key] != null && current.inspection[key] == null)) retained = true;
        current.inspection = { ...previous.inspection, ...Object.fromEntries(Object.entries(current.inspection).filter(([, value]) => value !== null)) };
      }
      const groups = [...(current.technicalSpecs?.groups || [])];
      for (const group of previous.technicalSpecs?.groups || []) {
        if (!historyGroup(group)) continue;
        const at = groups.findIndex(item => item.name === group.name);
        if (at < 0) { groups.push(group); retained = true; }
        else {
          const fresh = groups[at];
          const missing = group.items.filter(item => !fresh.items.some(row => row.name === item.name));
          if (missing.length) retained = true;
          groups[at] = { ...fresh, items: [...fresh.items, ...missing] };
        }
      }
      if (groups.length) current.technicalSpecs = { ...current.technicalSpecs, groups, count: groups.reduce((sum, group) => sum + group.items.length, 0) };
    }
    current.incident = encarIncident(current);
    if (retained) current.historyUnavailable = true;
  }
  return upsert(current, db, options);
}

// The caller commits all fully read brands together. A conflicting concurrent
// update rolls back the transaction before its discoveries become importable.
export async function writeEncarListSnapshot(db, updates, { startedAt, observedAt, usdPerKrw }) {
  for (let offset = 0; offset < updates.length; offset += 1000) {
    const batch = updates.slice(offset, offset + 1000);
    const prices = batch.filter(row => row.outcome === 'price');
    if (prices.length) {
      const { rows } = await db.query('SELECT id, source_payload FROM listings WHERE source=\'Encar\' AND id=ANY($1::text[])', [prices.map(row => row.id)]);
      const payloads = new Map(rows.map(row => [row.id, row.source_payload]));
      for (const row of prices) {
        const payload = payloads.get(row.id);
        if (!payload) throw Error(`Encar: отсутствуют данные для пересчёта ${row.externalId}`);
        row.usd = Math.round(row.won * usdPerKrw);
        const car = { ...payload, source: 'Encar', sourceCurrency: 'KRW', sourcePrice: row.won, chinaPrice: row.won, usdPrice: row.usd };
        row.total = estimateMarketOffer(car, { siteId: SITE.id }).calculation?.totalUsd;
        if (!(row.total > 0 && Number.isFinite(row.total))) throw Error(`Encar: цена под ключ не рассчитана для ${row.externalId}`);
        row.hash = importedContentHash(car);
        row.previousUsd = Number(payload.usdPrice) > 0 ? Number(payload.usdPrice) : Math.round(row.previous * usdPerKrw);
      }
    }
    const written = await db.query(`UPDATE listings l SET
        status=CASE v.outcome WHEN 'sold' THEN 'unavailable' WHEN 'hidden' THEN 'skipped' ELSE l.status END,
        sold_at=CASE v.outcome WHEN 'sold' THEN COALESCE(l.sold_at,$2::timestamptz) WHEN 'hidden' THEN NULL ELSE l.sold_at END,
        last_seen_at=CASE WHEN v.outcome='sold' THEN l.last_seen_at ELSE $2::timestamptz END,
        last_checked_at=$2::timestamptz,
        content_changed_at=CASE WHEN v.outcome='seen' THEN l.content_changed_at ELSE now() END,
        content_hash=COALESCE(v.hash,l.content_hash),
        price_cny=CASE WHEN v.outcome='price' THEN v.won ELSE l.price_cny END,
        estimated_total_usd=COALESCE(v.total,l.estimated_total_usd),
        previous_price_usd=CASE WHEN v.outcome='price' AND abs(v.won-v.previous)>=140000 THEN v."previousUsd" ELSE l.previous_price_usd END,
        price_changed_at=CASE WHEN v.outcome='price' AND abs(v.won-v.previous)>=140000 THEN $2::timestamptz ELSE l.price_changed_at END,
        source_payload=l.source_payload || jsonb_build_object('sourceAvailability', jsonb_strip_nulls(jsonb_build_object(
          'source','list-snapshot','state',CASE WHEN v.outcome IN ('sold','hidden') THEN v.outcome ELSE 'active' END,
          'checkedAt',$2::text,'reason',v.reason,'observedKrw',v.won)))
          || CASE WHEN v.outcome='hidden' THEN jsonb_build_object('catalogQuarantine',jsonb_build_object('reason',v.reason,'observedAt',$2::text)) ELSE '{}'::jsonb END
          || CASE WHEN v.outcome='price' THEN jsonb_build_object('sourceCurrency','KRW','sourcePrice',v.won,'chinaPrice',v.won,'usdPrice',v.usd) ELSE '{}'::jsonb END
      FROM jsonb_to_recordset($1::jsonb) AS v(id text, "externalId" text, status text, previous integer,
          outcome text, reason text, won integer, usd integer, total numeric, hash text, "previousUsd" numeric)
      WHERE l.id=v.id AND l.source='Encar' AND l.external_id=v."externalId" AND l.status=v.status AND l.price_cny=v.previous
        AND COALESCE(l.last_seen_at,'-infinity') <= $3::timestamptz AND COALESCE(l.last_checked_at,'-infinity') <= $3::timestamptz`,
    [JSON.stringify(batch), observedAt, startedAt]);
    if (written.rowCount !== batch.length) throw Error('Encar: каталог изменился во время обхода, нужен свежий список');
    if (prices.length) await db.query(`INSERT INTO price_history (listing_id,observed_at,price_cny)
      SELECT v.id,$2::timestamptz,v.won FROM jsonb_to_recordset($1::jsonb) AS v(id text,won integer)
      ON CONFLICT DO NOTHING`, [JSON.stringify(prices), observedAt]);
  }
}

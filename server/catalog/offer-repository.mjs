import { createHash } from 'node:crypto';
import { createOfferContext } from '../../src/markets/offer-context.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export const dataVersion = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

// Facts relevant to regional quotes, not the BY landed-price column or UI preference.
export function sourceVersion(row) {
  return dataVersion({
    id: row.id, source: row.source, price: row.price_cny, city: row.city,
    year: row.model_year, type: row.powertrain,
    payload: row.source_payload, specifications: row.specifications,
  });
}

const requiredVersion = (value, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`Missing or invalid ${name}`);
  return value;
};

export function offerIdentity({ listingId, context: input, versions }) {
  const context = createOfferContext({ ...input, quotaOver: input?.quotaOver ?? input?.options?.quotaOver, refund50: input?.refund50 ?? input?.options?.refund50 });
  const valuationDate = requiredVersion(versions?.valuationDate, 'valuationDate');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valuationDate) || new Date(valuationDate).toISOString().slice(0, 10) !== valuationDate) throw new Error('Invalid valuationDate');
  const values = [
    requiredVersion(listingId, 'listingId'), context.market, context.destinationId, context.scenarioId,
    ...['source', 'rules', 'rates', 'tariffs'].map(key => requiredVersion(versions?.[key], key)), valuationDate,
  ];
  return { context, values };
}

export function createOfferRepository(db) {
  return {
    async save(input) {
      const { context, values } = offerIdentity(input);
      const { status, totalAmount = null, calculation = null, reason = null } = input;
      if (!['estimated', 'unavailable', 'ineligible'].includes(status)) throw new Error('Invalid offer status');
      if (status === 'estimated') {
        if (!Number.isFinite(totalAmount) || totalAmount <= 0 || !calculation || typeof calculation !== 'object' || Array.isArray(calculation) || reason !== null) throw new Error('Invalid estimated offer');
      } else if (totalAmount !== null || calculation !== null || typeof reason !== 'string' || !reason.trim()) throw new Error('Unavailable offer must not contain a price');
      // Repeat work preserves the original quote and freshness; never updates a date on a copy.
      const saved = await db.query(`INSERT INTO market_offers
        (listing_id,market,destination_id,scenario_id,source_version,rules_version,rates_version,tariffs_version,valuation_date,
         status,currency,total_amount,calculation,reason)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT DO NOTHING RETURNING *`,
      [...values, status, context.displayCurrency, totalAmount, calculation, reason]);
      return saved.rows[0] || this.find(input);
    },
    async find(input) {
      const { values } = offerIdentity(input);
      const result = await db.query(`SELECT * FROM market_offers WHERE
        listing_id=$1 AND market=$2 AND destination_id=$3 AND scenario_id=$4
        AND source_version=$5 AND rules_version=$6 AND rates_version=$7 AND tariffs_version=$8 AND valuation_date=$9`, values);
      return result.rows[0] || null;
    },
  };
}

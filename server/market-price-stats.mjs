import { estimateLandedCost } from "../src/pricing.js";

export const MARKET_MILEAGE_LIMITS = Object.freeze([20_000, 50_000, 100_000, 150_000, 200_000, null]);

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const summarize = (values) => ({
  count:values.length,
  min:Math.min(...values),
  mean:Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
  median:median(values),
  max:Math.max(...values),
});

const carFromRow = (row) => ({
  source:row.source,
  usdPrice:Number(row.usd_price) || 0,
  chinaPrice:Number(row.price_cny) || 0,
  year:Number(row.year) || null,
  type:row.type,
  engine:row.engine,
  sourceFuelType:row.fuel_type,
  transmission:row.transmission,
  city:row.city,
  manufactureDate:row.manufacture_date,
  dimensions:row.dimensions,
  curbWeight:Number(row.curb_weight) || null,
});

/**
 * Собирает обе версии наших цен для сравнения рынка. Строки приходят от новых к
 * старым, поэтому первая фотография в группе остаётся самой свежей.
 */
export function marketPriceStatsFromRows(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const car = carFromRow(row);
    const type = row.type === "Бензин" ? "ДВС" : row.type || null;
    const quotaOn = Number(estimateLandedCost(car, { quotaOver:false }).totalUsd);
    const quotaOff = Number(estimateLandedCost(car, { quotaOver:true }).totalUsd);
    if (!(quotaOn > 0) || !(quotaOff > 0)) continue;
    const mileage = Number(row.mileage_km);
    for (const limit of MARKET_MILEAGE_LIMITS) {
      if (limit != null && (!Number.isFinite(mileage) || mileage > limit)) continue;
      const key = `${row.brand}\u0000${row.model}\u0000${row.year}\u0000${type || "unknown"}\u0000${limit ?? "all"}`;
      if (!groups.has(key)) groups.set(key, {
        brand:row.brand,
        model:row.model,
        year:Number(row.year),
        type,
        mileageMax:limit,
        image:row.image || null,
        quotaOn:[],
        quotaOff:[],
      });
      const group = groups.get(key);
      if (!group.image && row.image) group.image = row.image;
      group.quotaOn.push(quotaOn);
      group.quotaOff.push(quotaOff);
    }
  }
  return [...groups.values()].map((group) => {
    const quotaOn = summarize(group.quotaOn);
    const quotaOff = summarize(group.quotaOff);
    return {
      brand:group.brand,
      model:group.model,
      year:group.year,
      type:group.type,
      mileageMax:group.mileageMax,
      image:group.image,
      // Плоские поля сохраняют прежний формат для поисковой версии и старого кэша.
      ...quotaOff,
      quotaOn,
      quotaOff,
    };
  });
}

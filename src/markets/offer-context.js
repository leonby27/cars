import { getSiteProfile } from "../../config/sites/index.mjs";

// Origin (china/korea) belongs to the car. This context describes its buyer.
export function createOfferContext({ siteId, destinationId, quotaOver, refund50 } = {}) {
  const site = getSiteProfile(siteId);
  const destination = destinationId ?? site.destination.id;
  if (destination !== site.destination.id) {
    throw new Error(`Unsupported destination for ${site.id}: ${destination}`);
  }
  if (site.market !== "BY" && (quotaOver !== undefined || refund50 !== undefined)) {
    throw new Error("Belarusian pricing options cannot be used for another market");
  }
  for (const option of [quotaOver, refund50]) {
    if (option !== undefined && typeof option !== "boolean") throw new Error("Pricing options must be boolean");
  }
  const options = site.market === "BY"
    ? Object.freeze({ quotaOver: quotaOver ?? true, refund50: refund50 ?? false })
    : Object.freeze({});
  return Object.freeze({
    siteId: site.id, market: site.market, destinationId: destination,
    displayCurrency: site.currency,
    scenarioId: site.market === "BY"
      ? `personal:quota-${options.quotaOver ? "over" : "available"}:refund-${options.refund50 ? "50" : "0"}`
      : "personal:pending",
    options,
  });
}

// Callers must include input/tariff/rate versions in persisted snapshot keys later.
// This prefix only separates the market, destination and calculation scenario.
export const offerContextKey = (context) => JSON.stringify([
  context.siteId, context.market, context.destinationId, context.scenarioId,
]);

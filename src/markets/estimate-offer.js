import { estimateLandedCost } from "../pricing.js";
import { createOfferContext } from "./offer-context.js";

// Compatibility adapter. Keep the existing BY formula and rate updater in place;
// the future RU adapter must supply its own rules, rates and destination tariffs.
export function estimateMarketOffer(car, input) {
  const context = createOfferContext(input);
  if (context.market !== "BY") {
    return Object.freeze({ context, status: "unavailable", reason: "market_pricing_not_configured", calculation: null });
  }
  return {
    context,
    status: "estimated",
    calculation: estimateLandedCost(car, context.options),
  };
}

import { isEvQuotaOver, holdQuotaChoice, rememberEvQuotaPricing } from "./ev-quota.js";
import { readDecreePricing, rememberDecreePricing } from "./decree-pricing.js";

// One state shared by calculation defaults and React's subscription.
const serverState = Object.freeze({ quotaOver:true, refund50:false });
let state = { quotaOver:isEvQuotaOver(), refund50:false };
const listeners = new Set();
export const getPricingState = () => state;
export const getServerPricingState = () => serverState;
export const subscribePricing = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function update(patch) {
  const next = { ...state, ...patch };
  if (next.quotaOver === state.quotaOver && next.refund50 === state.refund50) return;
  state = next;
  listeners.forEach((listener) => listener());
}
export const setPricingQuotaOver = (value) => update({ quotaOver:Boolean(value) });
export const setPricingRefund50 = (value) => update({ refund50:Boolean(value) });
export function restorePricingChoice() {
  holdQuotaChoice(false);
  update({ quotaOver:isEvQuotaOver(), refund50:readDecreePricing() });
}
export function chooseQuotaPricing(on) {
  rememberEvQuotaPricing(on);
  setPricingQuotaOver(!on);
}
export function chooseDecreePricing(on) {
  rememberDecreePricing(on);
  setPricingRefund50(on);
}

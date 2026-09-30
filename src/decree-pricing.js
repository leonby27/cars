const STORAGE_KEY = "abcars-decree-140";

export function readDecreePricing() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

export function rememberDecreePricing(on) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // The switch still works when browser storage is unavailable.
  }
}

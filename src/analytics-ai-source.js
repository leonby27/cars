import { analyticsAcquisition } from "./analytics-acquisition.js";

// Only identifiable assistant hosts and explicit source tags. A google/yandex
// search referrer, ysclid, a text fragment or a crawler UA does not identify AI.
export const GOOGLE_AI_SOURCE_PATTERN = "^(google[-_]ai|gemini\\.google\\.com|bard\\.google\\.com)$";
export const YANDEX_AI_SOURCE_PATTERN = "^(yandex[-_]ai|alice|alice\\.yandex\\.ru)$";
const googleAi = new RegExp(GOOGLE_AI_SOURCE_PATTERN, "i");
const yandexAi = new RegExp(YANDEX_AI_SOURCE_PATTERN, "i");

export function analyticsAiSource(value = "", landingPath = "") {
  if (analyticsAcquisition(landingPath) !== "organic") return "";
  let tagged = "";
  try {
    const params = new URL(landingPath || "/", "https://abcars.invalid").searchParams;
    tagged = [...params].find(([key]) => key.toLowerCase() === "utm_source")?.[1] || "";
  } catch {}
  let source = String(tagged || value || "").trim().toLowerCase();
  if (source.includes("://")) {
    try {
      const url = new URL(source);
      if (!["https:", "http:"].includes(url.protocol)) return "";
      source = url.hostname;
    } catch { return ""; }
  }
  source = source.replace(/^www\./, "");
  return googleAi.test(source) ? "google-ai" : yandexAi.test(source) ? "yandex-ai" : "";
}

export const ANALYTICS_AI_SOURCE_NOTE = "AI-вкладки — распознанные переходы из Gemini, Алисы и по явным меткам. Часть AI-переходов остаётся в Google/Яндексе. Ноль во вкладке не означает отсутствие AI-трафика.";

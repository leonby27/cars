import { isPartnerPath } from "./partner-model.js";
import { analyticsAcquisition, analyticsAdvertisingSource } from "./analytics-acquisition.js";
import { leadPersonKey } from "./analytics-lead-people.js";

const cleanPath = (value) => {
  if (typeof value !== "string" || !/^\/(?!\/)/.test(value) || /[\\\u0000-\u001f]/.test(value)) return "";
  const path = value.slice(0, 2048);
  try {
    const url = new URL(path, "https://abcars.invalid");
    return url.origin === "https://abcars.invalid" && !/^\/analytics(?:\/|$)/.test(url.pathname) && !isPartnerPath(url.pathname) ? path : "";
  } catch { return ""; }
};
export function normalizeLeadAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const landingPath = cleanPath(value.landingPath);
  const source = typeof value.source === "string" ? value.source.trim().toLowerCase().replace(/^www\./, "").slice(0, 160) : "";
  if (!landingPath || !/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(source)) return null;
  return { source:analyticsAdvertisingSource(landingPath) || source, landingPath, submittedPath:cleanPath(value.submittedPath), acquisition:analyticsAcquisition(landingPath) };
}

const sourceGroup = (source) => /^(?:yandex\.|ya\.ru$)/.test(source) ? "yandex.ru" : /^google\./.test(source) ? "google.com" : source;
export function leadSourceReport(rows, mode = "unique") {
  const seen = new Set();
  const leads = [];
  // A person belongs to the source of their first submission in this period.
  for (const row of [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id)))) {
    const key = leadPersonKey(row);
    if (mode !== "all" && seen.has(key)) continue;
    seen.add(key);
    const attribution = normalizeLeadAttribution(row.attribution);
    leads.push({ id:row.id, kind:row.kind, origin:row.origin, createdAt:row.created_at, attribution });
  }
  const groups = new Map();
  for (const lead of leads) {
    const key = sourceGroup(lead.attribution?.source || "");
    const group = groups.get(key) || { source:key, count:0 };
    group.count++;
    groups.set(key, group);
  }
  return { total:leads.length, submissions:rows.length, mode:mode === "all" ? "all" : "unique", groups:[...groups.values()].sort((a,b) => b.count - a.count), leads:leads.reverse() };
}

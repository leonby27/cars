import { completePhoneNumber, formatPhoneNational, phoneCountry, readPhoneInput } from "./phone-mask.js";

export const PARTNER_STATUSES = Object.freeze({ new:"Новая", in_progress:"В работе", waiting:"Ждём ответа", completed:"Завершена", declined:"Не подходит" });
export function partnerRegistrationValues(value) {
  if (typeof value?.name !== "string" || typeof value?.phone !== "string") return null;
  const name = value.name.trim().replace(/\s+/g, " ");
  const phone = value.phone.trim();
  if (!name || name.length > 100 || !/^\+(375\d{9}|7\d{10})$/.test(phone)) return null;
  return { name, phone };
}
export function partnerPhoneLabel(value) {
  const phone = readPhoneInput(value);
  const original = String(value || "");
  const digits = original.replace(/\D/g, "").replace(/^00/, "");
  const canonical = phone && completePhoneNumber(phone);
  const supported = canonical && [canonical, phone.national, phone.country === "BY" ? `80${phone.national}` : `8${phone.national}`].includes(digits);
  return supported ? `${phoneCountry(phone.country).code} ${formatPhoneNational(phone)}` : original;
}
export function partnerSourceUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
export function isPartnerPath(value = "") {
  try { return /^\/partner(?:\/|$)/.test(new URL(String(value), "https://abcars.invalid").pathname); }
  catch { return false; }
}
export function partnerRequestUpdate(value = {}) {
  if (!Object.hasOwn(PARTNER_STATUSES, value.status)) return null;
  if (typeof value.note !== "string" || value.note.length > 2000) return null;
  return { status:value.status, note:value.note.trim() };
}
export function partnerCounts(requests = []) {
  return { new:requests.filter((r) => r.status === "new").length, active:requests.filter((r) => ["in_progress","waiting"].includes(r.status)).length, completed:requests.filter((r) => r.status === "completed").length };
}

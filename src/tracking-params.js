// Метки переходов в адресе: реклама (utm_*, yclid, gclid), соцсети (fbclid, igshid),
// поиск Яндекса (ysclid) и наша служебная метка nocount. Страницу они не меняют —
// их читает только статистика. До 28.09.2026 любая такая метка в адресе раздела
// каталога считалась «своим фильтром»: сервер и браузер отказывались от готового
// списка, и человек из объявления видел пустые заготовки вместо машин.
const TRACKING_KEYS = new Set([
  "nocount",
  "yclid",
  "ysclid",
  "gclid",
  "gbraid",
  "wbraid",
  "dclid",
  "fbclid",
  "igshid",
  "msclkid",
  "ttclid",
  "twclid",
  "erid",
  "_openstat",
  "from",
  "mc_cid",
  "mc_eid",
]);

export const isTrackingParam = (key) => {
  const name = String(key || "").toLowerCase();
  return name.startsWith("utm_") || TRACKING_KEYS.has(name);
};

/** Параметры адреса без меток переходов (новый объект, исходный не меняется). */
export function withoutTrackingParams(search) {
  const source = search instanceof URLSearchParams ? search : new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const kept = new URLSearchParams();
  for (const [key, value] of source) if (!isTrackingParam(key)) kept.append(key, value);
  return kept;
}

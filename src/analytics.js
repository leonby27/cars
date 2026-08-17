const visitorKey = "evcars-analytics-visitor";
const sessionKey = "evcars-analytics-session";

const randomId = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const storedId = (storage, key) => {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    const created = randomId();
    storage.setItem(key, created);
    return created;
  } catch { return randomId(); }
};

export function trackEvent(eventName, details = {}) {
  const payload = {
    eventId:randomId(),
    visitorId:storedId(window.localStorage, visitorKey),
    sessionId:storedId(window.sessionStorage, sessionKey),
    eventName,
    path:`${window.location.pathname}${window.location.search}`,
    listingId:details.listingId,
    listingTitle:details.listingTitle,
    properties:details.properties,
  };
  fetch("/api/analytics/events", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify(payload),
    keepalive:true,
  }).catch(() => {});
}


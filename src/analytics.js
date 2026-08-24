const visitorKey = "abcars-analytics-visitor";
const sessionKey = "abcars-analytics-session";

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

// Свои проверки в аналитику не попадают: сайт, запущенный на компьютере, ходит в ту
// же базу, что и боевой, и десяток открытий одной карточки при отладке выглядел бы
// всплеском интереса живых людей.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[?::1\]?|.*\.local)$/i;
const PRIVATE_IP = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
export const isLocalVisit = (hostname) => LOCAL_HOST.test(hostname) || PRIVATE_IP.test(hostname);

// Одно и то же событие иногда просится записаться дважды подряд: в режиме
// разработки React монтирует экран два раза, да и быстрый повторный рендер
// случается. Повтор в пределах пяти секунд — это тот же самый просмотр.
const REPEAT_WINDOW_MS = 5000;
const recentEvents = new Map();
export const isRepeatEvent = (key, now = Date.now()) => {
  for (const [item, at] of recentEvents) if (now - at > REPEAT_WINDOW_MS) recentEvents.delete(item);
  const previous = recentEvents.get(key);
  recentEvents.set(key, now);
  return previous !== undefined && now - previous < REPEAT_WINDOW_MS;
};

export function trackEvent(eventName, details = {}) {
  if (isLocalVisit(window.location.hostname)) return;
  // У события про машину примета — сама машина: «быстрый просмотр» из каталога и
  // открытая следом карточка — это один и тот же взгляд, а не два.
  if (isRepeatEvent(`${eventName}|${details.listingId || window.location.pathname}`)) return;
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


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

// Свои заходы с обычного адреса сайта исключаем той же меткой, что и в Метрике:
// браузер, в котором хоть раз открыли сайт с ?nocount=1, помнит это насовсем
// (метку ставит счётчик в index.html). Плюс молчим в браузерах под управлением
// программы — это автоматические проверки и роботы, а не живые люди.
// Робот, который не скрывает, что он робот: сборщики данных для ИИ и проверялки
// скорости сайта иногда работают на настоящем браузере и наш скрипт выполняют.
// Сюда же встроенный браузер Claude (`claude/`): им проверяют правки на боевом
// сайте, а метку «не считать» он не помнит — она живёт в хранилище браузера,
// а он каждый раз чистый.
const BOT_AGENT = /bot|claude\/|crawl|spider|slurp|scrape|headless|phantom|puppeteer|playwright|selenium|lighthouse|pagespeed|preview|fetcher|archiver|monitor/i;
export const isBotAgent = (agent = "") => BOT_AGENT.test(String(agent));

export const isSkippedVisit = ({ hostname, nocount, automated, agent = "" }) =>
  isLocalVisit(hostname) || nocount === "1" || Boolean(automated) || isBotAgent(agent);

const skipThisVisit = () => {
  let nocount = null;
  try { nocount = window.localStorage.getItem("nocount"); } catch { nocount = null; }
  return isSkippedVisit({
    hostname:window.location.hostname,
    nocount,
    automated:window.navigator?.webdriver,
    agent:window.navigator?.userAgent,
  });
};

// Робот и человек по-разному ведут себя на открытой странице. Человек шевелит мышью,
// листает, нажимает; робот, которому нужно только содержимое, снимает страницу и
// уходит через несколько секунд, ни к чему не притронувшись, — а подпись браузера
// при этом подделывает под обычный Chrome, поэтому по ней его не отличить.
// Вот эти признаки и отличают живого посетителя от такого робота.
export const HUMAN_SIGNALS = ["pointermove", "pointerdown", "touchstart", "keydown", "wheel", "scroll"];
// Время на странице тоже отмечаем, но отдельно и слабее: 26.08.2026 нашёлся обходчик,
// который открывает страницу, ровно столько ждёт и уходит, ни к чему не притронувшись.
// Поэтому одно лишь время человеком уже не делает — в посетители попадает только тот,
// за кем есть действие, а отстоявшие своё без движения видны отдельной цифрой.
export const HUMAN_DWELL_MS = 15_000;

// Заход записываем сразу, а живым человеком он становится, когда посетитель себя
// проявит: подвигает мышью, коснётся экрана, прокрутит, нажмёт клавишу или пробудет
// на открытой странице 15 секунд. Робот, который снимает страницу и уходит, отметку
// не получает — в числе посетителей его нет, но сам заход в базе остаётся и виден
// отдельной цифрой. Так не теряется и человек, закрывший страницу через две секунды:
// он просто попадёт не в людей, а в неподтверждённые заходы.
let humanConfirmed = false;
let humanActed = false;
let watching = false;

const post = (path, payload) => {
  fetch(path, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify(payload),
    keepalive:true,
  }).catch(() => {});
};

// `action` — было настоящее действие, а не просто время на странице. Отметку по времени
// шлём один раз, отметку по действию — даже если время уже отправлено: она сильнее.
const confirmHuman = (action) => {
  if (humanActed || (humanConfirmed && !action)) return;
  humanConfirmed = true;
  if (action) humanActed = true;
  post("/api/analytics/human", {
    visitorId:storedId(window.localStorage, visitorKey),
    sessionId:storedId(window.sessionStorage, sessionKey),
    action:Boolean(action),
  });
};

const watchForHuman = () => {
  if (watching) return;
  watching = true;
  const signal = () => {
    for (const name of HUMAN_SIGNALS) window.removeEventListener(name, signal, true);
    confirmHuman(true);
  };
  for (const name of HUMAN_SIGNALS) window.addEventListener(name, signal, { capture:true, passive:true });
  window.setTimeout(() => {
    // Страница в фоновой закладке ничего не доказывает: её мог открыть и робот.
    if (window.document?.visibilityState !== "hidden") confirmHuman(false);
  }, HUMAN_DWELL_MS);
};

export function trackEvent(eventName, details = {}) {
  if (skipThisVisit()) return;
  // У события про машину примета — сама машина: «быстрый просмотр» из каталога и
  // открытая следом карточка — это один и тот же взгляд, а не два.
  if (isRepeatEvent(`${eventName}|${details.listingId || details.properties?.query || window.location.pathname}`)) return;
  const payload = {
    eventId:randomId(),
    visitorId:storedId(window.localStorage, visitorKey),
    sessionId:storedId(window.sessionStorage, sessionKey),
    eventName,
    path:`${window.location.pathname}${window.location.search}`,
    listingId:details.listingId,
    listingTitle:details.listingTitle,
    properties:details.properties,
    human:humanConfirmed,
    humanAction:humanActed,
  };
  watchForHuman();
  post("/api/analytics/events", payload);
}


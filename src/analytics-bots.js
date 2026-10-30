// Явные подписи автоматических клиентов. Отсутствие действий и рекламные метки
// сюда не относятся: обычный посетитель может открыть страницу и сразу уйти.
// Один список для браузера, основного сервера и резервного worker-хостинга.
const BOT_AGENT = /bot|claude\/|crawl|spider|slurp|scrape|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|httpclient|http-client|libwww|okhttp|java\/|axios|node-fetch|go-http|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|fetcher|archiver|yandeximages|feed|ahrefssiteaudit|semrush|megaindex|seekport|omgili|imagesift|httrack|nettle|zgrab|masscan|facebookexternalhit|meta-external|vkshare|whatsapp|google-inspectiontool|googleother|chatgpt-user|perplexity-user|anthropic-ai|claude-web|cohere-ai/i;

export const isKnownAnalyticsBotAgent = (agent = "") => BOT_AGENT.test(String(agent || ""));

// Проверяем именно название бренда, а не версию Chrome, ОС или необычный порядок
// Client Hints: такие отличия бывают у настоящих браузеров и средств приватности.
export const isKnownAnalyticsBotHints = (hints = "") => /(?:^|,)\s*"HeadlessChrome"\s*;/i.test(String(hints || ""));

export const hasAnalyticsAutomation = (navigator = {}) => {
  try { if (navigator.webdriver === true) return true; } catch { /* Нет данных. */ }
  try {
    return navigator.userAgentData?.brands?.some((item) => /^HeadlessChrome$/i.test(item?.brand || "")) === true;
  } catch { return false; }
};

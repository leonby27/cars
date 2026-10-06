// Явные подписи автоматических клиентов. Отсутствие действий и рекламные метки
// сюда не относятся: обычный посетитель может открыть страницу и сразу уйти.
// Один список для браузера, основного сервера и резервного worker-хостинга.
const BOT_AGENT = /bot|claude\/|crawl|spider|slurp|scrape|headless|phantom|puppeteer|playwright|selenium|curl|wget|python-requests|httpclient|http-client|libwww|okhttp|java\/|axios|node-fetch|go-http|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|fetcher|archiver|yandeximages|feed|ahrefssiteaudit|semrush|megaindex|seekport|omgili|imagesift|httrack|nettle|zgrab|masscan|facebookexternalhit|meta-external|vkshare|whatsapp|google-inspectiontool|googleother|chatgpt-user|perplexity-user|anthropic-ai|claude-web|cohere-ai/i;

export const isKnownAnalyticsBotAgent = (agent = "") => BOT_AGENT.test(String(agent || ""));

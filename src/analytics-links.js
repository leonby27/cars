// Любая ссылка, открытая из внутренней аналитики, используется сотрудником для
// проверки сайта. Пометка выключает собственную статистику, Метрику и GA и заодно
// переносится вместе со скопированной ссылкой в инкогнито, где localStorage другой.
export const analyticsNoCountHref = (value, base = "https://abcars.by") => {
  const href = String(value || "").trim();
  if (!href) return href;
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return href;
    url.searchParams.set("nocount", "1");
    return href.startsWith("/") && !href.startsWith("//")
      ? `${url.pathname}${url.search}${url.hash}`
      : url.href;
  } catch { return href; }
};

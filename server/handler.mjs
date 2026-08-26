import { Readable } from "node:stream";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { isDatabaseUnavailable, pool } from "./db.mjs";
import { authenticateAccount, clearSessionCookie, createAccount, createSession, deleteAccount, deleteSession, getSessionUser, listAccountFavorites, normalizePhone, normalizeProfile, sessionCookie, setAccountFavorite, updateAccountProfile } from "./auth.mjs";
import { createOrderDraft, getCar, getCatalogMeta, getModelFacts, listCars } from "./repository.mjs";
import { createCustomerOrder, deleteCustomerOrder, listCustomerOrders, updateCustomerOrder } from "./orders.mjs";
import { createCustomerSearch, deleteCustomerSearch, listCustomerSearches, normalizeSearchFilters } from "./searches.mjs";
import { analyticsCookie, clearAnalyticsCookie, confirmHumanVisit, createAnalyticsToken, fromOwnPage, getAnalyticsDashboard, getAnalyticsLeads, getAnalyticsUpdates, hasAnalyticsSession, isBotAgent, isDatacenterAddress, recordAnalyticsEvent, resetAnalyticsData, verifyAnalyticsPassword } from "./analytics.mjs";
import { checkRateLimit, clientAddress } from "./rate-limit.mjs";

const imageHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
// Ограничение размера: через прокси идёт фотография объявления, а не файл в сотни
// мегабайт. Без предела чужой сервер мог бы гнать поток через нашу функцию.
const maxImageBytes = 12 * 1024 * 1024;
const allowedImageSource = (source) => source.protocol === "https:" && imageHosts.has(source.hostname);

// Перенаправления проходим сами, проверяя каждый следующий адрес по тому же списку.
// С автоматическим `redirect: "follow"` разрешённый сервер источника мог перебросить
// наш запрос куда угодно — включая внутренние адреса, недоступные снаружи.
async function fetchAllowedImage(source) {
  let current = source;
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetch(current, {
      redirect:"manual",
      headers:{ accept:"image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "user-agent":"abcars.by-image-proxy/1.0" },
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      let next;
      try { next = new URL(location, current); } catch { return { error:"image_unavailable", status:502 }; }
      if (!allowedImageSource(next)) return { error:"image_host_not_allowed", status:403 };
      current = next;
      continue;
    }
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("image/") || !response.body) return { error:"image_unavailable", status:502 };
    return { response, contentType };
  }
  return { error:"image_unavailable", status:502 };
}
const gzipAsync = promisify(gzip);
// Catalog payloads are a few hundred KB of highly repetitive JSON, so gzip cuts them ~7x.
// Below this size the header overhead outweighs the saving.
const compressFromBytes = 1024;
// Vercel's edge compresses on its own and may not expose the request here; skipping
// compression in that case only costs the local API server, never correctness.
const acceptsGzip = (response) => /\bgzip\b/.test(String(response.req?.headers?.["accept-encoding"] || ""));

// Каталог меняется только когда запускают импорт, поэтому одинаковые ответы незачем
// собирать заново для каждого посетителя. `s-maxage` разрешает хранить ответ сети
// Vercel (не браузеру: `max-age=0` оставляет за посетителем свежую проверку), а
// `stale-while-revalidate` отдаёт последний ответ, пока в фоне готовится новый —
// именно на этом окне пропадают полуторасекундные ответы «просыпающейся» функции.
// Помечаем так только чтение каталога: у него нет ничего личного и он не зависит от
// сессии, поэтому общий на всех кэш безопасен.
const catalogCache = { "cache-control":"public, max-age=0, s-maxage=300, stale-while-revalidate=600" };
// Страницу машины собирает робот десятками тысяч раз. Без общего кэша каждый его заход —
// это запрос к базе; с ним сеть Vercel десять минут отдаёт готовый ответ, а сутки после
// этого показывает прежний, пока в фоне готовится новый.
const seoPageCache = { "cache-control":"public, max-age=0, s-maxage=600, stale-while-revalidate=86400" };

// Каталог нужен только собственным страницам, поэтому разрешения на сторонние
// запросы больше нет: с `access-control-allow-origin: *` любой чужой сайт мог
// выкачивать каталог из браузера своих посетителей. В дев-режиме vite проксирует
// `/api` на этот же адрес, так что запросы приложения остаются свойственными.
// Понадобится отдать каталог партнёру или мобильному приложению — разрешение
// возвращают точечно, конкретному адресу, а не всем.
const json = async (response, status, payload, headers = {}) => {
  const responseHeaders = { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...headers };
  if (status === 204) {
    response.writeHead(status, responseHeaders);
    return response.end();
  }
  let body = Buffer.from(JSON.stringify(payload), "utf8");
  if (body.length >= compressFromBytes && acceptsGzip(response)) {
    body = await gzipAsync(body);
    responseHeaders["content-encoding"] = "gzip";
    responseHeaders.vary = responseHeaders.vary ? `${responseHeaders.vary}, accept-encoding` : "accept-encoding";
  }
  response.writeHead(status, { ...responseHeaders, "content-length":String(body.length) });
  return response.end(body);
};
// Страницы для поисковика отдаются HTML, а не JSON: то же сжатие, но свой тип и свой кэш.
const html = async (response, status, markup, headers = {}) => {
  const responseHeaders = { "content-type":"text/html; charset=utf-8", "cache-control":"no-store", ...headers };
  let body = Buffer.from(markup, "utf8");
  if (body.length >= compressFromBytes && acceptsGzip(response)) {
    body = await gzipAsync(body);
    responseHeaders["content-encoding"] = "gzip";
    responseHeaders.vary = responseHeaders.vary ? `${responseHeaders.vary}, accept-encoding` : "accept-encoding";
  }
  response.writeHead(status, { ...responseHeaders, "content-length":String(body.length) });
  return response.end(body);
};

const readJson = async (request) => {
  if (request.body !== undefined) {
    if (request.body === null || request.body === "") return {};
    if (Buffer.isBuffer(request.body)) return JSON.parse(request.body.toString("utf8") || "{}");
    if (typeof request.body === "string") return JSON.parse(request.body || "{}");
    if (typeof request.body === "object") return request.body;
  }
  const chunks=[]; let size=0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65_536) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
};

// Один ответ на все превышения: сколько именно попыток осталось, снаружи знать незачем.
const tooManyRequests = (response, retryAfter) =>
  json(response, 429, { error:"too_many_requests" }, { "retry-after":String(retryAfter) });

export async function handleApiRequest(request, response) {
  if (request.method === "OPTIONS") return json(response, 204, null);
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "POST" && url.pathname === "/api/analytics/events") {
      const limit = await checkRateLimit("analyticsEvents", [clientAddress(request)]);
      if (!limit.allowed) return tooManyRequests(response, limit.retryAfter);
      const body = await readJson(request);
      // Отвечаем как обычно и молчим о причине: незачем подсказывать, как
      // подделать событие. Для страницы сайта разницы нет — она ответ не читает.
      if (!fromOwnPage(request.headers) || isBotAgent(request.headers["user-agent"])) return json(response, 202, { ok:true, recorded:false });
      if (await isDatacenterAddress(clientAddress(request))) return json(response, 202, { ok:true, recorded:false });
      const result = await recordAnalyticsEvent(body);
      return result.error ? json(response, 400, result) : json(response, 202, result);
    }
    // Страница сообщает, что за заходом стоит живой человек: он подвигал мышью,
    // коснулся экрана, прокрутил, нажал клавишу или просто пробыл на странице.
    if (request.method === "POST" && url.pathname === "/api/analytics/human") {
      const limit = await checkRateLimit("analyticsEvents", [clientAddress(request)]);
      if (!limit.allowed) return tooManyRequests(response, limit.retryAfter);
      const body = await readJson(request);
      if (!fromOwnPage(request.headers) || isBotAgent(request.headers["user-agent"])) return json(response, 202, { ok:true, confirmed:0 });
      if (await isDatacenterAddress(clientAddress(request))) return json(response, 202, { ok:true, confirmed:0 });
      const result = await confirmHumanVisit(body);
      return result.error ? json(response, 400, result) : json(response, 202, result);
    }
    if (request.method === "POST" && url.pathname === "/api/analytics/login") {
      const limit = await checkRateLimit("analyticsLogin", [clientAddress(request)]);
      if (!limit.allowed) return tooManyRequests(response, limit.retryAfter);
      const body = await readJson(request);
      const verification = verifyAnalyticsPassword(String(body.password || ""));
      if (verification.error) return json(response, 503, { error:verification.error });
      if (!verification.ok) return json(response, 401, { error:"invalid_password" });
      return json(response, 200, { ok:true }, { "set-cookie":analyticsCookie(createAnalyticsToken(), request) });
    }
    if (request.method === "POST" && url.pathname === "/api/analytics/logout") {
      return json(response, 200, { ok:true }, { "set-cookie":clearAnalyticsCookie(request) });
    }
    if (request.method === "GET" && url.pathname === "/api/analytics/dashboard") {
      if (!hasAnalyticsSession(request)) return json(response, 401, { error:"unauthorized" });
      return json(response, 200, await getAnalyticsDashboard(url.searchParams.get("days")));
    }
    if (request.method === "GET" && url.pathname === "/api/analytics/leads") {
      if (!hasAnalyticsSession(request)) return json(response, 401, { error:"unauthorized" });
      return json(response, 200, await getAnalyticsLeads());
    }
    if (request.method === "GET" && url.pathname === "/api/analytics/updates") {
      if (!hasAnalyticsSession(request)) return json(response, 401, { error:"unauthorized" });
      return json(response, 200, await getAnalyticsUpdates(Object.fromEntries(url.searchParams)));
    }
    if (request.method === "DELETE" && url.pathname === "/api/analytics/events") {
      if (!hasAnalyticsSession(request)) return json(response, 401, { error:"unauthorized" });
      return json(response, 200, await resetAnalyticsData());
    }
    if (request.method === "GET" && url.pathname === "/api/image") {
      let source;
      try { source = new URL(url.searchParams.get("src") || ""); } catch { return json(response, 400, { error:"invalid_image_url" }); }
      if (!allowedImageSource(source)) return json(response, 403, { error:"image_host_not_allowed" });
      const upstream = await fetchAllowedImage(source);
      if (upstream.error) return json(response, upstream.status, { error:upstream.error });
      const bytes = Number(upstream.response.headers.get("content-length")) || 0;
      if (bytes > maxImageBytes) return json(response, 502, { error:"image_too_large" });
      response.writeHead(200, { "content-type":upstream.contentType, "cache-control":"public, max-age=21600, stale-while-revalidate=86400", "x-content-type-options":"nosniff" });
      return Readable.fromWeb(upstream.response.body).pipe(response);
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      // Без пароля — только «сайт жив» и размер каталога. Очередь задач, состояние
      // источников и тексты ошибок наружу не отдаём: это внутренняя кухня импорта,
      // а в текст ошибки однажды может попасть адрес прокси. Всё это остаётся
      // доступным по той же куке, что и раздел аналитики.
      const cars = await pool.query("SELECT count(*)::int AS cars FROM listings WHERE status='active'");
      const publicHealth = { ok:true, cars:cars.rows[0].cars };
      if (!hasAnalyticsSession(request)) return json(response, 200, publicHealth);
      const [jobs,sources] = await Promise.all([
        pool.query("SELECT count(*) FILTER (WHERE status='queued')::int queued, count(*) FILTER (WHERE status='running')::int running, count(*) FILTER (WHERE status='failed')::int failed FROM crawl_jobs"),
        pool.query("SELECT source,status,blocked_until,last_success_at,last_failure_at,consecutive_failures,last_error FROM source_health ORDER BY source"),
      ]);
      return json(response, 200, { ...publicHealth, database:"postgresql", jobs:jobs.rows[0], sources:sources.rows });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/register") {
      // Ограничение здесь закрывает сразу две вещи: набивание базы пустыми аккаунтами
      // и перебор номеров, по ответу которого видно, зарегистрирован телефон или нет.
      const limit = await checkRateLimit("register", [clientAddress(request)]);
      if (!limit.allowed) return tooManyRequests(response, limit.retryAfter);
      const body = await readJson(request);
      const name = String(body.name || "").trim();
      const phone = normalizePhone(body.phone);
      const password = String(body.password || "");
      if (name.length < 2 || name.length > 80) return json(response, 400, { error:"invalid_name" });
      if (phone.length < 11 || phone.length > 15) return json(response, 400, { error:"invalid_phone" });
      if (password.length < 8 || password.length > 128) return json(response, 400, { error:"invalid_password" });
      const result = await createAccount({ name, phone, password });
      if (result.error) return json(response, 409, result);
      const token = await createSession(result.user.id);
      return json(response, 201, { user:result.user }, { "set-cookie":sessionCookie(token, request) });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await readJson(request);
      // Считаем и по адресу, и по номеру: иначе один аккаунт перебирали бы с разных адресов.
      const limit = await checkRateLimit("login", [clientAddress(request), `phone:${normalizePhone(body.phone)}`]);
      if (!limit.allowed) return tooManyRequests(response, limit.retryAfter);
      const user = await authenticateAccount({ phone:body.phone, password:String(body.password || "") });
      if (!user) return json(response, 401, { error:"invalid_credentials" });
      const token = await createSession(user.id);
      return json(response, 200, { user }, { "set-cookie":sessionCookie(token, request) });
    }
    if (request.method === "GET" && url.pathname === "/api/auth/me") {
      const user = await getSessionUser(request);
      return user ? json(response, 200, { user }) : json(response, 401, { error:"unauthorized" });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/logout") {
      await deleteSession(request);
      return json(response, 200, { ok:true }, { "set-cookie":clearSessionCookie(request) });
    }
    if (request.method === "PATCH" && url.pathname === "/api/account") {
      const body = normalizeProfile(await readJson(request));
      if (body.name.length < 2 || body.name.length > 80) return json(response, 400, { error:"invalid_name" });
      if (body.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.email.length > 160)) return json(response, 400, { error:"invalid_email" });
      if (body.telegram.length > 80) return json(response, 400, { error:"invalid_telegram" });
      if (body.city.length > 120) return json(response, 400, { error:"invalid_city" });
      if (body.passportNumber.length > 20 || body.personalNumber.length > 20 || body.passportIssuedBy.length > 200 || body.registrationAddress.length > 240) return json(response, 400, { error:"invalid_passport_data" });
      const parsedPassportIssueDate = body.passportIssueDate ? new Date(`${body.passportIssueDate}T00:00:00Z`) : null;
      if (body.passportIssueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(body.passportIssueDate) || Number.isNaN(parsedPassportIssueDate.getTime()) || parsedPassportIssueDate.toISOString().slice(0,10) !== body.passportIssueDate)) return json(response, 400, { error:"invalid_passport_data" });
      if (body.preferredContact === "email" && !body.email) return json(response, 400, { error:"email_required" });
      if (body.preferredContact === "telegram" && !body.telegram) return json(response, 400, { error:"telegram_required" });
      const result = await updateAccountProfile(request, body);
      return result.error ? json(response, 401, result) : json(response, 200, result);
    }
    if (request.method === "DELETE" && url.pathname === "/api/account") {
      // Здесь тоже проверяется пароль, значит и здесь его можно было бы подбирать.
      const limit = await checkRateLimit("accountDelete", [clientAddress(request)]);
      if (!limit.allowed) return tooManyRequests(response, limit.retryAfter);
      const body = await readJson(request);
      const result = await deleteAccount(request, String(body.password || ""));
      if (result.error === "unauthorized") return json(response, 401, result);
      if (result.error) return json(response, 400, result);
      return json(response, 200, result, { "set-cookie":clearSessionCookie(request) });
    }
    if (request.method === "GET" && url.pathname === "/api/account/favorites") {
      const result = await listAccountFavorites(request);
      return result.error ? json(response, 401, result) : json(response, 200, result);
    }
    if (request.method === "GET" && url.pathname === "/api/account/searches") {
      const result = await listCustomerSearches(request);
      return result.error ? json(response, 401, result) : json(response, 200, result);
    }
    if (request.method === "POST" && url.pathname === "/api/account/searches") {
      const body = await readJson(request);
      const title = String(body.title || "").trim();
      if (!title || title.length > 160) return json(response, 400, { error:"invalid_title" });
      const filters = normalizeSearchFilters(body.filters);
      if (!filters) return json(response, 400, { error:"invalid_filters" });
      const result = await createCustomerSearch(request, title, filters);
      if (result.error === "unauthorized") return json(response, 401, result);
      if (result.error) return json(response, 409, result);
      return json(response, 201, result);
    }
    const searchDeleteMatch = request.method === "DELETE" && url.pathname.match(/^\/api\/account\/searches\/(\d+)$/);
    if (searchDeleteMatch) {
      const result = await deleteCustomerSearch(request, Number(searchDeleteMatch[1]));
      return result.error ? json(response, 401, result) : json(response, 200, result);
    }
    if (request.method === "GET" && url.pathname === "/api/account/orders") {
      const result = await listCustomerOrders(request);
      return result.error ? json(response, 401, result) : json(response, 200, result);
    }
    if (request.method === "POST" && url.pathname === "/api/account/orders") {
      const body = await readJson(request);
      const listingId = String(body.listingId || "").trim();
      if (!listingId || listingId.length > 200) return json(response, 400, { error:"invalid_listing_id" });
      const result = await createCustomerOrder(request, listingId);
      if (result.error === "unauthorized") return json(response, 401, result);
      if (result.error) return json(response, 404, result);
      return json(response, 201, result);
    }
    const orderMatch = request.method === "PATCH" && url.pathname.match(/^\/api\/account\/orders\/(\d+)$/);
    if (orderMatch) {
      const body = await readJson(request);
      const result = await updateCustomerOrder(request, Number(orderMatch[1]), String(body.action || ""), {
        comment:String(body.comment || ""),
        contactName:String(body.contactName || ""),
        contactPhone:String(body.contactPhone || ""),
        contactMethods:Array.isArray(body.contactMethods) ? body.contactMethods : [],
        consent:body.consent === true,
      });
      if (result.error === "unauthorized") return json(response, 401, result);
      if (result.error === "order_not_found") return json(response, 404, result);
      if (result.error) return json(response, 409, result);
      return json(response, 200, result);
    }
    const orderDeleteMatch = request.method === "DELETE" && url.pathname.match(/^\/api\/account\/orders\/(\d+)$/);
    if (orderDeleteMatch) {
      const result = await deleteCustomerOrder(request, Number(orderDeleteMatch[1]));
      if (result.error === "unauthorized") return json(response, 401, result);
      if (result.error === "order_not_found") return json(response, 404, result);
      if (result.error) return json(response, 409, result);
      return json(response, 200, result);
    }
    const favoriteMatch = ["PUT", "DELETE"].includes(request.method) && url.pathname.match(/^\/api\/account\/favorites\/([^/]+)$/);
    if (favoriteMatch) {
      const listingId = decodeURIComponent(favoriteMatch[1]);
      if (!listingId || listingId.length > 200) return json(response, 400, { error:"invalid_listing_id" });
      const result = await setAccountFavorite(request, listingId, request.method === "PUT");
      return result.error ? json(response, 401, result) : json(response, 200, result);
    }
    // Готовая страница машины. Адрес `/cars/<номер>` переводит сюда правило в `vercel.json`:
    // поисковик и человек получают страницу с настоящим заголовком, ценой и разметкой, а не
    // общую заготовку, которую заполняет скрипт уже в браузере.
    // HEAD обрабатываем наравне с GET: проверялки ссылок и часть роботов спрашивают
    // страницу именно так, а без этого адрес карточки отвечал им «страницы нет».
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/pages/car") {
      const { renderCarPage } = await import("./car-page.mjs");
      const { carShell } = await import("./dist-files.mjs");
      try {
        const page = await renderCarPage(url.searchParams.get("id"));
        return html(response, page.status, page.html, page.status === 200 ? seoPageCache : { "cache-control":"no-store" });
      } catch (error) {
        console.error(error);
        // База или заготовка недоступны: отдаём обычную заготовку страницы, чтобы
        // приложение всё же загрузилось и показало свою ошибку, но с честным кодом —
        // по нему поисковик придёт позже, а не запомнит пустую карточку.
        const fallback = await carShell().catch(() => null);
        const status = isDatabaseUnavailable(error) ? 503 : 500;
        if (!fallback) return json(response, status, { error:isDatabaseUnavailable(error) ? "service_unavailable" : "internal_error" });
        return html(response, status, fallback, { "cache-control":"no-store" });
      }
    }
    // Готовый обзор модели: `/models/byd-han`. Текст статьи плюс живые предложения с ценами.
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/pages/model") {
      try {
        const { renderModelPage } = await import("./model-page.mjs");
        const page = await renderModelPage(url.searchParams.get("slug"));
        if (page.location) {
          response.writeHead(301, { location: page.location, ...seoPageCache });
          return response.end();
        }
        return html(response, page.status, page.html, page.status === 200 ? seoPageCache : { "cache-control":"no-store" });
      } catch (error) {
        console.error(error);
        const { appShell } = await import("./dist-files.mjs");
        const fallback = await appShell().catch(() => null);
        const status = isDatabaseUnavailable(error) ? 503 : 500;
        if (!fallback) return json(response, status, { error:isDatabaseUnavailable(error) ? "service_unavailable" : "internal_error" });
        return html(response, status, fallback, { "cache-control":"no-store" });
      }
    }
    // Готовая страница раздела каталога: `/catalog/byd`, `/catalog/electric`, `/catalog/suv`.
    // Адрес переводит сюда правило в `vercel.json`.
    if (["GET", "HEAD"].includes(request.method) && url.pathname === "/api/pages/catalog") {
      try {
        const { renderCatalogIndex, renderCatalogPage } = await import("./catalog-page.mjs");
        const slug = url.searchParams.get("slug");
        // Без раздела в адресе это общий каталог `/catalog`, возможно с фильтрами.
        // Фильтры, повторяющие готовый раздел, уводят на него постоянным перебросом:
        // иначе у поисковика оставались бы два адреса с одной и той же выдачей.
        if (!slug) {
          const params = new URLSearchParams(url.searchParams);
          params.delete("path");
          params.delete("slug");
          const index = await renderCatalogIndex(params);
          if (index.location) {
            response.writeHead(301, { location: index.location, ...seoPageCache });
            return response.end();
          }
          return html(response, index.status, index.html, index.status === 200 ? seoPageCache : { "cache-control":"no-store" });
        }
        // Параметры адреса нужны разделу так же, как каталогу: по ним выбирается
        // страница списка («?page=2»), а «?page=1» уводит на адрес без параметра.
        const sectionParams = new URLSearchParams(url.searchParams);
        sectionParams.delete("path");
        sectionParams.delete("slug");
        const page = await renderCatalogPage(slug, sectionParams);
        if (page.location) {
          response.writeHead(301, { location: page.location, ...seoPageCache });
          return response.end();
        }
        return html(response, page.status, page.html, page.status === 200 ? seoPageCache : { "cache-control":"no-store" });
      } catch (error) {
        console.error(error);
        // Раздел каталога без данных показывать нечем: отдаём обычную страницу каталога,
        // чтобы приложение загрузилось и показало выдачу само.
        const { appShell } = await import("./dist-files.mjs");
        const fallback = await appShell().catch(() => null);
        const status = isDatabaseUnavailable(error) ? 503 : 500;
        if (!fallback) return json(response, status, { error:isDatabaseUnavailable(error) ? "service_unavailable" : "internal_error" });
        return html(response, status, fallback, { "cache-control":"no-store" });
      }
    }
    if (request.method === "GET" && url.pathname === "/api/cars") return json(response, 200, await listCars(url.searchParams), catalogCache);
    if (request.method === "GET" && url.pathname === "/api/model-facts") return json(response, 200, await getModelFacts(), catalogCache);
    if (request.method === "GET" && url.pathname === "/api/catalog/meta") return json(response, 200, await getCatalogMeta(url.searchParams.get("type"), url.searchParams.get("brand"), url.searchParams.getAll("bodyType")), catalogCache);
    const carMatch = request.method === "GET" && url.pathname.match(/^\/api\/cars\/([^/]+)$/);
    if (carMatch) {
      const car = await getCar(decodeURIComponent(carMatch[1]));
      // Проданная машина отвечает так же, как несуществующая: каталог её уже не
      // показывает, и карточка не должна обещать то, чего в Китае больше нет.
      // На этом же ответе держится чистка избранного: страница «Избранное» убирает
      // из списка машину, за которой пришло «объявления нет».
      // Ненайденную карточку не кэшируем: объявление может появиться следующим импортом.
      if (car && car.available === false) return json(response, 404, { error:"listing_unavailable" });
      return car ? json(response, 200, car, catalogCache) : json(response, 404, { error:"car_not_found" });
    }
    if (request.method === "POST" && url.pathname === "/api/order-drafts") {
      // Каждая заявка ставит краулеру задачу с высоким приоритетом, поэтому поток
      // поддельных заявок — это ещё и способ загнать наш краулер в блокировку источника.
      const limit = await checkRateLimit("orderDraft", [clientAddress(request)]);
      if (!limit.allowed) return tooManyRequests(response, limit.retryAfter);
      const body = await readJson(request);
      let name = String(body.name || "").trim();
      let contact = String(body.contact || "").trim();
      const requestType = String(body.calculation?.requestType || "");
      const preferences = String(body.calculation?.preferences || "").trim();
      const isCatalogSearch = requestType === "catalog_search";
      const isAvailabilityCheck = requestType === "availability_check";
      let calculation = body.calculation && typeof body.calculation === "object" && !Array.isArray(body.calculation) ? body.calculation : {};
      if ((!body.listingId && !isCatalogSearch) || !contact) return json(response, 400, { error:"listing_and_contact_required" });
      if (isCatalogSearch && (preferences.length < 10 || preferences.length > 2000)) return json(response, 400, { error:"invalid_preferences" });
      if (isAvailabilityCheck) {
        const phoneDigits = contact.replace(/\D/g, "");
        const requestedMethods = Array.isArray(calculation.contactMethods) ? calculation.contactMethods : [];
        const contactMethods = [...new Set(requestedMethods)];
        if (name.length < 2 || name.length > 80) return json(response, 400, { error:"invalid_name" });
        if (phoneDigits.length < 11 || phoneDigits.length > 15) return json(response, 400, { error:"invalid_phone" });
        if (!contactMethods.length || contactMethods.length !== requestedMethods.length || contactMethods.some((value) => !["phone","viber","telegram"].includes(value))) return json(response, 400, { error:"invalid_contact_methods" });
        if (body.consent !== true) return json(response, 400, { error:"contact_consent_required" });
        contact = `+${phoneDigits}`;
        calculation = { ...calculation, contactMethods, consentAccepted:true };
      }
      if (name.length > 120) return json(response, 400, { error:"name_too_long" });
      if (contact.length > 200) return json(response, 400, { error:"contact_too_long" });
      return json(response, 201, await createOrderDraft({ listingId:body.listingId || null, name:name || null, contact, calculation }));
    }
    return json(response, 404, { error:"not_found" });
  } catch (error) {
    console.error(error);
    if (isDatabaseUnavailable(error)) return json(response, 503, { error:"service_unavailable" });
    return json(response, 500, { error:"internal_error" });
  }
}

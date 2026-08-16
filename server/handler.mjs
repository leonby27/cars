import { Readable } from "node:stream";
import { isDatabaseUnavailable, pool } from "./db.mjs";
import { authenticateAccount, clearSessionCookie, createAccount, createSession, deleteAccount, deleteSession, getSessionUser, listAccountFavorites, normalizePhone, normalizeProfile, sessionCookie, setAccountFavorite, updateAccountProfile } from "./auth.mjs";
import { createOrderDraft, getCar, getCatalogMeta, listCars } from "./repository.mjs";
import { createCustomerOrder, deleteCustomerOrder, listCustomerOrders, updateCustomerOrder } from "./orders.mjs";

const imageHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
const json = (response, status, payload, headers = {}) => {
  response.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "access-control-allow-origin":"*", "access-control-allow-headers":"content-type", ...headers });
  response.end(status === 204 ? undefined : JSON.stringify(payload));
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

export async function handleApiRequest(request, response) {
  if (request.method === "OPTIONS") return json(response, 204, null);
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (request.method === "GET" && url.pathname === "/api/image") {
      let source;
      try { source = new URL(url.searchParams.get("src") || ""); } catch { return json(response, 400, { error:"invalid_image_url" }); }
      if (source.protocol !== "https:" || !imageHosts.has(source.hostname)) return json(response, 403, { error:"image_host_not_allowed" });
      const upstream = await fetch(source, { redirect:"follow", headers:{ accept:"image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "user-agent":"evcars.by-image-proxy/1.0" } });
      const contentType = upstream.headers.get("content-type") || "";
      if (!upstream.ok || !contentType.startsWith("image/") || !upstream.body) return json(response, 502, { error:"image_unavailable" });
      response.writeHead(200, { "content-type":contentType, "cache-control":"public, max-age=21600, stale-while-revalidate=86400", "x-content-type-options":"nosniff" });
      return Readable.fromWeb(upstream.body).pipe(response);
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      const [cars,jobs,sources] = await Promise.all([
        pool.query("SELECT count(*)::int AS cars FROM listings WHERE status='active'"),
        pool.query("SELECT count(*) FILTER (WHERE status='queued')::int queued, count(*) FILTER (WHERE status='running')::int running, count(*) FILTER (WHERE status='failed')::int failed FROM crawl_jobs"),
        pool.query("SELECT source,status,blocked_until,last_success_at,last_failure_at,consecutive_failures,last_error FROM source_health ORDER BY source"),
      ]);
      return json(response, 200, { ok:true, database:"postgresql", cars:cars.rows[0].cars, jobs:jobs.rows[0], sources:sources.rows });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/register") {
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
      if (body.preferredContact === "email" && !body.email) return json(response, 400, { error:"email_required" });
      if (body.preferredContact === "telegram" && !body.telegram) return json(response, 400, { error:"telegram_required" });
      const result = await updateAccountProfile(request, body);
      return result.error ? json(response, 401, result) : json(response, 200, result);
    }
    if (request.method === "DELETE" && url.pathname === "/api/account") {
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
    if (request.method === "GET" && url.pathname === "/api/cars") return json(response, 200, await listCars(url.searchParams));
    if (request.method === "GET" && url.pathname === "/api/catalog/meta") return json(response, 200, await getCatalogMeta(url.searchParams.get("type"), url.searchParams.get("brand"), url.searchParams.get("bodyType")));
    const carMatch = request.method === "GET" && url.pathname.match(/^\/api\/cars\/([^/]+)$/);
    if (carMatch) {
      const car = await getCar(decodeURIComponent(carMatch[1]));
      return car ? json(response, 200, car) : json(response, 404, { error:"car_not_found" });
    }
    if (request.method === "POST" && url.pathname === "/api/order-drafts") {
      const body = await readJson(request);
      const name = String(body.name || "").trim();
      const contact = String(body.contact || "").trim();
      const requestType = String(body.calculation?.requestType || "");
      const preferences = String(body.calculation?.preferences || "").trim();
      const isCatalogSearch = requestType === "catalog_search";
      if ((!body.listingId && !isCatalogSearch) || !contact) return json(response, 400, { error:"listing_and_contact_required" });
      if (isCatalogSearch && (preferences.length < 10 || preferences.length > 2000)) return json(response, 400, { error:"invalid_preferences" });
      if (name.length > 120) return json(response, 400, { error:"name_too_long" });
      if (contact.length > 200) return json(response, 400, { error:"contact_too_long" });
      return json(response, 201, await createOrderDraft({ listingId:body.listingId || null, name:name || null, contact, calculation:body.calculation }));
    }
    return json(response, 404, { error:"not_found" });
  } catch (error) {
    console.error(error);
    if (isDatabaseUnavailable(error)) return json(response, 503, { error:"service_unavailable" });
    return json(response, 500, { error:"internal_error" });
  }
}

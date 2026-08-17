import { handleAnalyticsRequest } from "./analytics.js";

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const analyticsResponse = await handleAnalyticsRequest(request, env, requestUrl);
    if (analyticsResponse) return analyticsResponse;
    const indexingEnabled = String(env.SEO_ALLOW_INDEXING || "").toLowerCase() === "true";
    const withSeoHeaders = (response) => {
      if (indexingEnabled || !response.headers.get("content-type")?.includes("text/html")) return response;
      const headers = new Headers(response.headers);
      headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
    };
    if (request.method === "GET" && requestUrl.pathname === "/api/image") {
      const allowedHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
      let source;
      try {
        source = new URL(requestUrl.searchParams.get("src") || "");
      } catch {
        return Response.json({ error:"invalid_image_url" }, { status:400 });
      }
      if (source.protocol !== "https:" || !allowedHosts.has(source.hostname)) return Response.json({ error:"image_host_not_allowed" }, { status:403 });
      const upstream = await fetch(source, { redirect:"follow", headers:{ accept:"image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "user-agent":"evcars.by-image-proxy/1.0" } });
      const contentType = upstream.headers.get("content-type") || "";
      if (!upstream.ok || !contentType.startsWith("image/") || !upstream.body) return Response.json({ error:"image_unavailable" }, { status:502 });
      return new Response(upstream.body, { status:200, headers:{ "content-type":contentType, "cache-control":"public, max-age=21600, stale-while-revalidate=86400", "x-content-type-options":"nosniff" } });
    }
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return withSeoHeaders(response);
    }

    const cleanPath = requestUrl.pathname.replace(/\/+$/, "") || "/";
    const routeIndexUrl = new URL(request.url);
    routeIndexUrl.pathname = cleanPath === "/" ? "/index.html" : `${cleanPath}/index.html`;
    routeIndexUrl.search = "";
    const routeResponse = await env.ASSETS.fetch(new Request(routeIndexUrl, request));
    if (routeResponse.status !== 404) return withSeoHeaders(routeResponse);

    const privateRoute = ["/account", "/favorites", "/login", "/register", "/analytics"].includes(cleanPath) || cleanPath.startsWith("/orders/");
    if (!privateRoute) {
      const body = request.method === "HEAD" ? null : '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Страница не найдена | evcars.by</title></head><body><main><h1>Страница не найдена</h1><p><a href="/">Вернуться на главную</a></p></main></body></html>';
      return new Response(body, { status:404, headers:{ "content-type":"text/html; charset=utf-8", "x-robots-tag":"noindex, nofollow, noarchive" } });
    }
    const fallbackUrl = new URL(request.url);
    fallbackUrl.pathname = "/private.html";
    fallbackUrl.search = "";
    const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    return withSeoHeaders(fallback);
  },
};

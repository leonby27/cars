import { handleAnalyticsRequest } from "./analytics.js";

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const analyticsResponse = await handleAnalyticsRequest(request, env, requestUrl);
    if (analyticsResponse) return analyticsResponse;
    const indexingEnabled = String(env.SEO_ALLOW_INDEXING || "").toLowerCase() === "true";
    // Те же защитные заголовки, что настроены для основного хостинга в `vercel.json`:
    // запрет встраивания страниц в чужую рамку, запрет угадывания типа файла, ограничение
    // источников содержимого. Карта офиса — единственная разрешённая внешняя рамка.
    const SECURITY_HEADERS = {
      "content-security-policy":"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self'; frame-src 'self' https://yandex.ru https://*.yandex.ru https://yandex.by https://*.yandex.by; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
      "x-content-type-options":"nosniff",
      "x-frame-options":"DENY",
      "referrer-policy":"strict-origin-when-cross-origin",
      "permissions-policy":"camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "cross-origin-opener-policy":"same-origin",
    };
    const withSeoHeaders = (response) => {
      const isHtml = response.headers.get("content-type")?.includes("text/html");
      if (!isHtml && indexingEnabled) return response;
      const headers = new Headers(response.headers);
      if (isHtml) {
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
        if (!indexingEnabled) headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      }
      return new Response(response.body, { status:response.status, statusText:response.statusText, headers });
    };
    // Страницы `/about` больше нет: её заголовок дублировал `/how-it-works`, а содержимое
    // перенесено туда. Старый адрес перебрасываем навсегда — то же правило задано и для
    // основного хостинга в `vercel.json`.
    if (["GET", "HEAD"].includes(request.method) && requestUrl.pathname.replace(/\/+$/, "") === "/about") {
      return Response.redirect(new URL("/how-it-works", requestUrl).toString(), 301);
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/image") {
      const allowedHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
      const allowed = (candidate) => candidate.protocol === "https:" && allowedHosts.has(candidate.hostname);
      let source;
      try {
        source = new URL(requestUrl.searchParams.get("src") || "");
      } catch {
        return Response.json({ error:"invalid_image_url" }, { status:400 });
      }
      if (!allowed(source)) return Response.json({ error:"image_host_not_allowed" }, { status:403 });
      // Перенаправления проходим сами и проверяем каждый следующий адрес: иначе
      // разрешённый сервер источника мог перебросить запрос на любой другой.
      let current = source;
      for (let hop = 0; hop < 3; hop += 1) {
        const upstream = await fetch(current, { redirect:"manual", headers:{ accept:"image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "user-agent":"evcars.by-image-proxy/1.0" } });
        const location = upstream.headers.get("location");
        if (upstream.status >= 300 && upstream.status < 400 && location) {
          let next;
          try { next = new URL(location, current); } catch { return Response.json({ error:"image_unavailable" }, { status:502 }); }
          if (!allowed(next)) return Response.json({ error:"image_host_not_allowed" }, { status:403 });
          current = next;
          continue;
        }
        const contentType = upstream.headers.get("content-type") || "";
        if (!upstream.ok || !contentType.startsWith("image/") || !upstream.body) return Response.json({ error:"image_unavailable" }, { status:502 });
        // Фотография объявления столько не весит: предел отсекает поток через наш прокси.
        if ((Number(upstream.headers.get("content-length")) || 0) > 12 * 1024 * 1024) return Response.json({ error:"image_too_large" }, { status:502 });
        return new Response(upstream.body, { status:200, headers:{ "content-type":contentType, "cache-control":"public, max-age=21600, stale-while-revalidate=86400", "x-content-type-options":"nosniff" } });
      }
      return Response.json({ error:"image_unavailable" }, { status:502 });
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

    // Страницы машин заранее не собираются, поэтому своего файла у `/cars/<id>` нет.
    // Отдаём заготовку с обычным 200 — карточку дорисует приложение поверх API. Иначе
    // каждое объявление отвечало бы «страница не найдена». Если страницы всё же собраны
    // (`SEO_VEHICLE_PAGES=1`), до этой ветки дело не доходит: файл найдётся выше.
    if (cleanPath.startsWith("/cars/")) {
      const carShellUrl = new URL(request.url);
      carShellUrl.pathname = "/car.html";
      carShellUrl.search = "";
      const carShell = await env.ASSETS.fetch(new Request(carShellUrl, request));
      if (carShell.status !== 404) return withSeoHeaders(carShell);
    }

    // Каталог и его разделы тоже собираются сервером по данным базы, а на статическом
    // хостинге сервера нет: отдаём заготовку приложения — выдачу дорисует скрипт по API.
    // Без этого главная страница каталога отвечала бы «страница не найдена».
    if (cleanPath === "/catalog" || cleanPath.startsWith("/catalog/")) {
      const shellUrl = new URL(request.url);
      shellUrl.pathname = "/app-shell.html";
      shellUrl.search = "";
      const appShell = await env.ASSETS.fetch(new Request(shellUrl, request));
      if (appShell.status !== 404) return withSeoHeaders(appShell);
    }

    const privateRoute = ["/account", "/favorites", "/login", "/register", "/analytics"].includes(cleanPath) || cleanPath.startsWith("/orders/");
    if (!privateRoute) {
      const body = request.method === "HEAD" ? null : '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Страница не найдена | abcars.by</title></head><body><main><h1>Страница не найдена</h1><p><a href="/">Вернуться на главную</a></p></main></body></html>';
      return new Response(body, { status:404, headers:{ ...SECURITY_HEADERS, "content-type":"text/html; charset=utf-8", "x-robots-tag":"noindex, nofollow, noarchive" } });
    }
    const fallbackUrl = new URL(request.url);
    fallbackUrl.pathname = "/private.html";
    fallbackUrl.search = "";
    const fallback = await env.ASSETS.fetch(new Request(fallbackUrl, request));
    return withSeoHeaders(fallback);
  },
};

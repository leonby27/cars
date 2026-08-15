export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    if (request.method === "GET" && requestUrl.pathname === "/api/image") {
      const allowedHosts = new Set(["image-public.guazistatic.com", "image-oversea.guazistatic-global.com"]);
      let source;
      try {
        source = new URL(requestUrl.searchParams.get("src") || "");
      } catch {
        return Response.json({ error:"invalid_image_url" }, { status:400 });
      }
      if (source.protocol !== "https:" || !allowedHosts.has(source.hostname)) return Response.json({ error:"image_host_not_allowed" }, { status:403 });
      const upstream = await fetch(source, { redirect:"follow", headers:{ accept:"image/avif,image/webp,image/apng,image/*,*/*;q=0.8", "user-agent":"NaVostok-image-proxy/1.0" } });
      const contentType = upstream.headers.get("content-type") || "";
      if (!upstream.ok || !contentType.startsWith("image/") || !upstream.body) return Response.json({ error:"image_unavailable" }, { status:502 });
      return new Response(upstream.body, { status:200, headers:{ "content-type":contentType, "cache-control":"public, max-age=21600, stale-while-revalidate=86400", "x-content-type-options":"nosniff" } });
    }
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return response;
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};

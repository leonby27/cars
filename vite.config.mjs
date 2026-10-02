import "./config/load-env.mjs";
import { defineConfig, loadEnv } from "vite";
import { assertSiteProfile, resolveSiteProfile } from "./config/sites/index.mjs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { trimModelPages } from "./scripts/vite-trim-model-pages.mjs";
import { guaziLocalPreview } from "./scripts/vite-guazi-preview.mjs";
import { encarResizeQuery } from "./src/photo-source.js";

// Сервер разработки — для расчёта популярных моделей теми же модулями, что и сборка.
let server = null;

export default defineConfig(({ mode }) => {
  const site = assertSiteProfile(resolveSiteProfile({ ...loadEnv(mode, process.cwd(), ""), ...process.env }));
  return {
  define: { __SITE_ID__: JSON.stringify(site.id) },
  base: "/",
  build: {
    outDir: join(process.env.ABCARS_BUILD_DIR || "dist", "client"),
    sourcemap: true,
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: false },
      // Фотографии машин сайт просит со своего адреса /photo/… — на боевом сервере
      // их отдаёт nginx, забирая кадр у китайского хранилища и складывая на диск
      // (snippets/abcars-photo-location.conf). Локально nginx нет, и без этой
      // переадресации каталог остаётся без снимков. Берём ту же серверную копию,
      // что и посетители сайта: прямой запрос в Китай обходил уже готовый кэш.
      // Кадры Encar (Корея) локально берём прямо у хранилища — размер из пути переводится
      // в его параметры, как это делает nginx (deploy/nginx-abcars-photo-location.conf).
      "/photo/encar": {
        target: "https://ci.encar.com",
        changeOrigin: true,
        rewrite: (url) => {
          const match = url.match(/^\/photo\/encar\/(?:v2\/)?w(600|1200|1920)(\/[^?]*)/);
          return match ? `${match[2]}?${encarResizeQuery(Number(match[1]))}` : url;
        },
        configure(proxy) {
          proxy.on("proxyReq", (request) => {
            request.removeHeader("cookie");
            request.removeHeader("authorization");
            request.setHeader("referer", "https://www.encar.com/");
          });
        },
      },
      "/photo": {
        target: "https://abcars.by",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (request) => {
            request.removeHeader("cookie");
            request.removeHeader("authorization");
            request.removeHeader("referer");
          });
        },
      },
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    react(),
    guaziLocalPreview(),
    {
      name: "legal-pdf-viewer",
      configureServer(server) { server.middlewares.use(legalPdfResponse); },
      configurePreviewServer(server) { server.middlewares.use(legalPdfResponse); },
    },
    // Из браузерной сборки убираем поля обзоров, которые читает только сервер:
    // подробности в scripts/vite-trim-model-pages.mjs.
    trimModelPages(),
    // Стили обычной ссылкой на время разработки.
    //
    // В собранном сайте файл стилей подключён ссылкой в <head>: браузер не рисует
    // страницу, пока его не получит, и мерцания нет. А на локальной версии стили
    // приезжают внутри скрипта приложения, поэтому первая отрисовка успевает
    // пройти без них. Чтобы локальная версия вела себя как боевая, здесь те же
    // файлы дополнительно подключаются ссылкой. В сборку это не попадает.
    // Популярные модели на главной во время разработки.
    //
    // В собранном сайте их список встроен в главную заранее (scripts/generate-seo-pages.mjs
    // → prerender-home.mjs), а локальная страница — пустая заготовка, и блока на ней не
    // было. Здесь тот же расчёт делается из локальной базы при открытии главной, и
    // данные встраиваются так же, как в сборке. В сборку это не попадает.
    {
      name: "dev-home-popular-models",
      apply: "serve",
      async transformIndexHtml(html, ctx) {
        if (new URL(ctx.originalUrl || ctx.path, "http://localhost").pathname !== "/") return;
        try {
          const facts = await fetch("http://127.0.0.1:8787/api/model-facts").then((answer) => (answer.ok ? answer.json() : null));
          const { homePopularModels } = await server.ssrLoadModule("/src/home-popular-models.js");
          const { models, brands } = homePopularModels(facts?.models || []);
          if (!models.length) return;
          const data = JSON.stringify({ popularModels: models, brandModelTabs: brands }).replace(/</g, "\\u003c");
          return [{ tag: "script", children: `Object.assign(window.__boot = window.__boot || {}, ${data});`, injectTo: "head" }];
        } catch {
          // API ещё не поднялся — главная откроется без блока, как раньше.
        }
      },
      configureServer(devServer) { server = devServer; },
    },
    {
      name: "dev-blocking-css",
      apply: "serve",
      transformIndexHtml() {
        return ["/src/styles.css", "/src/order-contact.css", "/src/analytics.css"].map((href) => ({
          tag: "link",
          attrs: { rel: "stylesheet", href: `${href}?direct` },
          injectTo: "head",
        }));
      },
    },
  ],
  };
});

// Match production PDF viewing behavior in development and preview.
function legalPdfResponse(request, response, next) {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const legacy = { "/privacy": "/documents/privacy-policy.pdf", "/terms": "/documents/terms-of-use.pdf" };
  const destination = legacy[pathname.replace(/\/+$/, "")];
  if (destination) {
    response.writeHead(302, { Location: destination });
    response.end();
    return;
  }
  if (/^\/documents\/[^/]+\.pdf$/.test(pathname)) {
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", "inline");
    response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
  }
  next();
}

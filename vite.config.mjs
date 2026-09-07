import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { trimModelPages } from "./scripts/vite-trim-model-pages.mjs";

export default defineConfig({
  base: "/",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": "http://127.0.0.1:8787",
      // Фотографии машин сайт просит со своего адреса /photo/… — на боевом сервере
      // их отдаёт nginx, забирая кадр у китайского хранилища и складывая на диск
      // (snippets/abcars-photo-location.conf). Локально nginx нет, и без этой
      // переадресации каталог остаётся без снимков. Берём ту же серверную копию,
      // что и посетители сайта: прямой запрос в Китай обходил уже готовый кэш.
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
});

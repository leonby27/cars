import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

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
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    react(),
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

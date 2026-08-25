import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { installRussianTypography } from "./typography.js";
import { loadModelText } from "./model-text-load.js";
import { loadToolPageTexts } from "./tool-page-text-load.js";
import { findToolPage } from "./tool-pages.js";
import "./styles.css";
import "./order-contact.css";
import "./analytics.css";

const root = document.getElementById("root");

// Обзор модели, открытый по прямой ссылке: его текст лежит отдельным файлом, и
// приложение ждёт этот файл, прежде чем занять собой страницу. Иначе посетитель
// на мгновение увидел бы обзор без текста — заголовок, фотографии и пустоту.
// Ошибку глотаем: без текста страница всё равно откроется, а он подгрузится сам.
const modelSlug = (() => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = window.location.pathname;
  const unbased = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return /^\/models\/([^/]+)\/?$/.exec(unbased)?.[1] || null;
})();
function start() {
  // Build-time SEO pages contain meaningful HTML for crawlers and no-JS clients.
  // The interactive application takes over once its bundle is ready.
  if (root.hasChildNodes()) root.replaceChildren();
  // Текст для поисковиков `index.html` прячет до запуска приложения, чтобы он не мелькал
  // простой вёрсткой. Он уже убран — снимаем скрытие, иначе не покажется и само приложение.
  document.documentElement.classList.remove("booting");
  installRussianTypography(root);

  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

// Страницы-инструменты (растаможка, доставка, квота, калькулятор) устроены так же:
// их тексты лежат отдельным файлом, и по прямой ссылке приложение ждёт его, чтобы
// страница появилась сразу с текстом. Ошибку глотаем по той же причине.
const isToolPath = (() => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const pathname = window.location.pathname;
  const unbased = base && pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  return Boolean(findToolPage(unbased));
})();

if (modelSlug) loadModelText(modelSlug).catch(() => null).then(start);
else if (isToolPath) loadToolPageTexts().catch(() => null).then(start);
else start();

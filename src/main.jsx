import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
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
// Обёртка, сообщающая, что оживление готовой разметки завершилось. Эффект React
// выполняет после сверки и первого кадра — раньше включать типографику нельзя:
// она меняет пробелы в тексте, React счёл бы разметку чужой и перерисовал страницу
// целиком, потеряв весь выигрыш готовой разметки. Просто вызвать типографику после
// hydrateRoot тоже нельзя — оживление у React неспешное и к возврату вызова ещё
// не закончено (на этом и споткнулась первая версия).
function AfterHydration({ onReady, children }) {
  React.useEffect(() => onReady(), [onReady]);
  return children;
}

function start() {
  const app = (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  // Главную страницу сборка кладёт в #root уже нарисованной (scripts/prerender-home.mjs):
  // её не перерисовываем, а оживляем — React сверяет готовую разметку со своей и просто
  // добавляет поведение. Так заголовок и первый экран видны сразу, до загрузки скрипта.
  // В метке лежит адрес, для которого разметка собрана ("/" или "/cars/<номер>").
  // Сверяем с настоящим адресом: файл главной веб-сервер подкладывает и под чужие
  // адреса (/favorites и т.п.), а карточку могли открыть по неканонической ссылке —
  // в обоих случаях оживлять чужую разметку бессмысленно, приложение рисует с нуля.
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const currentPath = (window.location.pathname.replace(/\/+$/, "") || "/").replace(base, "") || "/";
  const prerenderedFor = (root.dataset.prerender || "").replace(/\/+$/, "") || (root.dataset.prerender ? "/" : "");
  if (prerenderedFor && prerenderedFor === currentPath) {
    document.documentElement.classList.remove("booting");
    const ready = () => installRussianTypography(root);
    hydrateRoot(
      root,
      <React.StrictMode>
        <AfterHydration onReady={ready}>
          <App />
        </AfterHydration>
      </React.StrictMode>,
    );
    return;
  }
  // Build-time SEO pages contain meaningful HTML for crawlers and no-JS clients.
  // The interactive application takes over once its bundle is ready.
  if (root.hasChildNodes()) root.replaceChildren();
  // Текст для поисковиков `index.html` прячет до запуска приложения, чтобы он не мелькал
  // простой вёрсткой. Он уже убран — снимаем скрытие, иначе не покажется и само приложение.
  document.documentElement.classList.remove("booting");
  // Пометку «чужой адрес с разметкой главной» ставит сама страница (prerender-home):
  // до этого места была видна только шапка, дальше рисуем настоящую страницу.
  document.documentElement.classList.remove("foreign-boot");
  installRussianTypography(root);

  createRoot(root).render(app);
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

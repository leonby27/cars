// Серверная точка входа: собирает готовую разметку приложения в строку.
//
// Из неё scripts/prerender-home.mjs берёт главную страницу в «стартовом» состоянии —
// то, что приложение рисует до прихода каталога: шапка, заголовок, поиск, плитки
// марок, скелеты карточек, шаги заказа, вопросы, подвал. Браузер показывает эту
// разметку сразу, а приложение, загрузившись, не перерисовывает её, а оживляет
// (hydrateRoot в main.jsx) — поэтому серверный и браузерный первый кадр обязаны
// совпадать до последнего тега.
//
// Заглушка браузера стоит первым импортом — раньше всех модулей приложения.
import { setServerLocation } from "./server-browser-shim.js";
import React from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App.jsx";
import { primeModelText } from "./model-text-load.js";

const render = () =>
  // Тот же StrictMode, что в main.jsx: на разметку он не влияет, но пусть обе точки
  // входа остаются зеркальными — расхождение здесь стоило бы часов поиска.
  renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

/** Готовая разметка страницы по адресу — для страниц без данных (главная). */
export function renderAppPage(pathname = "/", boot = undefined) {
  setServerLocation(pathname);
  // `boot` — данные, которые сборка встраивает в страницу (популярные модели на главной):
  // приложение в браузере прочтёт их же, и первый кадр совпадёт с этой разметкой.
  globalThis.window.__boot = boot;
  try {
    return render();
  } finally {
    globalThis.window.__boot = undefined;
  }
}

/**
 * Готовая разметка карточки машины. `car` и `related` — сырые записи в том виде,
 * в каком их отдаёт /api/cars: приложение нормализует их само, и браузер при
 * оживлении сделает то же самое с теми же данными (сервер встраивает их в страницу),
 * поэтому серверный и браузерный первый кадр совпадают байт в байт.
 */
export function renderCarApp(pathname, { car, related = [] }) {
  setServerLocation(pathname);
  globalThis.window.__boot = { carId: car.id, carValue: car, relatedValue: related };
  try {
    return render();
  } finally {
    globalThis.window.__boot = undefined;
  }
}

/**
 * Готовая разметка каталожной страницы модели (`/catalog/byd/seal`, с номером
 * страницы в строке запроса). `data` — ответ modelCatalogData (server/model-page.mjs):
 * список машин первой страницы, цифры и обзор; приложение рисует из него первый
 * кадр, а браузер при оживлении получает те же байты через window.__boot.
 */
export function renderModelApp(pathname, search, boot, { text = null } = {}) {
  setServerLocation(pathname, search);
  // Текст обзора — в загруженные заранее: браузер до оживления подгрузит тот же файл.
  if (boot?.modelCatalog?.review?.slug && text) primeModelText(boot.modelCatalog.review.slug, text);
  globalThis.window.__boot = boot;
  try {
    return render();
  } finally {
    globalThis.window.__boot = undefined;
    setServerLocation("/", "");
  }
}

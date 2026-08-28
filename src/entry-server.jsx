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

const render = () =>
  // Тот же StrictMode, что в main.jsx: на разметку он не влияет, но пусть обе точки
  // входа остаются зеркальными — расхождение здесь стоило бы часов поиска.
  renderToString(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );

/** Готовая разметка страницы по адресу — для страниц без данных (главная). */
export function renderAppPage(pathname = "/") {
  setServerLocation(pathname);
  globalThis.window.__boot = undefined;
  return render();
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

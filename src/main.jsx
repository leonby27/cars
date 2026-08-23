import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { installRussianTypography } from "./typography.js";
import "./styles.css";
import "./order-contact.css";
import "./analytics.css";

const root = document.getElementById("root");
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

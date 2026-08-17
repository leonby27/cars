import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";
import "./order-contact.css";
import "./analytics.css";

const root = document.getElementById("root");
// Build-time SEO pages contain meaningful HTML for crawlers and no-JS clients.
// The interactive application takes over once its bundle is ready.
if (root.hasChildNodes()) root.replaceChildren();

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

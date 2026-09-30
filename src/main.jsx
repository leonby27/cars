import "./storage-guard.js";
import "./styles.css";
import "./order-contact.css";

// The server has already rendered this page. Keep React and route code out of
// the initial module so downloading/parsing them cannot hold up its first paint.
const root = document.getElementById("root");
const loadApp = () => import("./app-entry.jsx");
if (root?.dataset.prerender && !document.documentElement.classList.contains("foreign-boot") && document.visibilityState !== "hidden") {
  requestAnimationFrame(() => setTimeout(loadApp, 0));
} else loadApp();

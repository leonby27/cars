// Direct visits preload their route before hydration; home loads only shared controls.
import { createElement, lazy, Suspense } from "react";
let pages;
let pending;
export const primeSecondaryPages = (value) => { pages = value; };
export const loadSecondaryPages = () => pending ||= import("./secondary-pages.jsx").then(value => (pages = value));
export const usesSecondaryPage = (path) => /^(?:\/how-it-works|\/contacts|\/models|\/customs|\/delivery-cost|\/ev-quota|\/range|\/price-belarus|\/china-brands|\/blog(?:\/[^/]+)?|\/catalog(?:\/.*)?|\/cars\/[^/]+|\/orders\/draft\/[^/]+|\/account|\/searches|\/favorites)$/.test(path);
export function secondaryPage(name) {
  const Deferred = lazy(() => loadSecondaryPages().then(value => ({ default: value[name] })));
  return function SecondaryPage(props) {
    if (pages) return createElement(pages[name], props);
    return createElement(Suspense, { fallback: createElement("div", { role: "status", className: "simple-page page-width", "aria-busy": true }, "Загружаем страницу…") }, createElement(Deferred, props));
  };
}

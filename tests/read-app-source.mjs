import { readFileSync } from "node:fs";
// UI source contracts span the shared shell and the deferred route components.
export const readAppSource = () => ["App.jsx", "secondary-pages.jsx"].map(file => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).join("\n");

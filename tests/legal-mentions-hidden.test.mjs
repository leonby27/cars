import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createSeoRenderer } from "../server/seo-render.mjs";

const appSource = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const companySource = fs.readFileSync(new URL("../src/company-data.js", import.meta.url), "utf8");

test("contact requisites stay hidden while footer keeps document links", () => {
  const seoFooter = createSeoRenderer({ shell: "", siteUrl: "https://abcars.by" }).footer();

  assert.doesNotMatch(appSource, /className="company-details-section"/);
  assert.match(appSource, /<div className="page-width footer-bottom">\s*<span>© 2026<\/span>\s*<div>/u);
  assert.match(seoFooter, /Политика конфиденциальности/u);
  assert.match(seoFooter, /Условия использования/u);
  assert.doesNotMatch(seoFooter, /\u041e\u041e\u041e/u);
  assert.match(seoFooter, /<div class="page-width footer-bottom"><span>© 2026<\/span><div>/u);
  assert.doesNotMatch(companySource, /legalName|\bbank\b|\bbic\b/u);
});

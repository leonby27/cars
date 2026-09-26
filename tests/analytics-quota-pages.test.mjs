import test from "node:test";
import assert from "node:assert/strict";
import { isQuotaLandingPath, quotaVisitSplit } from "../src/analytics-quota-pages.js";

test("страницы квоты: раздел и статьи журнала, с меткой и без", () => {
  for (const path of ["/ev-quota", "/ev-quota/", "/ev-quota?ysclid=abc", "/blog/ev-quota-2027", "/blog/ev-quota-extra-2026?utm_source=chatgpt.com", "/blog/ev-quota-end#faq"]) {
    assert.equal(isQuotaLandingPath(path), true, path);
  }
  for (const path of ["/", "", "/catalog/bmw/x1", "/cars/59447119", "/blog/suv-under-20000", "/blog/five-years-vat", "/ev-quotas-like", "/catalog?q=quota"]) {
    assert.equal(isQuotaLandingPath(path), false, path);
  }
});

test("полоска делит заходы на целевые и квоту", () => {
  const visits = ["/", "/blog/ev-quota-2027", "/cars/1", "/ev-quota", "/blog/ev-quota-2027"].map((landingPath) => ({ landingPath }));
  assert.deepEqual(quotaVisitSplit(visits), { target:2, quota:3, total:5 });
  assert.deepEqual(quotaVisitSplit([]), { target:0, quota:0, total:0 });
});

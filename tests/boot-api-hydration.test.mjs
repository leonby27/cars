import test from "node:test";
import assert from "node:assert/strict";
import { initialApiValue } from "../src/boot-api.js";
import { catalogMetaBoot } from "../server/app-render.mjs";

test("catalog, brand and model hydration keep filter counts despite a newer preload", () => {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const snapshot = { brands: [{ brand: "Zeekr", count: 1019 }], models: [{ model: "001", count: 450 }] };
  const fresh = { brands: [{ brand: "Zeekr", count: 1020 }], models: [{ model: "001", count: 451 }] };
  try {
    for (const [path, query] of [["/catalog", ""], ["/catalog/zeekr", "brand=Zeekr"], ["/catalog/zeekr/001", "brand=Zeekr"]]) {
      globalThis.window = { __boot: catalogMetaBoot(new URLSearchParams(query), snapshot) };
      globalThis.document = { getElementById: () => ({ dataset: { prerender: path } }) };
      window.__boot.metaValue = fresh;
      assert.equal(initialApiValue(`/api/catalog/meta${query ? `?${query}` : ""}`, fresh), snapshot, path);
    }
  } finally {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  }
});

test("hydration retains server counts when the preload finishes first", () => {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  const snapshot = { brands: [{ brand: "Audi", count: 7595 }] };
  const fresh = { brands: [{ brand: "Audi", count: 7602 }] };
  try {
    globalThis.window = { __boot: { api: { "/api/catalog/meta": snapshot } } };
    globalThis.document = { getElementById: () => ({ dataset: { prerender: "/" } }) };
    assert.equal(initialApiValue("/api/catalog/meta", fresh), snapshot);
    delete window.__boot.api;
    assert.equal(initialApiValue("/api/catalog/meta", fresh), undefined, "fallback SSR must also keep its empty initial state");
    globalThis.document = { getElementById: () => ({ dataset: {} }) };
    assert.equal(initialApiValue("/api/catalog/meta", fresh), fresh, "client rendering may use the preload");
  } finally {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { initialApiValue } from "../src/boot-api.js";

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

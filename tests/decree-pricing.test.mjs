import test from "node:test";
import assert from "node:assert/strict";
import { readDecreePricing, rememberDecreePricing } from "../src/decree-pricing.js";

test("указ выключен по умолчанию, выбор сохраняется, недоступное хранилище не мешает", () => {
  const original = globalThis.window;
  try {
    delete globalThis.window;
    assert.equal(readDecreePricing(), false);
    const storage = new Map();
    globalThis.window = { localStorage:{ getItem:key => storage.get(key), setItem:(key, value) => storage.set(key, value) } };
    assert.equal(readDecreePricing(), false);
    rememberDecreePricing(true);
    assert.equal(readDecreePricing(), true);
    rememberDecreePricing(false);
    assert.equal(readDecreePricing(), false);
    globalThis.window = { get localStorage() { throw new Error("Storage blocked"); } };
    assert.equal(readDecreePricing(), false);
    assert.doesNotThrow(() => rememberDecreePricing(true));
  } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { postHumanConfirm } from "../src/analytics.js";

test("confirmation retries a recording race, but stops when the server excludes a visit", async () => {
  const savedFetch = globalThis.fetch, savedWindow = globalThis.window;
  const timers = [];
  try {
    globalThis.window = { setTimeout: (...args) => timers.push(args) };
    globalThis.fetch = async () => ({ json: async () => ({ confirmed: 0, retry: false }) });
    await postHumanConfirm({ visitorId: "test" });
    assert.equal(timers.length, 0);
    globalThis.fetch = async () => ({ json: async () => ({ confirmed: 0 }) });
    await postHumanConfirm({ visitorId: "test" });
    assert.equal(timers.length, 1);
    assert.equal(timers[0][1], 1500);
    timers.length = 0;
    await postHumanConfirm({ visitorId: "test" }, 4);
    assert.equal(timers.length, 0);
  } finally { globalThis.fetch = savedFetch; globalThis.window = savedWindow; }
});

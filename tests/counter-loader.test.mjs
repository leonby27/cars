import test from "node:test";
import assert from "node:assert/strict";
import { createCounterQueue } from "../src/counter-loader.js";

test("counters wait for hydration and never download together", async () => {
  const idle = [], started = [];
  let finish;
  const queue = createCounterQueue({ idle: fn => idle.push(fn) });
  queue.push(() => { started.push("first"); return new Promise(resolve => { finish = resolve; }); });
  queue.push(() => started.push("second"));
  assert.equal(idle.length, 0);
  queue.ready();
  const first = idle.shift()();
  assert.deepEqual(started, ["first"]);
  assert.equal(idle.length, 0);
  finish();
  await first;
  await idle.shift()();
  assert.deepEqual(started, ["first", "second"]);
});

test("leaving a page flushes pending page views once", async () => {
  const idle = [], started = [];
  const queue = createCounterQueue({ idle: fn => idle.push(fn) });
  queue.push(() => started.push("first"));
  queue.push(() => started.push("second"));
  queue.ready();
  queue.flush();
  await Promise.resolve();
  await idle.shift()();
  assert.deepEqual(started, ["first", "second"]);
});

test("a pending counter cannot start after entering analytics", async () => {
  const idle = [];
  let allowed = true, started = false;
  const queue = createCounterQueue({ idle: fn => idle.push(fn), allowed: () => allowed });
  queue.push(() => { started = true; });
  queue.ready();
  allowed = false;
  await idle.shift()();
  queue.flush();
  await Promise.resolve();
  assert.equal(started, false);
});

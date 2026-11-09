import assert from "node:assert/strict";
import test from "node:test";
import { originCapacity } from "../server/origin-capacity.mjs";

test("origin capacity hands off slots, rejects a full queue and drops expired waits", async () => {
  const gate = originCapacity(2, 1, 30);
  const first = gate.acquire();
  const second = gate.acquire();
  const queued = gate.acquire();
  assert.equal(gate.acquire(), null);
  first();
  const next = await queued;
  assert.equal(typeof next, "function");
  assert.equal(await gate.acquire(), null);
  second();
  next();
  const free = gate.acquire();
  const another = gate.acquire();
  assert.equal(typeof free, "function");
  assert.equal(typeof another, "function");
  free();
  another();
});

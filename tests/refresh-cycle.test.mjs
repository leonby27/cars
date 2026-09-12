import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  resumeRefreshCycle, readCheckLimit, oldestChecksFirst,
  checkPendingListings, finishRefreshCycle,
} from "../scripts/lib/refresh-cycle.mjs";

const at = "2026-09-12T10:00:00.000Z";
const fixture = (id, checked = "2026-08-26T01:42:41.481Z") => ({
  id: `che168-${id}`, external_id: String(id), last_checked_at: checked,
});
const alive = async () => ({ verdict: "alive", price: 15000 });

test("default pass checks more than 150 cards, including previously rechecked stale cars", async () => {
  const rows = Array.from({ length: 2301 }, (_, i) => fixture(i));
  const persisted = [];
  const result = await checkPendingListings(rows, {
    check: alive, persist: async (row) => persisted.push(row.id),
  });
  assert.equal(result.attempted, 2301);
  assert.equal(result.verified.size, 2301);
  assert.equal(new Set(persisted).size, 2301);
  assert.equal(result.skipped, 0);
});

test("old dates and null checks precede newly imported cards", () => {
  const rows = [fixture("fresh", at), fixture("58695986", "2026-08-31T21:59:34.660Z"),
    fixture("59158486"), fixture("never", null)];
  assert.deepEqual(oldestChecksFirst(rows).map((row) => row.external_id),
    ["never", "59158486", "58695986", "fresh"]);
  assert.equal(rows[0].external_id, "fresh", "sorting must not mutate the input");
});

test("unknown responses remain pending; sold and alive results persist before the next request", async () => {
  const rows = [fixture(1), fixture(2), fixture(3), fixture(4)];
  const events = [];
  const result = await checkPendingListings(rows, {
    check: async (id) => {
      events.push(`check:${id}`);
      return id === "1" ? { verdict: "sold" } : id === "2" ? { verdict: "unknown" }
        : id === "4" ? { verdict: "alive", price: null } : alive();
    },
    persist: async (row) => events.push(`save:${row.external_id}`),
    afterAttempt: async () => events.push("pause"),
  });
  assert.deepEqual(events, ["check:1", "save:1", "pause", "check:2", "pause",
    "check:3", "save:3", "pause", "check:4", "pause"]);
  assert.equal(result.unknown, 2);
  assert.equal(result.sold, 1);
  assert.deepEqual([...result.verified], ["che168-1", "che168-3"]);
});

test("interrupt and resume do not repeat successful checks or lose the unfinished tail", async () => {
  const cursor = resumeRefreshCycle(null, at);
  const rows = [fixture(1), fixture(2), fixture(3)];
  let stop = false;
  const calls = [];
  const first = await checkPendingListings(rows, {
    stopped: () => stop,
    check: async (id) => { calls.push(id); return alive(); },
    persist: async (row) => { row.last_checked_at = at; },
    afterAttempt: async () => { stop = true; },
  });
  assert.equal(first.skipped, 2);
  const saved = finishRefreshCycle(cursor, { remainingListings: 2, remainingBrands: 1, stopped: true });
  assert.equal(saved.complete, false);
  const resumed = resumeRefreshCycle(saved.cursor, "2026-09-13T10:00:00Z");
  assert.equal(resumed.startedAt, at);
  // Same predicate as the DB checkpoint: dates before the fixed cycle start.
  const pending = rows.filter((row) => row.last_checked_at < resumed.startedAt);
  const second = await checkPendingListings(pending, {
    check: async (id) => { calls.push(id); return alive(); },
    persist: async (row) => { row.last_checked_at = "2026-09-13T10:00:00Z"; },
  });
  assert.equal(second.verified.size, 2);
  assert.deepEqual(calls, ["1", "2", "3"]);
  const done = finishRefreshCycle(resumed, { remainingListings: 0, remainingBrands: 0 });
  assert.equal(done.complete, true);
  assert.equal(done.cursor.round, 2);
  assert.equal(done.cursor.startedAt, null);
});

test("a failed database write is not acknowledged and stops before the next card", async () => {
  const calls = [];
  await assert.rejects(checkPendingListings([fixture(1), fixture(2)], {
    check: async (id) => { calls.push(id); return alive(); },
    persist: async () => { throw new Error("database unavailable"); },
  }), /database unavailable/);
  assert.deepEqual(calls, ["1"]);
});

test("explicit short-run caps preserve unattempted cards, including zero", async () => {
  assert.equal(readCheckLimit(undefined), Infinity);
  assert.equal(readCheckLimit("0"), 0);
  for (const value of ["-1", "1.5", "NaN", "true", ""]) assert.throws(() => readCheckLimit(value));
  for (const limit of [0, 1, 2]) {
    const result = await checkPendingListings([fixture(1), fixture(2), fixture(3)], {
      limit, check: alive, persist: async () => {},
    });
    assert.equal(result.attempted, limit);
    assert.equal(result.skipped, 3 - limit);
  }
});

test("old brand-visited cursors cannot skip the first honest cycle", () => {
  const cursor = resumeRefreshCycle({ round: 4, brandsDone: ["Deepal", "Geely"],
    uncheckedBeforeByBrand: { Deepal: "2026-09-11T03:05:03.204Z" } }, at);
  assert.equal(cursor.round, 4);
  assert.deepEqual(cursor.brandsDone, []);
  assert.equal(cursor.startedAt, at);
});

test("visiting every brand cannot close a cycle with unchecked listings", () => {
  const cursor = resumeRefreshCycle(null, at);
  for (const counts of [
    { remainingListings: 9983, remainingBrands: 0 },
    { remainingListings: 0, remainingBrands: 1 },
    { remainingListings: 0, remainingBrands: 0, stopped: true },
  ]) {
    const result = finishRefreshCycle(cursor, counts);
    assert.equal(result.complete, false);
    assert.equal(result.cursor.round, 1);
    assert.equal(result.cursor.startedAt, at);
  }
});

test("production wiring persists the cycle before selecting rows and checks leftovers after an incomplete list", () => {
  const source = readFileSync(new URL("../scripts/refresh-che168.mjs", import.meta.url), "utf8");
  assert.ok(source.indexOf("await saveCursor(cursor)") < source.indexOf("const { rows } = await pool.query"));
  assert.match(source, /else missingHere.push\(row\)/);
  assert.match(source, /await checkPendingListings\(missingHere,/);
  assert.doesNotMatch(source, /if \(!skipDetail && ok/);
  assert.match(source, /remainingListings, remainingBrands, stopped/);
  assert.match(source, /await withTransaction/);
  assert.match(source, /if \(!ids.has\(brand\)\) ids.set/);
});

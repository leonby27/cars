import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { prioritizeBrandBacklog, updateBrandBacklog } from "../scripts/lib/refresh-backlog.mjs";

const refreshSource = readFileSync(new URL("../scripts/refresh-che168.mjs", import.meta.url), "utf8");

test("непроверенный хвост прошлой попытки получает первые места без увеличения очереди", () => {
  const rows = [
    { id:"fresh-a", last_checked_at:"2026-09-09T10:00:00Z" },
    { id:"pending-a", last_checked_at:"2026-09-01T10:00:00Z" },
    { id:"fresh-b", last_checked_at:"2026-09-08T10:00:00Z" },
    { id:"pending-b", last_checked_at:null },
  ];
  const queue = prioritizeBrandBacklog(rows, "2026-09-07T00:00:00Z");
  assert.deepEqual(queue.map((row) => row.id), ["pending-a", "pending-b", "fresh-a", "fresh-b"]);
  assert.equal(queue.length, rows.length, "приоритет не должен добавлять обращения");
});

test("без хвоста порядок старой очереди не меняется", () => {
  const rows = [{ id:"a" }, { id:"b" }];
  assert.deepEqual(prioritizeBrandBacklog(rows, null), rows);
});

test("хвост хранится отдельно по каждой марке и удаляется после закрытия", () => {
  const first = updateBrandBacklog({}, "Haval", "2026-09-07T00:00:00Z");
  const second = updateBrandBacklog(first, "Geely", "2026-09-08T00:00:00Z");
  const cleared = updateBrandBacklog(second, "Haval");
  assert.deepEqual(cleared, { Geely:"2026-09-08T00:00:00Z" });
});

test("боевой прогон использует хвост внутри прежнего лимита и сохраняет его между кругами", () => {
  assert.match(refreshSource, /prioritizeBrandBacklog\(missingHere, backlogCutoff\)\.slice\(0, detailPerBrand\)/);
  assert.match(refreshSource, /uncheckedBeforeByBrand: cursor\.uncheckedBeforeByBrand/);
});

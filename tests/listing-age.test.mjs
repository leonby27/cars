import test from "node:test";
import assert from "node:assert/strict";
import { formatListingAge, getSourceListedAt } from "../src/listing-age.js";

test("uses only the listing date supplied by the source", () => {
  assert.equal(getSourceListedAt({ sourceListedAt:"2026-08-01", firstSeenAt:"2026-08-12" }), "2026-08-01");
  assert.equal(getSourceListedAt({ firstSeenAt:"2026-08-12", priceHistory:[{ at:"2026-08-03" }] }), null);
});

test("formats elapsed days with Russian plural forms", () => {
  const now = new Date("2026-08-14T12:00:00Z");
  assert.equal(formatListingAge("2026-08-14T06:00:00Z", now), "В продаже меньше дня");
  assert.equal(formatListingAge("2026-08-13T12:00:00Z", now), "В продаже 1 день");
  assert.equal(formatListingAge("2026-08-12T12:00:00Z", now), "В продаже 2 дня");
  assert.equal(formatListingAge("2026-08-03T12:00:00Z", now), "В продаже 11 дней");
  assert.equal(formatListingAge("2026-07-23T12:00:00Z", now), "В продаже 22 дня");
});

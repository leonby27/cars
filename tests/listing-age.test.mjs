import test from "node:test";
import assert from "node:assert/strict";
import { formatListingAge, getSourceListedAt, isNewListing } from "../src/listing-age.js";

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

test("marks only recently added listings as new", () => {
  const now = new Date("2026-09-01T12:00:00Z").getTime();
  assert.equal(isNewListing({ firstSeenAt:"2026-08-30T12:00:00Z" }, now), true);
  assert.equal(isNewListing({ importedAt:"2026-08-28T12:00:00Z" }, now), true);
  assert.equal(isNewListing({ firstSeenAt:"2026-08-20T12:00:00Z" }, now), false);
  assert.equal(isNewListing({}, now), false);
  assert.equal(isNewListing({ firstSeenAt:"nonsense" }, now), false);
});

test("the first bulk import is never treated as new", () => {
  const now = new Date("2026-08-24T12:00:00Z").getTime();
  assert.equal(isNewListing({ firstSeenAt:"2026-08-17T21:00:00Z", importedAt:"2026-08-17T21:00:00Z" }, now), false);
  assert.equal(isNewListing({ firstSeenAt:"2026-08-24T09:00:00Z" }, now), true);
});


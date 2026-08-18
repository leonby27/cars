import test from "node:test";
import assert from "node:assert/strict";
import { formatRoundedListingCount } from "../src/catalog-count.js";

test("rounds the catalog total down to hundreds and appends a plus", () => {
  assert.equal(formatRoundedListingCount(3857), "3800+");
  assert.equal(formatRoundedListingCount(3000), "3000+");
  assert.equal(formatRoundedListingCount(99), "99+");
});

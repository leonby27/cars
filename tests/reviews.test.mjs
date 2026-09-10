import test from "node:test";
import assert from "node:assert/strict";
import { shippedFlag } from "../src/feature-flags.js";

test("approved reviews stay visible in production", () => {
  assert.equal(shippedFlag("REVIEWS_ENABLED"), true);
});

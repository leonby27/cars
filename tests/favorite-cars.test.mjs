import test from "node:test";
import assert from "node:assert/strict";
import { missingFavoriteIsExpired } from "../src/favorite-cars.js";

test("избранное удаляется только после 404 от основного каталога", () => {
  assert.equal(missingFavoriteIsExpired(true, 404), true);
  assert.equal(missingFavoriteIsExpired(false, 404), false);
  assert.equal(missingFavoriteIsExpired(null, 404), false);
  assert.equal(missingFavoriteIsExpired(true, 503), false);
});

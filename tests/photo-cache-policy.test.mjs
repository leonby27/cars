import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync(new URL("../deploy/nginx-abcars-photo-location.conf", import.meta.url), "utf8");

test("фото не закрепляются в браузере на год и сервер перепроверяет временный кэш", () => {
  assert.doesNotMatch(config, /\bimmutable\b/);
  assert.equal(config.match(/max-age=86400, stale-while-revalidate=604800/g)?.length, 2);
  assert.match(config, /proxy_cache_valid\s+200\s+1d;/);
});

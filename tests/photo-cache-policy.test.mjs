import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync(new URL("../deploy/nginx-abcars-photo-location.conf", import.meta.url), "utf8");

test("фото не закрепляются в браузере на год и сервер перепроверяет временный кэш", () => {
  assert.doesNotMatch(config, /\bimmutable\b/);
  // Две пары location (Che168 и Encar, 29.09.2026) — по два заголовка в каждой.
  assert.equal(config.match(/max-age=604800, stale-while-revalidate=86400/g)?.length, 4);
  assert.equal(config.match(/proxy_cache_valid\s+200\s+1d;/g)?.length, 2);
  assert.match(config, /proxy_cache_valid\s+200\s+1d;/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { vehiclePhotoHref } from "../src/photo-source.js";

const config = readFileSync(new URL("../deploy/nginx-abcars-photo-location.conf", import.meta.url), "utf8");

test("фото не закрепляются в браузере на год и сервер перепроверяет временный кэш", () => {
  assert.doesNotMatch(config, /\bimmutable\b/);
  // Две пары location (Che168 и Encar, 29.09.2026) — по два заголовка в каждой.
  assert.equal(config.match(/max-age=604800, stale-while-revalidate=86400/g)?.length, 4);
  assert.equal(config.match(/proxy_cache_valid\s+200\s+1d;/g)?.length, 2);
  assert.match(config, /proxy_cache_valid\s+200\s+1d;/);
});

test("Encar nginx accepts original mixed-case JPEG paths in every photo size", () => {
  const guards = [...config.matchAll(/if \(\$uri !~ "(\^\/photo\/encar\/[^"\n]+)"\)/g)]
    .map((match) => new RegExp(match[1]));
  assert.equal(guards.length, 2, "both stored-file and origin guards are checked");
  for (const extension of ["jpg", "JPG", "jpeg", "JPEG", "JpEg"]) {
    const source = `https://ci.encar.com/carpicture03/pic4253/42532514_001.${extension}`;
    for (const width of [600, 1200, 1920]) {
      const href = vehiclePhotoHref(source, width, { cacheVersion: "" });
      for (const guard of guards) assert.ok(guard.test(href), href);
      assert.ok(guards[0].test(href.replace("/v2/", "/")), "legacy paths stay supported");
    }
  }
  for (const guard of guards) {
    for (const invalid of ["/photo/encar/v2/w601/car.JPG", "/photo/encar/v2/w600/car.svg", "/photo/encar/v2/w600/car.JPG.exe", "/photo/encar/v2/w600/car.JPG?url=https://example.com"]) {
      assert.equal(guard.test(invalid), false, invalid);
    }
  }
});

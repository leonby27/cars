import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../dist/client/${relative}`, import.meta.url), "utf8");

test("build emits crawlable public pages while previews remain noindex", async () => {
  const [home, catalog, robots] = await Promise.all([read("index.html"), read("catalog/index.html"), read("robots.txt")]);
  assert.match(home, /<h1>Автомобили с пробегом из Китая/);
  assert.match(home, /<a href="\/cars\//);
  assert.match(catalog, /<link rel="canonical" href="https:\/\/evcars\.by\/catalog\/"/);
  assert.match(catalog, /<meta name="robots" content="noindex, nofollow, noarchive"/);
  assert.match(robots, /Disallow: \/$/m);
});

test("vehicle HTML has unique metadata, structured data and visible facts", async () => {
  const html = await read("cars/guazi-170268619192114/index.html");
  assert.match(html, /<title>BYD Song Pro 2024, 21[^<]*400 км — цена до Минска/);
  assert.match(html, /<link rel="canonical" href="https:\/\/evcars\.by\/cars\/guazi-170268619192114\/"/);
  assert.match(html, /"@type":"Vehicle"/);
  assert.match(html, /<h1>BYD Song Pro 2024<\/h1>/);
  assert.doesNotMatch(html, /1年10个月车龄/);
});

test("static fallback ships a compact catalog and addressable full records", async () => {
  const [catalog, car] = await Promise.all([read("data/catalog.json"), read("data/cars/guazi-170268619192114.json")]);
  const compact = JSON.parse(catalog);
  const detail = JSON.parse(car);
  assert.equal(compact.cars.length > 2500, true);
  assert.equal(compact.cars[0]._summary, true);
  assert.equal(compact.cars[0].description, undefined);
  assert.equal(Array.isArray(detail.images) && detail.images.length > 1, true);
});

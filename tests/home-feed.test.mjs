import test from "node:test";
import assert from "node:assert/strict";
import { selectHomeFeed, isHomePriority } from "../src/home-feed.js";
import { seededRandom } from "../src/car-variety.js";
import { CORE_MODELS } from "../src/social-priority-models.js";
import { CORE_MODELS as publicationModels } from "../scripts/lib/social-blocks.mjs";
import { homeMarketReferences } from "../server/home-feed.mjs";

const cars = Array.from({ length:120 }, (_, i) => ({
  id:String(i), brand:i < 40 ? "Zeekr" : `Other${i}`, model:i < 40 ? "001" : `Model${i}`,
  homeMarketSavingPercent:i >= 40 && i < 80 ? 12 : 0, estimatedTotalUsd:25000, bodyType:"SUV",
}));

test("home selection guarantees the priority share in desktop/mobile prefixes and append batches", () => {
  for (let seed = 0; seed < 100; seed++) {
    const selected = selectHomeFeed(cars, 60, { random:seededRandom(seed) });
    assert.equal(selected.slice(0, 10).filter(isHomePriority).length, 8);
    for (let start = 0; start < 60; start += 20) assert.equal(selected.slice(start, start + 20).filter(isHomePriority).length, 15);
    assert.equal(new Set(selected.map(car => car.id)).size, 60);
    const secondMobile = selectHomeFeed(cars, 10, { random:seededRandom(seed), offset:10 });
    assert.equal(secondMobile.filter(isHomePriority).length, 7);
  }
  assert.notDeepEqual(selectHomeFeed(cars, 20, { random:seededRandom(1) }), selectHomeFeed(cars, 20, { random:seededRandom(2) }));
});

test("social priority is the publication list, not every model from those brands", () => {
  assert.equal(CORE_MODELS, publicationModels);
  for (const model of CORE_MODELS) assert.equal(isHomePriority(model), true);
  assert.equal(isHomePriority({ brand:"BMW", model:"X6" }), false);
  assert.equal(isHomePriority({ brand:"Other", model:"A", homeMarketSavingPercent:1 }), true);
  assert.equal(isHomePriority({ brand:"Other", model:"A", homeMarketSavingPercent:0 }), false);
  assert.equal(isHomePriority({ brand:"Zeekr", model:"001", available:false }), false);
});

test("short/empty pools fill available slots without inventing priority or duplicating IDs", () => {
  assert.deepEqual(selectHomeFeed([], 20), []);
  const ordinary = cars.filter(car => !isHomePriority(car)).slice(0, 3);
  const selected = selectHomeFeed([...ordinary, ordinary[0], { ...cars[0], available:false }], 20);
  assert.equal(selected.length, 3);
  assert.equal(selected.filter(isHomePriority).length, 0);
  assert.equal(selectHomeFeed(cars.slice(0, 20), 20).filter(isHomePriority).length, 20);
});

const bucket = (count, median) => ({ count, median, mean:median, min:median });
const prices = (count = 2, median = 30000) => Object.fromEntries(["20000", "50000", "100000", "150000", "200000", "all"].map(key => [key, { ours:bucket(3, 35000), belarus:bucket(count, median) }]));
test("market references use sufficient exact samples then mileage/year fallback and keep powertrains separate", () => {
  const data = { cards:[{ brand:"Test", model:"A", type:"Гибрид", years:[{ year:2024, prices:prices() }, { year:2023, prices:prices(1, 50000) }] }] };
  const refs = homeMarketReferences(data);
  assert.equal(refs.length, 14);
  const exact = refs.find(row => row.year === 2024 && row.mileage_min === 0);
  assert.equal(exact.median, 30000); // Own model is dearer; the actual car can still be cheaper.
  assert.equal(exact.mileage_max, 20001);
  assert.equal(exact.type, "Гибрид");
  assert.equal(refs.find(row => row.year === 2023).median, 30000); // Weighted whole-model median.
  assert.ok(refs.some(row => row.mileage_min === null));
  assert.deepEqual(homeMarketReferences({ cards:[{ ...data.cards[0], longVersion:true }] }), []);
  assert.deepEqual(homeMarketReferences({ cards:[{ ...data.cards[0], years:[{ year:2024, prices:prices(1) }] }] }), []);
  assert.deepEqual(homeMarketReferences(null), []);
});

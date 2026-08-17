import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBodyType, normalizeSourceBodyType } from "../src/body-types.js";

test("normalizes body type from Guazi vehicle class", () => {
  assert.equal(normalizeSourceBodyType("中型SUV"), "SUV / кроссовер");
  assert.equal(normalizeSourceBodyType("紧凑型两厢车"), "Хэтчбек");
  assert.equal(normalizeSourceBodyType("中大型MPV"), "Минивэн");
});

test("uses the model dictionary when source body data is absent", () => {
  assert.equal(normalizeBodyType({ brand:"Li Auto", model:"L9" }), "SUV / кроссовер");
  assert.equal(normalizeBodyType({ brand:"Voyah", model:"岚图梦想家" }), "Минивэн");
  assert.equal(normalizeBodyType({ brand:"BYD", model:"Seagull" }), "Хэтчбек");
  assert.equal(normalizeBodyType({ brand:"Zeekr", model:"001" }), "Универсал");
});

test("normalizes English body types from global listings", () => {
  assert.equal(normalizeBodyType({ bodyStructure:"Sedan" }), "Седан");
  assert.equal(normalizeBodyType({ vehicleClass:"Hatchback" }), "Хэтчбек");
  assert.equal(normalizeBodyType({ bodyStructure:"Wagon" }), "Универсал");
  assert.equal(normalizeBodyType({ vehicleClass:"Mini Van" }), "Минивэн");
});

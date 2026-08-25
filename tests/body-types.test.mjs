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

test("купе, кабриолет и пикап — из бензинового каталога", () => {
  // У Mercedes-Benz и BMW это под тысячу машин, и до появления этих кузовов они
  // висели в каталоге как «не определён»: мимо фильтра и мимо разделов сайта.
  assert.equal(normalizeBodyType({ bodyStructure:"Hardtop Coupe" }), "Купе");
  assert.equal(normalizeBodyType({ bodyStructure:"Soft-top Convertible" }), "Кабриолет");
  assert.equal(normalizeBodyType({ bodyStructure:"Hardtop Convertible" }), "Кабриолет");
  assert.equal(normalizeBodyType({ bodyStructure:"Pickup Truck" }), "Пикап");
});

test("купе-кроссовер остаётся кроссовером", () => {
  // GLC Coupe и X6 покупатель ищет среди кроссоверов, а не среди купе, поэтому
  // проверка на кроссовер идёт раньше проверки на купе.
  assert.equal(normalizeBodyType({ bodyStructure:"SUV Coupe" }), "SUV / кроссовер");
  assert.equal(normalizeBodyType({ bodyStructure:"Crossover Coupe" }), "SUV / кроссовер");
  assert.equal(normalizeBodyType({ bodyStructure:"Hardtop Coupe" }), "Купе");
});

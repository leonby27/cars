import test from "node:test";
import assert from "node:assert/strict";
import { engineBounds, engineLabel, enginePower, engineVolume, fuelType, gearboxType, matchesEngineBounds, matchesPowerBounds, powerBounds, powerLabel } from "../src/engine-spec.js";

test("объём мотора берётся из строки источника", () => {
  assert.equal(engineVolume({ engine:"1.4T 150HP L4" }), 1.4);
  assert.equal(engineVolume({ engine:"2.0T 258hp L4" }), 2);
  assert.equal(engineVolume({ engine:"1.5L 113hp L4" }), 1.5);
  assert.equal(engineVolume({ engine:"4.0T 585HP V8" }), 4);
});

test("у машины с генератором объёма нет — там записана мощность", () => {
  assert.equal(engineVolume({ engine:"Range Extender 160 Horsepower" }), null);
  assert.equal(engineVolume({ engine:"" }), null);
  assert.equal(engineVolume({}), null);
});

test("мощность читается в любом написании", () => {
  assert.equal(enginePower({ engine:"1.4T 150HP L4" }), 150);
  assert.equal(enginePower({ engine:"1.3T 163 HP L4" }), 163);
  assert.equal(enginePower({ engine:"2.5T 367-horsepower L6" }), 367);
  assert.equal(enginePower({ engine:"Range Extender 160 Horsepower" }), 160);
  assert.equal(enginePower({ engine:"" }), null);
});

test("описание коробки сводится к одному привычному слову", () => {
  assert.equal(gearboxType({ transmission:"9-speed automatic transmission" }), "Автомат");
  assert.equal(gearboxType({ transmission:"8-speed automatic with manual shift mode" }), "Автомат");
  assert.equal(gearboxType({ transmission:"6-speed manual/automatic transmission" }), "Автомат");
  assert.equal(gearboxType({ transmission:"AT" }), "Автомат");
  assert.equal(gearboxType({ transmission:"7-speed wet dual-clutch" }), "Робот");
  assert.equal(gearboxType({ transmission:"E-CVT Continuously Variable Transmission" }), "Вариатор");
  assert.equal(gearboxType({ transmission:"5-speed manual" }), "Механика");
  // У электромобиля коробки в привычном смысле нет — фильтр её и не показывает.
  assert.equal(gearboxType({ transmission:"Electric vehicle single-speed transmission" }), "");
  assert.equal(gearboxType({}), "");
});

test("топливо читается из подписи источника", () => {
  assert.equal(fuelType({ sourceFuelType:"Gasoline" }), "Бензин");
  // Лёгкий гибрид 48 В — бензиновая машина, заряжать её нельзя.
  assert.equal(fuelType({ sourceFuelType:"Gasoline + 48V Mild Hybrid System" }), "Бензин");
  assert.equal(fuelType({ sourceFuelType:"Diesel" }), "Дизель");
  // У электромобиля и гибрида топлива нет — там всё сказано типом машины.
  assert.equal(fuelType({ sourceFuelType:"Pure Electric" }), "");
  assert.equal(fuelType({ sourceFuelType:"Plug-in Hybrid" }), "");
  assert.equal(fuelType({}), "");
});

test("подписи объёма и мощности читаются обратно", () => {
  assert.equal(engineLabel(1.4, 1.4), "1.4 л");
  assert.equal(engineLabel(1.6, 2), "от 1.6 до 2 л");
  assert.equal(engineLabel(2, null), "от 2 л");
  assert.equal(engineLabel(null, 1.6), "до 1.6 л");
  assert.equal(engineLabel(null, null), "");
  assert.deepEqual(engineBounds("1.4 л"), { min:1.4, max:1.4 });
  assert.deepEqual(engineBounds("от 1.6 до 2 л"), { min:1.6, max:2 });
  assert.deepEqual(engineBounds("от 2 до 3 л"), { min:2, max:3 });
  assert.deepEqual(engineBounds("до 1.6 л"), { min:null, max:1.6 });
  assert.equal(engineBounds("Объём двигателя"), null);
  assert.equal(powerLabel(150, null), "от 150 л.с.");
  assert.deepEqual(powerBounds("от 150 л.с."), { min:150, max:null });
  assert.deepEqual(powerBounds("от 150 до 250 л.с."), { min:150, max:250 });
  assert.equal(powerBounds("Мощность"), null);
});

test("машину без известного мотора фильтр отсеивает, а не пропускает", () => {
  const electric = { engine:"" };
  const petrol = { engine:"1.4T 150HP L4" };
  assert.equal(matchesEngineBounds(electric, { min:1.4, max:null }), false);
  assert.equal(matchesEngineBounds(petrol, { min:1.4, max:1.4 }), true);
  assert.equal(matchesEngineBounds(petrol, { min:2, max:null }), false);
  assert.equal(matchesPowerBounds(electric, { min:150, max:null }), false);
  assert.equal(matchesPowerBounds(petrol, { min:150, max:null }), true);
  // Фильтр не выбран — проходят все.
  assert.equal(matchesEngineBounds(electric, null), true);
  assert.equal(matchesPowerBounds(electric, null), true);
});

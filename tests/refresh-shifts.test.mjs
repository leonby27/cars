import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  PETROL_SHIFTS,
  SHIFT_ORDER,
  fallbackPetrolShift,
  feedsForShift,
  petrolBuckets,
  petrolShiftByBrand,
  shiftForDate,
  shiftOfCar,
} from "../scripts/lib/refresh-shifts.mjs";

const brandMap = JSON.parse(readFileSync(new URL("../config/che168-brands-1.json", import.meta.url), "utf8"));

test("очередь смен идёт ровным кругом и не зависит от пропущенных ночей", () => {
  const days = Array.from({ length: 9 }, (_, index) => shiftForDate(new Date(Date.UTC(2026, 7, 31 + index))));
  assert.deepEqual(days.slice(0, 4), SHIFT_ORDER);
  assert.deepEqual(days.slice(4, 8), SHIFT_ORDER, "через четыре ночи круг повторяется");
  // Одна и та же дата всегда даёт ту же смену, сколько ни спрашивай.
  assert.equal(shiftForDate(new Date(Date.UTC(2026, 8, 14))), shiftForDate(new Date(Date.UTC(2026, 8, 14))));
});

test("смена задаёт фиды: электрическая ночь не листает бензин и наоборот", () => {
  assert.deepEqual(feedsForShift("ev"), [7, 5, 6]);
  for (const shift of PETROL_SHIFTS) assert.deepEqual(feedsForShift(shift), [1]);
});

test("бензиновые марки разложены по трём ночам примерно поровну", () => {
  const { load } = petrolBuckets(brandMap);
  const counts = [...load.values()];
  const spread = (Math.max(...counts) - Math.min(...counts)) / Math.max(...counts);
  assert.ok(spread < 0.05, `ночи разошлись на ${Math.round(spread * 100)}% — раскладка перекошена`);
});

test("каждая марка попадает ровно в одну ночь, и всегда в ту же самую", () => {
  const first = petrolBuckets(brandMap).byBrandName;
  const second = petrolBuckets(brandMap).byBrandName;
  assert.equal(first.size, Object.keys(brandMap.brands).length);
  for (const [name, shift] of first) {
    assert.ok(PETROL_SHIFTS.includes(shift));
    assert.equal(second.get(name), shift, `${name} перепрыгнула в другую ночь`);
  }
});

test("машина находит свою смену по типу и марке", () => {
  const { byCanonical } = petrolShiftByBrand(brandMap);
  assert.equal(shiftOfCar({ type: "Электромобиль", brand: "Xiaomi" }, byCanonical), "ev");
  assert.equal(shiftOfCar({ type: "Гибрид", brand: "Li Auto" }, byCanonical), "ev");
  const vw = shiftOfCar({ type: "ДВС", brand: "Volkswagen" }, byCanonical);
  assert.ok(PETROL_SHIFTS.includes(vw));
  assert.equal(shiftOfCar({ type: "ДВС", brand: "Volkswagen" }, byCanonical), vw, "марка не должна кочевать между ночами");
});

test("неизвестный тип проверяется в любую ночь, а не теряется", () => {
  const { byCanonical } = petrolShiftByBrand(brandMap);
  assert.equal(shiftOfCar({ type: undefined, brand: "Что-то" }, byCanonical), null);
});

test("марка не из переписи всё равно получает одну постоянную ночь", () => {
  const shift = fallbackPetrolShift("Совершенно Новая Марка");
  assert.ok(PETROL_SHIFTS.includes(shift));
  assert.equal(fallbackPetrolShift("Совершенно Новая Марка"), shift);
});

test("каждая машина каталога достаётся ровно одной смене", () => {
  const { byCanonical } = petrolShiftByBrand(brandMap);
  // Ради этого свойства смены и заведены: если машина не попадает ни в одну
  // ночь, она никогда не проверяется; если попадает в несколько — источник
  // получает лишние обращения.
  const catalog = [
    { type: "Электромобиль", brand: "Tesla" },
    { type: "Гибрид", brand: "BYD" },
    { type: "ДВС", brand: "Volkswagen" },
    { type: "ДВС", brand: "Mercedes-Benz" },
    { type: "ДВС", brand: "Audi" },
    { type: "ДВС", brand: "Марка-которой-нет" },
  ];
  for (const car of catalog) {
    const own = shiftOfCar(car, byCanonical);
    const nights = SHIFT_ORDER.filter((shift) => own === null || own === shift);
    assert.equal(nights.length, 1, `${car.brand} проверяется в ${nights.length} ночей вместо одной`);
  }
});

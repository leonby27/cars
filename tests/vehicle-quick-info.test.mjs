import test from "node:test";
import assert from "node:assert/strict";
import { buildVehicleQuickInfo, buildVehicleQuickFacts } from "../src/vehicle-quick-info.js";

test("расход энергии сохраняет приоритет разгона и топлива", () => {
  const car = {
    year:2024, mileage:49400, type:"Электромобиль", electricRange:688,
    drive:"Полный", battery:78.4, horsepower:450, seats:5,
    technicalSpecs:{ groups:[{ items:[{ name:"Power Consumption (kWh/100km)", value:"13" }] }] },
  };
  const facts = buildVehicleQuickFacts(car);
  assert.equal(facts.length, 8);
  assert.deepEqual(facts.at(-1), { label:"Расход энергии", value:"13 кВт·ч" });
  assert.deepEqual(buildVehicleQuickFacts({ ...car, acceleration:4.5 }).at(-1), { label:"Разгон до 100 км/ч", value:"4,5 с" });
  car.technicalSpecs.groups[0].items.push({ name:"Расход смешанный", value:"11.1-11.2 л/100 км" });
  assert.deepEqual(buildVehicleQuickFacts(car).at(-1), { label:"Расход топлива", value:"11,1 л" });
});

test("расход энергии различает единицы, диапазоны и отсутствующие данные", () => {
  for (const name of ["Расход энергии (WLTP)", "Combined electricity consumption (kWh/100km)", "Расход энергии смешанный"]) {
    const car = { type:"Электромобиль", seats:5, technicalSpecs:{ groups:[{ items:[{ name, value:"15,2–13,1 кВт·ч/100 км" }] }] } };
    assert.deepEqual(buildVehicleQuickFacts(car).at(-1), { label:"Расход энергии", value:"13,1 кВт·ч" });
    for (const value of [null, "— кВт·ч/100 км", "0 кВт·ч/100 км"]) {
      car.technicalSpecs.groups[0].items[0].value = value;
      assert.equal(buildVehicleQuickFacts(car).some(({ label }) => label === "Мест"), false);
    }
  }
  const car = { seats:5, technicalSpecs:{ groups:[{ items:[
    { name:"Comprehensive fuel and electricity consumption (L/100km)", value:"2.1" },
    { name:"Battery capacity (kWh)", value:"78.4" },
    { name:"Power Consumption (kWh/100km)", value:"—" },
    { name:"Measured average electricity consumption (kWh/100km)", value:"14.2" },
  ] }] } };
  assert.deepEqual(buildVehicleQuickFacts(car).at(-1), { label:"Расход энергии", value:"14,2 кВт·ч" });
});

test("builds a compact comma-separated vehicle summary from available facts", () => {
  assert.equal(
    buildVehicleQuickInfo({
      year:2025,
      mileage:11500,
      type:"Электромобиль",
      electricRange:650,
      combinedRange:1000,
      drive:"Полный",
      battery:94.5,
      horsepower:568,
    }).join(", "),
    "2025 г., пробег 11 500 км, электро, запас хода 650 км, 1 000 км, полный привод, батарея 94,5 кВт·ч, 568 сил",
  );
});

test("omits unavailable quick facts instead of inventing values", () => {
  assert.equal(
    buildVehicleQuickInfo({ year:2024, type:"Гибрид", range:220, bodyType:"SUV / кроссовер", drive:"Передний" }).join(", "),
    "2024 г., гибрид, запас хода 220 км, передний привод",
  );
});

test("объём мотора идёт рядом с топливом у бензиновых и гибридов", () => {
  assert.equal(
    buildVehicleQuickInfo({ year:2023, mileage:62300, type:"ДВС", engine:"2.0T 184HP L4", drive:"Полный" }).join(", "),
    "2023 г., пробег 62 300 км, бензин 2.0 л, полный привод",
  );
  assert.equal(
    buildVehicleQuickInfo({ year:2024, type:"Гибрид", engine:"1.5T 144HP L3", drive:"Передний" }).join(", "),
    "2024 г., гибрид 1.5 л, передний привод",
  );
});

test("без объёма остаётся одно слово, у электромобиля объёма не бывает", () => {
  // Гибрид с генератором: источник пишет в строке мотора мощность, объёма там нет.
  assert.equal(
    buildVehicleQuickInfo({ year:2025, type:"Гибрид", engine:"Range Extender 160 Horsepower" }).join(", "),
    "2025 г., гибрид",
  );
  assert.equal(buildVehicleQuickInfo({ type:"ДВС" }).join(", "), "бензин");
  assert.equal(
    buildVehicleQuickInfo({ year:2025, type:"Электромобиль", engine:"2.0T 184HP L4", battery:94.5 }).join(", "),
    "2025 г., электро, батарея 94,5 кВт·ч",
  );
});

test("пары «название — значение» для карточки автомобиля", async () => {
  const { buildVehicleQuickFacts } = await import("../src/vehicle-quick-info.js");
  assert.deepEqual(
    buildVehicleQuickFacts({ year:2024, mileage:20000, type:"ДВС", engine:"2.0T 184HP L4", drive:"Передний", acceleration:8.7 }),
    [
      { label:"Год выпуска", value:"2024" },
      { label:"Пробег", value:"20\u00a0000 км" },
      { label:"Двигатель", value:"Бензин 2.0 л" },
      { label:"Привод", value:"Передний" },
      { label:"Разгон до 100 км/ч", value:"8,7 с" },
    ],
  );
  assert.deepEqual(
    buildVehicleQuickFacts({ type:"Электромобиль", electricRange:650, combinedRange:1000, drive:"AWD", battery:94.5, horsepower:568 }).map(({ value }) => value),
    ["Электро", "650 км / 1\u00a0000 км", "Полный", "94,5 кВт·ч", "568 л. с."],
  );
});

test("дополняет короткий список известными характеристиками, но не превышает восемь", async () => {
  const { buildVehicleQuickFacts } = await import("../src/vehicle-quick-info.js");
  assert.deepEqual(
    buildVehicleQuickFacts({
      year:2024, mileage:110010, type:"ДВС", engine:"3.5L", drive:"Передний",
      bodyType:"Минивэн", bodyColor:"Black", transmission:"Automatic", owners:1, seats:9,
      dimensions:"5218×1998×1800",
    }),
    [
      { label:"Год выпуска", value:"2024" },
      { label:"Пробег", value:"110\u00a0010 км" },
      { label:"Двигатель", value:"Бензин 3.5 л" },
      { label:"Привод", value:"Передний" },
      { label:"Кузов", value:"Минивэн" },
      { label:"Цвет", value:"Чёрный" },
      { label:"Коробка", value:"Автомат" },
      { label:"Длина", value:"5 218 мм" },
    ],
  );
  const full = buildVehicleQuickFacts({
    year:2025, mileage:4300, type:"Электромобиль", electricRange:705,
    drive:"Полный", battery:100, horsepower:789, acceleration:3.3,
    bodyType:"Лифтбек", bodyColor:"White",
  });
  assert.equal(full.length, 8);
  assert.equal(full.at(-1).label, "Разгон до 100 км/ч");
  assert.equal(buildVehicleQuickFacts({
    year:2024, mileage:110010, type:"ДВС", drive:"Передний",
    bodyType:"Минивэн", bodyColor:"Black", transmission:"Automatic",
    seats:9, acceleration:8.4,
  }).at(-1).label, "Разгон до 100 км/ч");
});

test("короткая карточка не подменяет последний факт при загрузке полных характеристик", () => {
  const car = {
    year:2021, mileage:18300, type:"ДВС", drive:"Передний", horsepower:149.6,
    bodyType:"SUV / кроссовер", bodyColor:"White", transmission:"Automatic",
    dimensions:"4560×1860×1720", seats:5,
  };
  const summary = buildVehicleQuickFacts({ ...car, _summary:true });
  assert.equal(summary.length, 7);
  assert.equal(summary.some(({ label }) => label === "Длина" || label === "Мест"), false);
  assert.deepEqual(buildVehicleQuickFacts(car).at(-1), { label:"Длина", value:"4 560 мм" });
  const detailed = buildVehicleQuickFacts({ ...car, technicalSpecs:{ groups:[{ items:[
    { name:"Расход смешанный", value:"7,4 л/100 км" },
  ] }] } });
  assert.deepEqual(detailed.slice(0, 7), summary);
  assert.deepEqual(detailed.at(-1), { label:"Расход топлива", value:"7,4 л" });
  assert.deepEqual(buildVehicleQuickFacts({ ...car, _summary:true, acceleration:9.3 }).at(-1), { label:"Разгон до 100 км/ч", value:"9,3 с" });
  assert.equal(buildVehicleQuickFacts({ ...car, dimensions:"нет данных" }).some(({ label }) => label === "Длина"), false);
});

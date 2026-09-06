import test from "node:test";
import assert from "node:assert/strict";
import { deriveChe168SpecFields, specsFromTechnicalSpecs } from "../scripts/lib/che168-parser.mjs";
import { engineVolume, enginePower, fuelType, gearboxType } from "../src/engine-spec.js";

// Названия взяты буква в букву из карточек, которые источник отдал 06.09.2026 на
// русской версии сайта: там и запятые вместо точек в «(л,с,)», и строчные буквы
// в начале строки. Пока разбор знал только английские названия, у 6 202 машин
// характеристики были пусты, а пошлину бензиновым считали по выдуманным 1,5 л.
const russianSpecs = specsFromTechnicalSpecs({
  groups: [{
    name: "Основные параметры",
    items: [
      { name: "Тип топлива", value: "Электромобиль" },
      { name: "Энергия батареи (кВт·ч)", value: "66.7" },
      { name: "запас хода на электротяге по CLTC (км)", value: "560" },
      { name: "Электродвигатель (л,с,)", value: "272" },
      { name: "Официальное ускорение 0-100 км/ч (с)", value: "5.8" },
      { name: "Максимальный крутящий момент (Н·м)", value: "343" },
      { name: "спецификация передней шины", value: "215/55 R17" },
      { name: "Тип привода", value: "Задний привод" },
      { name: "Тип кузова", value: "Седан" },
      { name: "Количество мест (шт)", value: "5" },
      { name: "Двигатель", value: "2.0L 178 л.с. L4" },
    ],
  }],
});

test("характеристики читаются с русской версии источника", () => {
  const fields = deriveChe168SpecFields(russianSpecs);
  assert.equal(fields.battery, 66.7);
  assert.equal(fields.electricRange, 560);
  assert.equal(fields.horsepower, 272);
  assert.equal(fields.acceleration, 5.8);
  assert.equal(fields.torqueNm, 343);
  assert.equal(fields.tireSizeFront, "215/55 R17");
  assert.equal(fields.tireRim, 17);
  assert.equal(fields.driveRaw, "Задний привод");
  assert.equal(fields.bodyStructure, "Седан");
  assert.equal(fields.seats, 5);
  assert.equal(fields.engine, "2.0L 178 л.с. L4");
});

// Одно и то же поле источник пишет и «94.3», и «73,6» — в одной и той же выдаче.
// Пока запятая просто выбрасывалась, батарея на 73,6 кВт·ч становилась 736 кВт·ч:
// такая машина вылетала бы во все фильтры «больше 100 кВт·ч» и выглядела бы в
// карточке вздором.
test("дробь через запятую не превращается в тысячи", () => {
  const commas = deriveChe168SpecFields([
    { name: "Энергия батареи (кВт·ч)", value: "73,6" },
    { name: "Официальное ускорение 0-100 км/ч (с)", value: "5,8" },
  ]);
  assert.equal(commas.battery, 73.6);
  assert.equal(commas.acceleration, 5.8);
  // Английская запись тысяч запятой остаётся тысячами.
  assert.equal(deriveChe168SpecFields([{ name: "Battery Capacity", value: "1,234" }]).battery, 1234);
});

test("английские названия понимаются по-прежнему", () => {
  const fields = deriveChe168SpecFields([
    { name: "Battery Energy (kWh)", value: "100" },
    { name: "CLTC Pure Electric Range", value: "700" },
    { name: "Front Tire Specification", value: "245/45 R19" },
    { name: "Engine", value: "1.4T 150HP L4" },
  ]);
  assert.equal(fields.battery, 100);
  assert.equal(fields.electricRange, 700);
  assert.equal(fields.tireRim, 19);
  assert.equal(fields.engine, "1.4T 150HP L4");
});

test("объём, мощность, топливо и коробка разбираются по-русски", () => {
  // Объём решает размер пошлины: 2 литра против «полутора по умолчанию» — это
  // треть разницы в растаможке, то есть сотни долларов на карточке.
  assert.equal(engineVolume({ engine: "2.0L 178 л.с. L4" }), 2);
  assert.equal(enginePower({ engine: "2.0L 178 л.с. L4" }), 178);
  assert.equal(fuelType({ sourceFuelType: "Бензин+48V мягкая гибридная система" }), "Бензин");
  assert.equal(fuelType({ sourceFuelType: "Дизель" }), "Дизель");
  assert.equal(gearboxType({ transmission: "7-ступенчатая мокрая двойная муфта" }), "Робот");
  assert.equal(gearboxType({ transmission: "CVT бесступенчатая трансмиссия" }), "Вариатор");
  // «С ручным режимом» — это по-прежнему автомат: путаница здесь испортила бы
  // выдачу фильтра «Механика» у половины каталога.
  assert.equal(gearboxType({ transmission: "9-ступенчатая автоматическая коробка передач с ручным режимом" }), "Автомат");
  assert.equal(gearboxType({ transmission: "5-ступенчатая механическая коробка передач" }), "Механика");
  assert.equal(gearboxType({ transmission: "Односкоростная коробка передач для электромобилей" }), "");
});

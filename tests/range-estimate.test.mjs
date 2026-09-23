import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RANGE_CYCLES, RANGE_MODES, ageFactor, rangeTable, realRange, temperatureFactor } from "../src/range-estimate.js";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

// Точность расчёта проверить нечем — это оценка по чужим исследованиям. Зато можно
// проверить, что он ведёт себя как положено: холоднее и быстрее — меньше километров,
// а паспортная цифра никогда не выдаётся за реальную.

test("реальный запас всегда меньше паспортного по китайскому циклу", () => {
  const result = realRange({ rated: 500, cycle: "cltc", celsius: 20, mode: "mixed" });
  assert.ok(result.km < 500, "реальный запас не может быть больше паспортного CLTC");
  assert.equal(result.mild, 360);
});

test("чем холоднее, тем меньше километров", () => {
  const warm = realRange({ rated: 500, celsius: 20 }).km;
  const zero = realRange({ rated: 500, celsius: 0 }).km;
  const cold = realRange({ rated: 500, celsius: -20 }).km;
  assert.ok(warm > zero && zero > cold, `ожидалось ${warm} > ${zero} > ${cold}`);
  // Порядок величины сверяем с исследованиями: около −20% при нуле и около половины
  // в сильный мороз. Если правка поедет мимо, тест это поймает.
  assert.ok(zero / warm > 0.7 && zero / warm < 0.85, `при нуле осталось ${Math.round((zero / warm) * 100)}%`);
  assert.ok(cold / warm > 0.45 && cold / warm < 0.65, `в мороз осталось ${Math.round((cold / warm) * 100)}%`);
});

test("на трассе меньше, чем в городе", () => {
  const city = realRange({ rated: 500, mode: "city" }).km;
  const highway = realRange({ rated: 500, mode: "fast" }).km;
  assert.ok(city > highway);
});

test("LFP на морозе теряет больше, а в тепле разницы нет", () => {
  const warmNmc = realRange({ rated: 500, celsius: 20, chemistry: "nmc" }).km;
  const warmLfp = realRange({ rated: 500, celsius: 20, chemistry: "lfp" }).km;
  assert.equal(warmNmc, warmLfp);
  const coldNmc = realRange({ rated: 500, celsius: -15, chemistry: "nmc" }).km;
  const coldLfp = realRange({ rated: 500, celsius: -15, chemistry: "lfp" }).km;
  assert.ok(coldLfp < coldNmc, `LFP ${coldLfp} должен быть меньше NMC ${coldNmc}`);
});

test("тепловой насос помогает только на холоде", () => {
  assert.equal(
    realRange({ rated: 500, celsius: 20, heatPump: true }).km,
    realRange({ rated: 500, celsius: 20, heatPump: false }).km,
  );
  assert.ok(realRange({ rated: 500, celsius: -10, heatPump: true }).km > realRange({ rated: 500, celsius: -10, heatPump: false }).km);
});

test("возраст батареи снижает запас, но не бесконечно", () => {
  assert.equal(ageFactor(0), 1);
  assert.ok(ageFactor(3) < 1);
  assert.equal(ageFactor(50), 0.85);
});

test("температурная кривая не уходит за края", () => {
  assert.equal(temperatureFactor(-100), temperatureFactor(-40));
  assert.equal(temperatureFactor(100), temperatureFactor(40));
  assert.equal(temperatureFactor(20), 1);
});

test("пустой или испорченный ввод не ломает расчёт", () => {
  for (const rated of [0, null, undefined, -100, "абв"]) {
    const result = realRange({ rated, cycle: "какой-то", mode: "летать", chemistry: "неизвестно" });
    assert.equal(result.km, 0);
  }
});

test("таблица собирается по всем режимам и температурам", () => {
  const table = rangeTable({ rated: 500 });
  assert.equal(table.columns.length, RANGE_MODES.length + 1);
  assert.equal(table.rows.length, 4);
  for (const row of table.rows) assert.equal(row.length, RANGE_MODES.length + 1);
  assert.ok(table.note.includes("не наши замеры"), "в подписи должно быть сказано, откуда числа");
});

test("у всех циклов множитель не выше единицы", () => {
  for (const cycle of RANGE_CYCLES) assert.ok(cycle.factor > 0 && cycle.factor <= 1, `странный множитель у ${cycle.id}`);
});

test("невыбранная часть температурной шкалы в светлой теме гасится прозрачностью", () => {
  assert.match(styles, /\.tool-calc-field-temp::after\s*\{[\s\S]*?background:\s*var\(--panel\);[\s\S]*?opacity:\s*0\.5/);
  assert.match(styles, /:root\[data-theme="dark"\] \.tool-calc-field-temp::after\s*\{[\s\S]*?filter:\s*saturate\(0\.4\);[\s\S]*?opacity:\s*1/);
});

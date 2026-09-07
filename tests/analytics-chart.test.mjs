import test from "node:test";
import assert from "node:assert/strict";
import { visitsChart } from "../src/analytics-chart.js";

const daily = Array.from({ length: 100 }, (_, i) => ({ day: new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0,10), visitors: i }));
const now = "2026-09-08T12:00:00Z";
test("подсветка последних 7/30/90 дней не меняет диапазон самого графика", () => {
  for (const count of [7,30,90]) {
    const chart = visitsChart(daily, String(count), now);
    assert.equal(chart.points.length, 100);
    assert.equal(chart.points.filter(point => point.selected).length, count);
    assert.equal(chart.single, false);
  }
});
test("сегодня и вчера выбирают только одну точку по минской дате", () => {
  const days = [{ day:"2026-09-07", visitors:2 }, { day:"2026-09-08", visitors:3 }];
  for (const [period, expected] of [["today","2026-09-08"],["yesterday","2026-09-07"]]) {
    const chart = visitsChart(days, period, "2026-09-07T22:00:00Z");
    assert.equal(chart.single, true);
    assert.deepEqual(chart.points.filter(point => point.selected).map(point => point.day), [expected]);
  }
});
test("шкала имеет целые отметки, включает ноль и максимум; одиночная точка центрируется", () => {
  for (const visitors of [0,1,3,19,103]) {
    const { points, ticks } = visitsChart([{ day:"2026-09-08",visitors }], "today", now);
    assert.equal(points[0].x, 50);
    assert.ok(points[0].y >= 10 && points[0].y <= 90);
    assert.equal(ticks[0].value, 0);
    assert.ok(ticks.at(-1).value >= visitors);
    assert.ok(ticks.every(tick => Number.isInteger(tick.value)));
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { EV_QUOTA, evQuotaState } from "../src/ev-quota.js";

const state = () => evQuotaState({ today: new Date("2026-08-22T00:00:00Z") });

test("takes the remaining quota from the latest customs report", () => {
  const last = EV_QUOTA.reports.filter(([, personal]) => personal !== null).at(-1);
  const quota = state();
  assert.equal(quota.remaining, last[1]);
  assert.equal(quota.spent, EV_QUOTA.personalTotal - last[1]);
  assert.equal(quota.total, EV_QUOTA.personalTotal);
});

test("monthly spending adds up to the whole quota used so far", () => {
  const quota = state();
  const summed = quota.periods.reduce((total, period) => total + period.spent, 0);
  assert.equal(summed, quota.spent);
  assert.ok(quota.periods.every((period) => period.spent >= 0));
});

test("keeps the months the customs reports do cover", () => {
  const quota = state();
  // До 7 мая таможня остаток не публиковала, поэтому начало года — одной строкой.
  assert.deepEqual(quota.periods.map((period) => period.label), [
    "за январь — апрель", "за май", "за июнь", "за июль", "за август",
    "за сентябрь", "за октябрь", "за ноябрь", "за декабрь",
  ]);
  // Ненаступившие месяцы держат каркас года и стоят нулями.
  assert.deepEqual(quota.periods.filter((period) => period.future).map((period) => period.spent), [0, 0, 0, 0]);
  // Август ещё не закрыт, предыдущие месяцы посчитаны целиком.
  const august = quota.periods.find((period) => period.label === "за август");
  assert.equal(august.partial, true);
  assert.deepEqual(quota.periods.slice(1, 4).map((period) => period.partial), [false, false, false]);
});

test("fills the bar with what is already used up", () => {
  const quota = state();
  assert.ok(quota.usedShare > 0.85 && quota.usedShare < 0.9);
});

test("projects the exhaustion date from the last four weeks", () => {
  const quota = state();
  // Остаток 758 при расходе около 240 машин в неделю — примерно три недели.
  assert.ok(quota.perWeek > 200 && quota.perWeek < 300);
  assert.ok(quota.daysLeft > 14 && quota.daysLeft < 30);
  assert.equal(quota.runsOutLabel, "13 сентября");
  assert.equal(quota.exhausted, false);
  assert.equal(quota.overdue, false);
  assert.equal(quota.stale, false);
});

test("keeps the business quota on the same footing", () => {
  const business = evQuotaState({ audience: "business", today: new Date("2026-08-22T00:00:00Z") });
  assert.equal(business.total, EV_QUOTA.businessTotal);
  assert.equal(business.remaining, 0);
  assert.equal(business.exhausted, true);
  assert.equal(business.exhaustedOnLabel, "24 июля");
  assert.equal(business.usedShare, 1);
  const summed = business.periods.reduce((total, period) => total + period.spent, 0);
  assert.equal(summed, EV_QUOTA.businessTotal);
});

test("leaves the personal quota running", () => {
  const quota = state();
  assert.equal(quota.exhaustedOnLabel, null);
});

test("flags stale data when the reports stop coming", () => {
  const quota = evQuotaState({ today: new Date("2026-10-01T00:00:00Z") });
  assert.equal(quota.stale, true);
  assert.equal(quota.overdue, true);
});

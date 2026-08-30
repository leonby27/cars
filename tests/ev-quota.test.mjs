import test from "node:test";
import assert from "node:assert/strict";
import { EV_QUOTA, evQuotaState } from "../src/ev-quota.js";

const state = () => evQuotaState({ today: new Date("2026-08-22T00:00:00Z") });

test("takes the remaining quota from the latest customs report", () => {
  // Сводки после дня расчёта не в счёт: их не было, когда этот день наступал.
  const last = EV_QUOTA.reports.filter(([day, personal]) => personal !== null && day <= "2026-08-22").at(-1);
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
    "апрель", "май", "июнь", "июль", "август",
    "сентябрь", "октябрь", "ноябрь", "декабрь",
  ]);
  // У ненаступивших месяцев остатка нет — в карточке там прочерк, а не выдуманный ноль.
  assert.deepEqual(quota.periods.filter((period) => period.future).map((period) => period.left), [null, null, null, null]);
  // Август ещё не закрыт, предыдущие месяцы посчитаны целиком.
  const august = quota.periods.find((period) => period.label === "август");
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

test("остаток по месяцам убывает и сходится с текущим", () => {
  const quota = state();
  const known = quota.periods.filter((period) => period.left !== null);
  // Каждая строка — остаток на конец периода: он только уменьшается.
  known.forEach((period, index) => {
    if (index > 0) assert.ok(period.left <= known[index - 1].left, period.label);
    assert.ok(period.left >= 0, period.label);
  });
  // Последняя известная строка — это и есть сегодняшний остаток.
  assert.equal(known[known.length - 1].left, quota.remaining);
  assert.equal(known[0].left, quota.total - known[0].spent);
});

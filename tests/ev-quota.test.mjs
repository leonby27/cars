import test from "node:test";
import assert from "node:assert/strict";
import { EV_QUOTA, evQuotaPricingAvailable, evQuotaState, isEvQuotaExhausted, isEvQuotaOver, isEvQuotaPricingOn, rememberEvQuotaPricing } from "../src/ev-quota.js";

const state = () => evQuotaState({ today: new Date("2026-08-22T00:00:00Z") });

const mockWindow = (t, value) => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  globalThis.window = value;
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else delete globalThis.window;
  });
};

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

test("uses the customs exhaustion report as the final personal quota state", () => {
  const quota = evQuotaState({ today: new Date("2026-09-06T00:00:00Z") });
  assert.equal(quota.remaining, 0);
  assert.equal(quota.exhausted, true);
  assert.equal(quota.exhaustedOnLabel, "5 сентября");
});

test("defaults server-rendered prices to no quota and leaves the switch available", () => {
  assert.equal(isEvQuotaExhausted(), true);
  assert.equal(isEvQuotaOver(), true);
  assert.equal(isEvQuotaPricingOn(), false);
  assert.equal(evQuotaPricingAvailable(), true);
});

for (const [label, savedChoice, enabled] of [
  ["a first visit", null, false],
  ["a saved off choice", "off", false],
  ["an explicit saved on choice", "on", true],
  ["an invalid stored choice", "invalid", false],
]) {
  test(`uses the correct price scenario for ${label}`, (t) => {
    mockWindow(t, {
      location: { search: "" },
      localStorage: { getItem: () => savedChoice },
    });
    assert.equal(isEvQuotaPricingOn(), enabled);
    assert.equal(isEvQuotaOver(), !enabled);
    assert.equal(evQuotaPricingAvailable(), true);
  });
}

test("defaults to no-quota prices when browser storage is unavailable", (t) => {
  mockWindow(t, {
    location: { search: "" },
    get localStorage() { throw new Error("Storage is unavailable"); },
  });
  assert.equal(isEvQuotaPricingOn(), false);
  assert.equal(isEvQuotaOver(), true);
});

test("remembers manual switching both ways after starting without quota", (t) => {
  const storage = new Map();
  mockWindow(t, {
    location: { search: "" },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  });
  assert.equal(isEvQuotaPricingOn(), false);
  rememberEvQuotaPricing(true);
  assert.equal(isEvQuotaPricingOn(), true);
  assert.equal(isEvQuotaOver(), false);
  rememberEvQuotaPricing(false);
  assert.equal(isEvQuotaPricingOn(), false);
  assert.equal(isEvQuotaOver(), true);
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

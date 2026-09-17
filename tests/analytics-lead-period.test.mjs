import test from "node:test";
import assert from "node:assert/strict";
import { filterLeadsByPeriod, leadPeriodNote, leadPeriodRange } from "../src/analytics-lead-period.js";
import { normalizeAnalyticsRange } from "../server/analytics.mjs";

const lead = (createdAt) => ({ id:createdAt, createdAt });
// 08.09.2026, 01:00 по Минску — час, на котором сутки по Гринвичу ещё вчерашние.
const now = Date.parse("2026-09-07T22:00:00Z");

test("границы «сегодня» и «вчера» совпадают с серверными", () => {
  for (const id of ["today", "yesterday"]) {
    assert.equal(leadPeriodRange(id, now).from, normalizeAnalyticsRange(id, now).from.getTime());
  }
  assert.equal(leadPeriodRange("yesterday", now).to, leadPeriodRange("today", now).from);
});

test("заявка ночью попадает в сегодняшние сутки, а не во вчерашние", () => {
  const leads = [lead("2026-09-07T22:30:00Z"), lead("2026-09-07T20:00:00Z"), lead("2026-09-05T10:00:00Z")];
  assert.deepEqual(filterLeadsByPeriod(leads, "today", now).map((item) => item.id), ["2026-09-07T22:30:00Z"]);
  assert.deepEqual(filterLeadsByPeriod(leads, "yesterday", now).map((item) => item.id), ["2026-09-07T20:00:00Z"]);
  assert.equal(filterLeadsByPeriod(leads, "7", now).length, 3);
});

test("скользящие окна отрезают по дням, а незнакомое значение оставляет список целиком", () => {
  const leads = [lead("2026-09-07T22:30:00Z"), lead("2026-08-20T10:00:00Z"), lead("2020-01-01T00:00:00Z")];
  assert.equal(filterLeadsByPeriod(leads, "30", now).length, 2);
  assert.equal(filterLeadsByPeriod(leads, "90", now).length, 2);
  assert.equal(filterLeadsByPeriod(leads, "365", now).length, 3);
  assert.equal(leadPeriodRange("365", now), null);
});

test("заявка минутой позже часов браузера не пропадает из свежего периода", () => {
  const leads = [lead(new Date(now + 60_000).toISOString())];
  assert.equal(filterLeadsByPeriod(leads, "today", now).length, 1);
  assert.equal(filterLeadsByPeriod(leads, "30", now).length, 1);
});

test("заявка без даты не ломает список", () => {
  assert.equal(filterLeadsByPeriod([{ id:"нет даты", createdAt:null }], "30", now).length, 0);
  assert.equal(filterLeadsByPeriod(null, "30", now).length, 0);
});

test("у каждого периода из шапки есть подпись под цифрой", () => {
  for (const id of ["today", "yesterday", "7", "30", "90"]) assert.match(leadPeriodNote(id), /^За /);
  assert.equal(leadPeriodNote("выдумка"), "За всё время работы");
});

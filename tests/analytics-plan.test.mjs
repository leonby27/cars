import test from "node:test";
import assert from "node:assert/strict";
import { ANALYTICS_PLAN, ANALYTICS_SEARCH_PLAN, buildAnalyticsPlan, minskPlanDay, planDailyValue } from "../src/analytics-plan.js";
import { deploymentPlan } from "../scripts/lib/deploy-plan.mjs";

const calibration = [
  {day:"2026-09-29",visits:74}, {day:"2026-09-30",visits:84},
  ...Object.entries(ANALYTICS_PLAN.calibrationDays).map(([day,visits]) => ({day,visits})),
  {day:"2026-10-06",visits:9999},
];

test("поисковой прогноз имеет отдельную фиксированную базу и не меняется вместе с фактом", () => {
  const daily = Object.entries(ANALYTICS_SEARCH_PLAN.calibrationDays).map(([day,visits])=>({day,visits}));
  const before = buildAnalyticsPlan(daily,"2026-10-06T10:00:00Z",ANALYTICS_SEARCH_PLAN);
  assert.equal(before.rows[0].actual,323/5);
  assert.equal(ANALYTICS_SEARCH_PLAN.level,437/7);
  assert.deepEqual(before.rows.slice(0,4).map(r=>r.rounded.strong),[130,250,320,380]);
  const after = buildAnalyticsPlan([...daily,{day:"2026-10-06",visits:200}],"2026-10-07T10:00:00Z",ANALYTICS_SEARCH_PLAN);
  assert.equal(after.rows[0].actual,523/6);
  assert.deepEqual(before.rows.map(r=>r.rounded),after.rows.map(r=>r.rounded));
});

test("годовой план сохраняет согласованные значения до января и ровно 12 месяцев", () => {
  const plan=buildAnalyticsPlan(calibration,"2026-10-06T10:00:00Z");
  assert.equal(plan.rows.length,12);
  assert.equal(plan.rows[0].month,"2026-10");
  assert.equal(plan.rows.at(-1).month,"2027-09");
  assert.deepEqual(plan.rows.slice(0,4).map((r)=>r.rounded.base),[140,220,250,260]);
  assert.deepEqual(plan.rows.slice(0,4).map((r)=>r.rounded.cautious),[110,130,130,130]);
  assert.deepEqual(plan.rows.slice(0,4).map((r)=>r.rounded.strong),[170,320,400,470]);
  assert.ok(plan.rows.every((r)=>r.cautious<r.base&&r.base<r.strong));
});

test("факт исключает сегодняшний неполный день и сравнивается с планом за те же дни", () => {
  const plan=buildAnalyticsPlan(calibration,"2026-10-06T10:00:00Z");
  const october=plan.rows[0];
  assert.equal(october.elapsedDays,5);
  assert.equal(october.actual,457/5);
  assert.equal(october.expectedToDate,457/5);
  assert.equal(october.deviation,0);
  assert.equal(october.status,"on-plan");
  assert.equal(plan.latestWeek.average,615/7);
  assert.ok(Math.abs(plan.nextWeek.average-115.36630827407707)<1e-9);
  assert.ok(plan.rows.slice(1).every((r)=>r.actual===null&&r.deviation===null));
});

test("смена суток учитывается по Минску, а пропущенные завершённые дни включаются как нули", () => {
  assert.equal(minskPlanDay("2026-10-05T20:59:59Z"),"2026-10-05");
  assert.equal(minskPlanDay("2026-10-05T21:00:00Z"),"2026-10-06");
  const plan=buildAnalyticsPlan([{day:"2026-10-01",visits:100}],"2026-10-03T10:00:00Z");
  assert.equal(plan.rows[0].elapsedDays,2);
  assert.equal(plan.rows[0].actual,50);
});

test("обновление факта не меняет ни одну прогнозную величину", () => {
  const before=buildAnalyticsPlan(calibration,"2026-10-06T10:00:00Z");
  const after=buildAnalyticsPlan([...calibration,{day:"2026-10-07",visits:400}],"2026-11-01T10:00:00Z");
  assert.deepEqual(after.rows.map((r)=>r.rounded),before.rows.map((r)=>r.rounded));
  assert.equal(after.rows[0].elapsedDays,31);
  assert.equal(after.rows[1].elapsedDays,0);
  assert.equal(after.rows[1].actual,null);
});

test("затухающий прирост и сезонная поправка применяются только к будущей траектории", () => {
  for(const scenario of ['cautious','base','strong'])assert.equal(planDailyValue('2026-10-05',scenario),124);
  const juneIncrement=planDailyValue('2027-06-08')-planDailyValue('2027-06-01');
  const novemberIncrement=planDailyValue('2026-11-08')-planDailyValue('2026-11-01');
  assert.ok(juneIncrement>0&&juneIncrement<novemberIncrement);
  const january=planDailyValue('2027-01-15');
  const config=ANALYTICS_PLAN.scenarios.base;
  const h=(Date.parse('2027-01-15')-Date.parse(ANALYTICS_PLAN.anchor))/86400000/7;
  const unadjusted=ANALYTICS_PLAN.level+config.increment*config.damping*(1-config.damping**h)/(1-config.damping);
  assert.ok(Math.abs(january/unadjusted-.85)<1e-12);
});

test("план аналитики не требует подготовки каталога или пересчёта автомобильных цен", () => {
  const result=deploymentPlan(['src/analytics-plan.js','src/analytics-plan-section.jsx','src/analytics-page.jsx','src/analytics.css','server/analytics-plan.mjs','server/analytics.mjs','server/handler.mjs']);
  assert.equal(result.reuseCatalog,true);
  assert.equal(result.reuseFeed,true);
  assert.equal(result.recalculatePrices,false);
});

test("после окончания годового плана будущая неделя не подменяется продолжением прогноза", () => {
  const result=buildAnalyticsPlan([],"2027-10-10T10:00:00Z");
  assert.ok(result.rows.every((r)=>r.elapsedDays===r.days));
  assert.equal(result.nextWeek.average,null);
  assert.equal(result.latestWeek.average,null);
});

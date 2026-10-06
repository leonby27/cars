import test from "node:test";
import assert from "node:assert/strict";
import { getAnalyticsPlan } from "../server/analytics-plan.mjs";
import { handleApiRequest } from "../server/handler.mjs";
import { createAnalyticsToken } from "../server/analytics.mjs";
import { pool } from "../server/db.mjs";

test("поисковой срез считает Яндекс и Google, исключая ChatGPT и остальные бесплатные входы", async () => {
  const calls = [];
  const db = { query:async (...args) => { calls.push(args);return {rows:[{day:"2026-10-01",visits:100,yandex:4,google:3,chatgpt:50}]}; } };
  const result = await getAnalyticsPlan({db,now:Date.parse("2026-10-02T10:00:00Z")});
  assert.equal(calls.length,1);
  assert.equal(result.rows[0].actual,100);
  assert.equal(result.search.rows[0].actual,7);
  assert.equal(result.rows[3].rounded.strong,470);
  assert.equal(result.search.rows[3].rounded.strong,380);
  assert.equal(result.search.rows.length,12);
  assert.equal(result.search.generatedAt,result.generatedAt);
});

test("план использует тот же бесплатный срез с действиями без квотных входов и хранит весь год", async () => {
  const calls = [];
  const db = { query:async (sql,params) => {
    calls.push({sql,params});
    return { rows:[{day:"2026-10-01",visits:84},{day:"2026-10-02",visits:77}] };
  } };
  const result = await getAnalyticsPlan({ db, now:Date.parse("2026-10-03T10:00:00Z") });
  assert.equal(result.rows.length,12);
  assert.equal(result.rows[0].actual,80.5);
  assert.deepEqual(result.filters,{acquisition:"organic",activity:"actions",traffic:"without-quota"});
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/human_action AND path <> '\/analytics'/);
  assert.match(calls[0].sql,/traffic_landing_path[\s\S]*= 'organic'/);
  assert.match(calls[0].sql,/lower\(split_part\(split_part\(traffic_landing_path/);
  assert.equal(calls[0].params[0],"2026-08-31T21:00:00.000Z");
  assert.equal(calls[0].params[1],"2026-10-03T10:00:00.000Z");
  await getAnalyticsPlan({db,now:Date.parse("2027-12-01T10:00:00Z")});
  assert.equal(calls[1].params[1],"2027-09-30T21:00:00.000Z");
});

test("API плана закрыт сессией аналитики и не позволяет менять фиксированный срез", async () => {
  const previousPassword = process.env.ANALYTICS_PASSWORD;
  const previousQuery = pool.query;
  const calls = [];
  process.env.ANALYTICS_PASSWORD = "plan-test-password";
  pool.query = async (sql,params) => { calls.push({sql,params});return {rows:[]}; };
  const request = async (cookie) => {
    let status,body;
    const response = { req:{headers:{}}, writeHead(code){status=code;}, end(value){body=String(value);} };
    await handleApiRequest({ method:"GET",url:"/api/analytics/plan?acquisition=paid&activity=all&traffic=all", headers:{host:"example.test",...(cookie?{cookie}:{})} },response);
    return {status,payload:JSON.parse(body)};
  };
  try {
    const anonymous = await request();
    assert.equal(anonymous.status,401);
    assert.equal(calls.length,0);
    const authorized = await request(`abcars_analytics=${encodeURIComponent(createAnalyticsToken())}`);
    assert.equal(authorized.status,200);
    assert.equal(authorized.payload.rows.length,12);
    assert.deepEqual(authorized.payload.filters,{acquisition:"organic",activity:"actions",traffic:"without-quota"});
    assert.equal(calls.length,1);
  } finally {
    pool.query = previousQuery;
    if(previousPassword===undefined)delete process.env.ANALYTICS_PASSWORD;
    else process.env.ANALYTICS_PASSWORD=previousPassword;
  }
});

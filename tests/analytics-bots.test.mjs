import test from "node:test";
import assert from "node:assert/strict";
import { isBotAgent as browserBot, isSkippedVisit } from "../src/analytics.js";
import { isBotAgent, noteSiteRequest } from "../server/analytics.mjs";
import { workerBotAgent } from "../worker/analytics.js";
import { handleApiRequest } from "../server/handler.mjs";
import { pool } from "../server/db.mjs";

const chrome = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36";
const robots = ["AhrefsSiteAudit/6.1", "SemrushSiteAudit/1.0", "facebookexternalhit/1.1", "meta-externalagent/1.1", "Google-InspectionTool/1.0", "GoogleOther/1.0", "ChatGPT-User/1.0", "Perplexity-User/1.0", "anthropic-ai", "Imagesift/1.0", "HTTrack/3.0", "curl/8.0", "GTmetrix", "YandexImages", "HeadlessChrome/131.0.0.0"];

test("браузер, сервер и worker одинаково отсеивают явных ботов, сохраняя обычные рекламные переходы", () => {
  for (const agent of robots) {
    for (const detect of [browserBot, isBotAgent, workerBotAgent]) assert.equal(detect(agent), true, agent);
    assert.equal(isSkippedVisit({ hostname:"abcars.by", agent, path:"/catalog?yclid=ad", automated:false }), true);
  }
  for (const detect of [browserBot, isBotAgent, workerBotAgent]) assert.equal(detect(chrome), false);
  assert.equal(isSkippedVisit({ hostname:"abcars.by", agent:chrome, path:"/catalog?yclid=ad", automated:false }), false);
  assert.equal(isSkippedVisit({ hostname:"abcars.by", agent:chrome, path:"/catalog?yclid=ad", automated:true }), true);
  assert.equal(isBotAgent(""), true);
  assert.equal(workerBotAgent(""), true);
});

test("приём событий исключает ботов в обоих режимах и принимает рекламу без действий", async () => {
  const original = pool.query;
  const writes = [];
  pool.query = async (sql, params) => {
    if (sql.includes("INSERT INTO rate_limits")) return { rows:[{ hits:1, window_started_at:new Date() }] };
    if (sql.includes("FROM datacenter_ranges")) return { rows:[], rowCount:params[0] === "203.0.113.240" ? 1 : 0 };
    if (sql.includes("FROM country_ranges")) return { rows:[{ ready:false }] };
    if (/INSERT INTO analytics_events|UPDATE analytics_events/.test(sql)) { writes.push({ sql, params }); return { rowCount:1 }; }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const previousSite = process.env.SITE_URL;
  process.env.SITE_URL = "https://abcars.by";
  const request = async (agent, endpoint, activity, address = "203.0.113.239") => {
    noteSiteRequest(address);
    let status, body;
    const response = { req:{ headers:{} }, writeHead:(code) => { status = code; }, end:(value) => { body = JSON.parse(value.toString()); } };
    await handleApiRequest({ method:"POST", url:`/api/analytics/${endpoint}?activity=${activity}`, headers:{ host:"abcars.by", origin:"https://abcars.by", "user-agent":agent, "x-real-ip":address }, body:{ eventId:"ad-event", visitorId:"ad-visitor", sessionId:"ad-session", eventName:"page_view", path:"/catalog?yclid=ad", human:false, humanAction:false, action:true } }, response);
    assert.equal(status, 202);
    return body;
  };
  try {
    for (const activity of ["all", "actions"]) {
      for (const agent of robots) {
        assert.equal((await request(agent, "events", activity)).recorded, false);
        assert.equal((await request(agent, "human", activity)).confirmed, 0);
      }
      assert.equal((await request(chrome, "events", activity, "203.0.113.240")).recorded, false);
      assert.equal((await request(chrome, "human", activity, "203.0.113.240")).confirmed, 0);
      assert.equal(writes.length, 0, "даже рекламная метка и присланное действие не пропускают бота");
    }
    assert.equal((await request(chrome, "events", "all")).recorded, true);
    assert.equal(writes.length, 1);
    assert.equal(JSON.parse(writes[0].params[7]).acquisition, "paid");
    assert.equal(writes[0].params[8], false);
    assert.equal(writes[0].params[9], false);
  } finally {
    pool.query = original;
    if (previousSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSite;
  }
});

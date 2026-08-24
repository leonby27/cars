import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db.mjs";
import { handleApiRequest } from "../server/handler.mjs";
import { createAnalyticsToken } from "../server/analytics.mjs";

// Служебное состояние импорта — внутренняя информация: очередь задач, состояние
// источников и текст последней ошибки. Тест держит границу: без пароля наружу уходит
// только «сайт жив» и размер каталога.
const requestHealth = async (headers = {}) => {
  const previousQuery = pool.query;
  pool.query = async (config) => {
    const sql = typeof config === "string" ? config : String(config?.text || "");
    if (/FROM listings/.test(sql)) return { rows:[{ cars:32916 }] };
    if (/crawl_jobs/.test(sql)) return { rows:[{ queued:1, running:0, failed:2 }] };
    return { rows:[{ source:"Che168", status:"blocked", last_error:"http://user:secret@proxy.example:8080 failed" }] };
  };
  let body = "";
  const response = {
    req:{ headers:{} },
    writeHead() { return this; },
    end(chunk) { body = chunk ? chunk.toString("utf8") : ""; return this; },
  };
  try {
    await handleApiRequest({ method:"GET", url:"/api/health", headers:{ host:"example.test", ...headers } }, response);
  } finally {
    pool.query = previousQuery;
  }
  return JSON.parse(body);
};

test("состояние импорта без пароля наружу не уходит", async () => {
  const payload = await requestHealth();
  assert.deepEqual(payload, { ok:true, cars:32916 });
  assert.equal("jobs" in payload, false);
  assert.equal("sources" in payload, false);
});

test("с паролем аналитики состояние импорта видно целиком", async () => {
  const previousPassword = process.env.ANALYTICS_PASSWORD;
  process.env.ANALYTICS_PASSWORD = "test-password";
  try {
    const payload = await requestHealth({ cookie:`abcars_analytics=${encodeURIComponent(createAnalyticsToken())}` });
    assert.equal(payload.cars, 32916);
    assert.equal(payload.jobs.failed, 2);
    assert.equal(payload.sources[0].status, "blocked");
  } finally {
    if (previousPassword === undefined) delete process.env.ANALYTICS_PASSWORD;
    else process.env.ANALYTICS_PASSWORD = previousPassword;
  }
});

// Заявки — самые чувствительные данные раздела: имя, телефон и комментарий живого
// человека. Тест держит границу, что список отдаётся только по паролю аналитики.
const requestLeads = async (headers = {}) => {
  const previousQuery = pool.query;
  pool.query = async () => ({ rows:[] });
  let status = 0;
  let body = "";
  const response = {
    req:{ headers:{} },
    writeHead(code) { status = code; return this; },
    end(chunk) { body = chunk ? chunk.toString("utf8") : ""; return this; },
  };
  try {
    await handleApiRequest({ method:"GET", url:"/api/analytics/leads", headers:{ host:"example.test", ...headers } }, response);
  } finally {
    pool.query = previousQuery;
  }
  return { status, payload:JSON.parse(body) };
};

test("список заявок закрыт паролем аналитики", async () => {
  const previousPassword = process.env.ANALYTICS_PASSWORD;
  process.env.ANALYTICS_PASSWORD = "test-password";
  try {
    const anonymous = await requestLeads();
    assert.equal(anonymous.status, 401);
    assert.equal("leads" in anonymous.payload, false);

    const authorized = await requestLeads({ cookie:`abcars_analytics=${encodeURIComponent(createAnalyticsToken())}` });
    assert.equal(authorized.status, 200);
    assert.deepEqual(authorized.payload.leads, []);
  } finally {
    if (previousPassword === undefined) delete process.env.ANALYTICS_PASSWORD;
    else process.env.ANALYTICS_PASSWORD = previousPassword;
  }
});

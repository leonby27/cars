import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db.mjs";
import { RATE_LIMITS, checkRateLimit, clientAddress, consumeRateLimit } from "../server/rate-limit.mjs";

// Счётчик живёт в базе, поэтому вместо базы подставляем её поведение: окно и счёт попыток.
const withCountingPool = async (run) => {
  const previous = pool.query;
  const buckets = new Map();
  pool.query = async (sql, values) => {
    const [bucket] = values;
    const hits = (buckets.get(bucket) || 0) + 1;
    buckets.set(bucket, hits);
    return { rows:[{ hits, window_started_at:new Date().toISOString() }] };
  };
  try { return await run(buckets); } finally { pool.query = previous; }
};

test("попытки сверх предела получают отказ", async () => {
  await withCountingPool(async () => {
    const rule = { limit:3, windowSeconds:600 };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      assert.equal((await consumeRateLimit("test:1.2.3.4", rule)).allowed, true, `попытка ${attempt}`);
    }
    const blocked = await consumeRateLimit("test:1.2.3.4", rule);
    assert.equal(blocked.allowed, false);
    // Ответ должен подсказать, когда пробовать снова, иначе клиент будет долбить сразу.
    assert.ok(blocked.retryAfter > 0);
  });
});

test("вход считается и по адресу, и по номеру телефона", async () => {
  await withCountingPool(async (buckets) => {
    await checkRateLimit("login", ["1.2.3.4", "phone:375291234567"]);
    assert.deepEqual([...buckets.keys()], ["login:1.2.3.4", "login:phone:375291234567"]);
  });
});

test("другой посетитель не расходует чужой предел", async () => {
  await withCountingPool(async () => {
    const rule = RATE_LIMITS.login;
    for (let attempt = 0; attempt < rule.limit; attempt += 1) await consumeRateLimit("login:1.1.1.1", rule);
    assert.equal((await consumeRateLimit("login:1.1.1.1", rule)).allowed, false);
    assert.equal((await consumeRateLimit("login:2.2.2.2", rule)).allowed, true);
  });
});

test("сбой базы не закрывает вход всем сразу", async () => {
  const previous = pool.query;
  pool.query = async () => { throw new Error("database is down"); };
  try {
    assert.equal((await consumeRateLimit("login:1.2.3.4", RATE_LIMITS.login)).allowed, true);
  } finally { pool.query = previous; }
});

test("адрес посетителя берётся из заголовка прокси, а не из адреса прокси", () => {
  assert.equal(clientAddress({ headers:{ "x-forwarded-for":"203.0.113.9, 70.41.3.18" }, socket:{ remoteAddress:"10.0.0.1" } }), "203.0.113.9");
  assert.equal(clientAddress({ headers:{}, socket:{ remoteAddress:"10.0.0.1" } }), "10.0.0.1");
  assert.equal(clientAddress({ headers:{} }), "unknown");
});

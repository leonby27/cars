import test from "node:test";
import assert from "node:assert/strict";
import { pool } from "../server/db.mjs";
import { handleApiRequest } from "../server/handler.mjs";

// Ответы каталога одинаковы для всех, поэтому их разрешено хранить общей сети доставки.
// Ответы про сессию, аккаунт и состояние базы — нет. Тест держит эту границу на месте:
// случайно помеченный `public` личный ответ утёк бы следующему посетителю.
const requestApi = async (path) => {
  const previousQuery = pool.query;
  // Запросы к базе подменяем: проверяем заголовки маршрутов, а не SQL.
  pool.query = async (config) => {
    const sql = typeof config === "string" ? config : String(config?.text || "");
    return /count\(\*\)/.test(sql) ? { rows:[{ total:0, cars:0 }] } : { rows:[] };
  };
  const state = { status:0, headers:{} };
  const response = {
    req:{ headers:{} },
    writeHead(status, headers) {
      state.status = status;
      state.headers = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
      return this;
    },
    end() { return this; },
  };
  try {
    await handleApiRequest({ method:"GET", url:path, headers:{ host:"example.test" } }, response);
  } finally {
    pool.query = previousQuery;
  }
  return { ...state, cacheControl:state.headers["cache-control"] };
};

test("каталог отдаётся с общим кэшем, но браузер своей копии не держит", async () => {
  for (const path of ["/api/cars?limit=24", "/api/cars?limit=60&sort=variety", "/api/catalog/meta"]) {
    const { status, cacheControl } = await requestApi(path);
    assert.equal(status, 200, path);
    assert.match(cacheControl, /\bpublic\b/, path);
    assert.match(cacheControl, /\bs-maxage=\d+/, path);
    assert.match(cacheControl, /\bstale-while-revalidate=\d+/, path);
    // max-age=0 оставляет свежесть за посетителем: хранит только сеть доставки.
    assert.match(cacheControl, /\bmax-age=0\b/, path);
  }
});

test("личные ответы и состояние базы не кэшируются", async () => {
  for (const path of ["/api/auth/me", "/api/account/favorites", "/api/health", "/api/cars/does-not-exist"]) {
    const { cacheControl } = await requestApi(path);
    assert.equal(cacheControl, "no-store", path);
  }
});

import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("serves the generated HTML representation for a public route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/catalog?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/catalog/index.html" ? "catalog" : "missing", {
            status: url.pathname === "/catalog/index.html" ? 200 : 404,
            headers: { "content-type":"text/html" },
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.deepEqual(calls, ["/catalog?source=share", "/catalog/index.html"]);
});

test("returns a real 404 page for an unknown public route", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/missing", { headers:{ accept:"text/html" } }), {
    ASSETS: {
      fetch: async (request) => {
        const url = new URL(request.url);
        calls.push(url.pathname);
        return new Response(url.pathname === "/404.html" ? "not found" : "missing", {
          status:url.pathname === "/404.html" ? 200 : 404,
          headers:{ "content-type":"text/html" },
        });
      },
    },
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.deepEqual(calls, ["/missing", "/missing/index.html"]);
});

test("keeps an informative 404 body when the asset host omits 404.html", async () => {
  const response = await worker.fetch(new Request("https://example.test/missing", { headers:{ accept:"text/html" } }), {
    ASSETS:{ fetch:async () => new Response(null, { status:404 }) },
  });
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /Страница не найдена/);
});

test("отдаёт страницу машины заготовкой, а не ошибкой 404", async () => {
  // Статических страниц машин в сборке нет, поэтому без заготовки каждое объявление
  // отвечало бы «страница не найдена» — для поиска это означает «страницы не существует».
  const response = await worker.fetch(new Request("https://example.test/cars/che168-56135000", { headers:{ accept:"text/html" } }), {
    ASSETS: {
      fetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        return new Response(pathname === "/car.html" ? "app" : "missing", {
          status:pathname === "/car.html" ? 200 : 404,
          headers:{ "content-type":"text/html" },
        });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "app");
});

test("keeps private application routes available but non-indexable", async () => {
  const response = await worker.fetch(new Request("https://example.test/orders/draft/123", { headers:{ accept:"text/html" } }), {
    ASSETS: {
      fetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        return new Response(pathname === "/private.html" ? "app" : "missing", {
          status:pathname === "/private.html" ? 200 : 404,
          headers:{ "content-type":"text/html" },
        });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
});

test("keeps the CRM non-indexable when public indexing is enabled", async () => {
  const response = await worker.fetch(new Request("https://example.test/analytics", { headers:{ accept:"text/html" } }), {
    SEO_ALLOW_INDEXING:"true",
    ASSETS:{ fetch:async () => new Response("crm", { status:200, headers:{ "content-type":"text/html" } }) },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("proxies allowlisted catalog images with cache headers", async () => {
  const originalFetch = globalThis.fetch;
  let forwardedUrl = "";
  globalThis.fetch = async (request) => {
    forwardedUrl = String(request);
    return new Response(new Uint8Array([1, 2, 3]), { status:200, headers:{ "content-type":"image/jpeg" } });
  };
  try {
    const source = "https://image-oversea.guazistatic-global.com/ovp/product/car.jpg";
    const response = await worker.fetch(new Request(`https://example.test/api/image?src=${encodeURIComponent(source)}`), { ASSETS:{ fetch:async () => new Response("missing", { status:404 }) } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.match(response.headers.get("cache-control"), /max-age=21600/);
    assert.equal(forwardedUrl, source);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects image proxy requests to untrusted hosts", async () => {
  const response = await worker.fetch(new Request(`https://example.test/api/image?src=${encodeURIComponent("https://example.com/private.jpg")}`), { ASSETS:{ fetch:async () => new Response("missing", { status:404 }) } });
  assert.equal(response.status, 403);
});

test("protects analytics reset and uses calendar-safe date filtering", async () => {
  const executed = [];
  const DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() { executed.push(sql); return { meta:{ changes:4 } }; },
        async first() { executed.push(sql); return {}; },
        async all() { executed.push(sql); return { results:[] }; },
      };
    },
    async batch() { return []; },
  };
  const env = { DB, ANALYTICS_PASSWORD:"test-password", ANALYTICS_SESSION_SECRET:"test-secret", ASSETS:{ fetch:async () => new Response("missing", { status:404 }) } };
  const unauthorized = await worker.fetch(new Request("https://example.test/api/analytics/events", { method:"DELETE" }), env);
  assert.equal(unauthorized.status, 401);

  const login = await worker.fetch(new Request("https://example.test/api/analytics/login", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ password:"test-password" }) }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const dashboard = await worker.fetch(new Request("https://example.test/api/analytics/dashboard?days=30", { headers:{ cookie } }), env);
  assert.equal(dashboard.status, 200);
  assert.equal(executed.filter((sql) => sql.startsWith("SELECT")).every((sql) => sql.includes("datetime(created_at) >= datetime(?)")), true);

  const reset = await worker.fetch(new Request("https://example.test/api/analytics/events", { method:"DELETE", headers:{ cookie } }), env);
  assert.equal(reset.status, 200);
  assert.deepEqual(await reset.json(), { ok:true, deleted:4 });
  assert.equal(executed.includes("DELETE FROM analytics_events"), true);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test("каталог без готового файла отдаёт заготовку приложения, а не 404", async () => {
  // Каталог и его разделы собирает сервер по данным базы; на статическом хостинге его
  // нет, и своего файла у `/catalog` тоже нет. Заготовка приложения показывает выдачу
  // по API — иначе главная страница каталога отвечала бы «страница не найдена».
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/catalog/byd", { headers:{ accept:"text/html" } }), {
    ASSETS: {
      fetch: async (request) => {
        const url = new URL(request.url);
        calls.push(url.pathname);
        return new Response(url.pathname === "/app-shell.html" ? "shell" : "missing", {
          status: url.pathname === "/app-shell.html" ? 200 : 404,
          headers: { "content-type":"text/html" },
        });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "shell");
  assert.deepEqual(calls, ["/catalog/byd", "/catalog/byd/index.html", "/app-shell.html"]);
});

test("старый адрес «О нас» перебрасывается на «О сервисе»", async () => {
  // Страницы `/about` больше нет: её заголовок дублировал `/how-it-works`, содержимое
  // перенесено туда. Без переброса адрес отвечал бы «страницы нет» — и старые ссылки,
  // и то, что уже попало в индекс поисковика, вели бы в пустоту.
  for (const path of ["/about", "/about/"]) {
    const response = await worker.fetch(new Request(`https://example.test${path}`, { headers: { accept: "text/html" } }), {
      ASSETS: { fetch: async () => new Response("не должно вызываться", { status: 200 }) },
    });
    assert.equal(response.status, 301);
    assert.equal(new URL(response.headers.get("location")).pathname, "/how-it-works");
  }
});

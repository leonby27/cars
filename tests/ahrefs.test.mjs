import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const snippet = html.match(/<script id="ahrefs-analytics">([\s\S]*?)<\/script>/)[1];

function visit(url = "https://abcars.by/catalog", { staff = false, webdriver = false, userAgent = "Mozilla/5.0", storageDenied = false } = {}) {
  const storage = new Map(staff ? [["nocount", "1"]] : []);
  const tags = [], events = [], attributes = new Map();
  const tag = {
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
  };
  const window = { location: new URL(url) };
  const document = { createElement: () => tag, head: { appendChild: (node) => tags.push(node) } };
  window.document = document;
  const localStorage = {
    getItem: (key) => { if (storageDenied) throw Error("denied"); return storage.get(key); },
    setItem: (key, value) => { if (storageDenied) throw Error("denied"); storage.set(key, value); },
    removeItem: (key) => { if (storageDenied) throw Error("denied"); storage.delete(key); },
  };
  runInNewContext(snippet, { window, document, location:window.location, localStorage, navigator:{ webdriver, userAgent }, URL, URLSearchParams, setTimeout:() => 1, clearTimeout:() => {} });
  const loaded = () => {
    window.AhrefsAnalytics = { sendEvent: (event) => {
      if (attributes.has("data-key")) events.push([event, attributes.get("data-page-location") || window.location.href]);
    } };
    tag.onload();
  };
  return { window, tags, tag, attributes, events, storage, loaded };
}

test("Ahrefs excludes private pages, local/other hosts, staff and automated visits", () => {
  for (const path of ["/analytics", "/analytics/", "/analytics/leads", "/partner", "/partner/requests"]) {
    assert.equal(visit(`https://abcars.by${path}`).window.__ahrefs, undefined, path);
  }
  for (const url of ["http://localhost:5173/", "http://127.0.0.1/", "http://192.168.1.20/", "https://abdrive.ru/", "https://abcars.by/?nocount=1"]) {
    assert.equal(visit(url).window.__ahrefs, undefined, url);
  }
  for (const options of [{ staff:true }, { webdriver:true }, { userAgent:"Googlebot" }]) {
    assert.equal(visit(undefined, options).window.__ahrefs, undefined);
  }
  assert.equal(visit("https://abcars.by/?nocount=1", { storageDenied:true }).window.__ahrefs, undefined);
  assert.ok(visit("https://abcars.by/?nocount=0", { staff:true }).window.__ahrefs);
  assert.ok(visit(undefined, { storageDenied:true }).window.__ahrefs);
});

test("Ahrefs installation crawler sees the script before app startup without counting its visit", () => {
  for (const webdriver of [false, true]) {
    const v = visit(undefined, { userAgent:"Mozilla/5.0 AhrefsSiteAudit/6.1", webdriver });
    assert.equal(v.tags.length, 1);
    assert.equal(v.tag.src, "https://analytics.ahrefs.com/analytics.js");
    assert.equal(v.attributes.get("data-key"), "16RCGn4NpXO0+Xwtz04U7Q");
    assert.ok(v.attributes.has("data-no-pageview-auto"));
    assert.equal(v.window.__ahrefs, undefined);
    assert.equal(v.window.__counterQueue, undefined);
    assert.deepEqual(v.events, []);
  }
  for (const path of ["/analytics", "/partner"]) {
    assert.equal(visit(`https://abcars.by${path}`, { userAgent:"AhrefsSiteAudit/6.1" }).tags.length, 0);
  }
});

test("Ahrefs preserves queued views and counts each SPA/quick-view address once", async () => {
  const v = visit();
  assert.equal(v.tags.length, 0, "counter must wait for the app");
  v.window.__ahrefs.view("/cars/123");
  v.window.__ahrefs.view("/cars/123");
  const started = v.window.__counterQueue[0]();
  assert.equal(v.tags.length, 1);
  assert.equal(v.tag.src, "https://analytics.ahrefs.com/analytics.js");
  assert.equal(v.tag.async, true);
  assert.equal(v.attributes.get("data-key"), "16RCGn4NpXO0+Xwtz04U7Q");
  assert.ok(v.attributes.has("data-no-pageview-auto"));
  v.loaded();
  await started;
  assert.deepEqual(v.events, [["pageview", "https://abcars.by/catalog"], ["pageview", "https://abcars.by/cars/123"]]);
  v.window.__ahrefs.view("/cars/456");
  v.window.__ahrefs.view("/partner/requests");
  assert.equal(v.events.length, 3);
  assert.equal(v.attributes.has("data-page-location"), false, "automatic clicks must use the current URL");
});

test("entering a private page cancels queued Ahrefs views and disables automatic events", async () => {
  for (const path of ["/analytics", "/partner"]) {
    const before = visit();
    before.window.location.href = `https://abcars.by${path}`;
    await before.window.__counterQueue[0]();
    assert.equal(before.tags.length, 0);
    assert.equal(before.attributes.has("data-key"), false);

    const loading = visit();
    const started = loading.window.__counterQueue[0]();
    loading.window.location.href = `https://abcars.by${path}`;
    loading.loaded();
    await started;
    assert.deepEqual(loading.events, []);
    assert.equal(loading.attributes.has("data-key"), false);
  }
  const v = visit();
  const started = v.window.__counterQueue[0]();
  v.loaded();
  await started;
  v.window.__ahrefs.stop();
  v.window.__ahrefs.view("/cars/456");
  v.window.AhrefsAnalytics.sendEvent("x-link-click");
  assert.equal(v.events.length, 1);
  assert.equal(v.attributes.has("data-key"), false);
});

test("shared navigation sends Ahrefs views and stops it alongside the existing counters", async () => {
  const views = [];
  let stopped = false;
  globalThis.window = {
    location:{ href:"https://abcars.by/catalog", pathname:"/catalog" },
    __ahrefs:{ view:(url) => views.push(url), stop:() => { stopped = true; } },
  };
  try {
    const { trackMetrikaView, stopMetrika } = await import("../src/analytics.js");
    trackMetrikaView("/cars/123");
    trackMetrikaView("/analytics");
    trackMetrikaView("/partner");
    assert.deepEqual(views, ["https://abcars.by/cars/123"]);
    stopMetrika();
    assert.equal(stopped, true);
  } finally { delete globalThis.window; }
});

test("security headers allow both the Ahrefs script and event requests", () => {
  const nginx = readFileSync(new URL("../deploy/nginx-abcars-headers.conf", import.meta.url), "utf8");
  const csp = nginx.match(/add_header Content-Security-Policy "([^"]+)"/)[1];
  for (const name of ["script-src", "connect-src"]) {
    const rule = csp.split(";").find((part) => part.trim().startsWith(`${name} `));
    assert.ok(rule.split(" ").includes("https://analytics.ahrefs.com"), name);
  }
});

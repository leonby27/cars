// All requests are intercepted; no production analytics or database is touched.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const browser = await chromium.launch({ headless:true });
let cases = 0;
try {
  for (const mode of ["webdriver", "headless-hints", "pointer", "keyboard", "wheel", "touch"]) {
    const requests = [];
    const context = await browser.newContext({ userAgent:"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36", hasTouch:true });
    try {
      await context.addInitScript((mode) => {
        Object.defineProperty(navigator, "webdriver", { get:() => mode === "webdriver" });
        Object.defineProperty(navigator, "userAgentData", { get:() => mode === "headless-hints" ? { brands:[{ brand:"HeadlessChrome", version:"145" }] } : undefined });
      }, mode);
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        assert.equal(url.hostname, "abcars.by");
        if (url.pathname.startsWith("/api/analytics/")) {
          requests.push({ path:url.pathname, body:route.request().postDataJSON() });
          return route.fulfill({ json:{ ok:true, recorded:true, confirmed:1 } });
        }
        if (/^\/src\/[a-z-]+\.js$/.test(url.pathname)) return route.fulfill({ contentType:"text/javascript", body:await readFile(new URL(`..${url.pathname}`, import.meta.url), "utf8") });
        if (url.pathname === "/catalog/mg/hs") return route.fulfill({ contentType:"text/html", body:`<!doctype html><body style="height:4000px"><button>Каталог</button><script type="module">import {trackEvent} from '/src/analytics.js'; trackEvent('page_view'); window.ready=true;</script>` });
        throw new Error(`Unexpected request: ${url}`);
      });
      const page = await context.newPage();
      const recorded = ["webdriver", "headless-hints"].includes(mode) ? null
        : page.waitForResponse((response) => response.url().endsWith("/events"));
      await page.goto("https://abcars.by/catalog/mg/hs?body=Кабриолет&body=Седан");
      await page.waitForFunction(() => window.ready);
      if (recorded) await recorded;
      await page.evaluate(async () => {
        for (const type of ["pointermove", "pointerdown", "touchstart", "keydown", "wheel", "click", "scroll"]) window.dispatchEvent(new Event(type));
        window.scrollTo(0, 100);
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      });
      const actions = () => requests.filter((r) => r.path.endsWith("/human") && r.body.action === true);
      assert.equal(actions().length, 0, `${mode}: script events must not count as actions`);
      if (["webdriver", "headless-hints"].includes(mode)) {
        assert.equal(requests.length, 0, `${mode}: clear automation is excluded`);
      } else {
        assert.equal(requests.filter((r) => r.path.endsWith("/events")).length, 1, "an empty filtered entry remains recorded");
        const confirmed = page.waitForResponse((response) => response.url().endsWith("/human") && response.request().postDataJSON().action === true);
        if (mode === "pointer") await page.mouse.move(150, 150);
        if (mode === "keyboard") await page.keyboard.press("Tab");
        if (mode === "wheel") await page.mouse.wheel(0, 150);
        if (mode === "touch") await page.touchscreen.tap(100, 100);
        await confirmed;
        assert.equal(actions().length, 1, `${mode}: trusted input confirms the visitor`);
      }
      cases++;
    } finally { await context.close(); }
  }
  console.log(`Analytics browser verification passed: ${cases} cases; no external requests.`);
} finally { await browser.close(); }

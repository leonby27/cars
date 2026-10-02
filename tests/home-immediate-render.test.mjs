import assert from "node:assert/strict";
import test from "node:test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { homeBootFromSnapshot } from "../src/home-boot.js";

test("home snapshot preserves saved cards/counts and accepts older builds", () => {
  const models = [{ name: "BYD Han", count: 12 }];
  const car = { id: "che168-1", title: "BYD Han" };
  assert.deepEqual(homeBootFromSnapshot({ models, showcase: [car], catalogFacts: { total: 125, updatedAt: "2026-10-01" } }), {
    popularModels: models, brandModelTabs: [], homeShowcase: [car], catalogFacts: { total: 125, updatedAt: "2026-10-01" },
  });
  assert.deepEqual(homeBootFromSnapshot(models), { popularModels: models, brandModelTabs: [], homeShowcase: [] });
  for (const saved of [null, {}, { models: {}, catalogFacts: { total: "unknown" } }]) assert.deepEqual(homeBootFromSnapshot(saved), {});
});

// Run the actual page handler with a renderer that reads its boot snapshot and
// a database/API replay that fails if touched. No real database or shared dist.
async function fixture(t, saved) {
  const dir = await mkdtemp(join(tmpdir(), "abcars-home-immediate-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const sub of ["server", "src", "dist/client/how-it-works"]) await mkdir(join(dir, sub), { recursive: true });
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  for (const file of ["server/static-page.mjs", "server/root-inject.mjs", "src/home-boot.js", "src/tracking-params.js"]) {
    await copyFile(new URL(`../${file}`, import.meta.url), join(dir, file));
  }
  const stubs = {
    "server/app-render.mjs": `export const loadEntryServer = async () => ({ renderStaticApp(path, search, boot) {
      const query = new URLSearchParams(search).get('q') || '';
      return '<main><h1>Автомобили</h1><input value="' + query + '"><span>' + (boot.catalogFacts?.total || '') + '</span>' +
        (boot.homeShowcase?.length ? '<a href="/cars/1">Сохранённая машина</a>' : '<div class="skeleton-card"></div>') + '</main>';
    }});`,
    "server/repository.mjs": `export let reads = 0; export const listCars = async () => { reads++; throw new Error('database unavailable'); };`,
    "server/api-replay.mjs": `export let reads = 0; export const renderWithApi = async () => { reads++; throw new Error('live API must not delay home'); };`,
    "src/blog-posts.js": "export const findBlogPost = () => null;",
    "src/blog-texts.js": "export const BLOG_TEXTS = {};",
    "src/tool-pages.js": "export const findToolPage = () => null;",
    "src/tool-page-texts.js": "export const TOOL_PAGE_TEXTS = {};",
  };
  for (const [file, source] of Object.entries(stubs)) await writeFile(join(dir, file), source);
  const shell = '<html><head></head><body><div id="root" data-prerender="/"><main><h1>Автомобили</h1><div class="skeleton-card"></div></main></div></body></html>';
  await writeFile(join(dir, "dist/client/index.html"), shell);
  if (saved !== undefined) await writeFile(join(dir, "dist/popular-models.json"), saved);
  return {
    ...(await import(pathToFileURL(join(dir, "server/static-page.mjs")))),
    repository: await import(pathToFileURL(join(dir, "server/repository.mjs"))),
    replay: await import(pathToFileURL(join(dir, "server/api-replay.mjs"))),
  };
}

test("home, including tracking and search links, never waits for live data", async (t) => {
  const app = await fixture(t, JSON.stringify({ showcase: [{ id: "1" }], catalogFacts: { total: 123, updatedAt: "2026-10-01" } }));
  for (const search of ["", "utm_source=test", "q=byd&utm_source=test"]) {
    const page = await app.renderStaticPage("/", search);
    assert.equal(page.status, 200);
    assert.match(page.html, /<h1>Автомобили<\/h1>/);
    assert.match(page.html, /href="\/cars\/1"/);
    assert.match(page.html, /<span>123<\/span>/);
    assert.match(page.html, /"catalogFacts":\{"total":123/);
    if (search.includes("q=")) assert.match(page.html, /value="byd"/);
  }
  assert.equal(app.repository.reads, 0);
  assert.equal(app.replay.reads, 0);
});

test("missing or damaged snapshot keeps the page and local skeletons", async (t) => {
  for (const saved of [undefined, "broken json"]) {
    const app = await fixture(t, saved);
    const page = await app.renderStaticPage("/");
    assert.equal(page.status, 200);
    assert.match(page.html, /<h1>Автомобили<\/h1>/);
    assert.match(page.html, /skeleton-card/);
    assert.equal(app.repository.reads, 0);
    assert.equal(app.replay.reads, 0);
  }
});

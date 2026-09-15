import assert from "node:assert/strict";
import test from "node:test";
import { prepareServiceVideo } from "../src/service-video-loading.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup({ scrollY = 0, saveData = false, reducedMotion = false } = {}) {
  const win = new EventTarget();
  const video = new EventTarget();
  const timers = new Set();
  let resolveDownload;
  const state = { fetches: 0, ready: 0, revoked: [], signal: null };
  Object.assign(win, {
    scrollY, navigator: { connection: { saveData } },
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout: (fn) => { timers.add(fn); return fn; },
    clearTimeout: (fn) => timers.delete(fn),
    URL: { createObjectURL: () => "blob:film", revokeObjectURL: (url) => state.revoked.push(url) },
    fetch: (_url, { signal }) => {
      state.fetches++;
      state.signal = signal;
      return Promise.resolve({ ok: true, blob: () => new Promise((resolve) => { resolveDownload = resolve; }) });
    },
  });
  Object.assign(video, { pause() {}, load() {}, removeAttribute(name) { delete this[name]; } });
  const cancel = prepareServiceVideo({ video, poster: { decode: () => Promise.resolve() }, source: "/film.mp4",
    win, onReady: () => state.ready++ });
  return { win, video, state, cancel, timers, finish: () => resolveDownload(new Blob(["film"])) };
}

test("film activates only after the whole download and opening frame are ready", async () => {
  const h = setup();
  await flush();
  assert.equal(h.state.fetches, 1);
  assert.equal(h.video.src, undefined);
  assert.equal(h.state.ready, 0);
  h.finish();
  await flush();
  assert.equal(h.video.src, "blob:film");
  assert.equal(h.state.ready, 0);
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.ready, 1);
  h.win.scrollY = 500;
  h.win.dispatchEvent(new Event("scroll"));
  assert.equal(h.state.signal.aborted, false, "normal scrubbing keeps the prepared film");
  h.cancel();
  assert.deepEqual(h.state.revoked, ["blob:film"]);
});

test("scrolling during download keeps static layout even if the download finishes later", async () => {
  const h = setup();
  await flush();
  h.win.scrollY = 100;
  h.win.dispatchEvent(new Event("scroll"));
  assert.equal(h.state.signal.aborted, true);
  h.win.scrollY = 0;
  h.finish();
  await flush();
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.ready, 0);
  assert.equal(h.video.src, undefined);
});

test("scrolling while the opening frame decodes also cancels activation", async () => {
  const h = setup();
  await flush();
  h.finish();
  await flush();
  h.win.scrollY = 40;
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.ready, 0);
  assert.deepEqual(h.state.revoked, ["blob:film"]);
});

test("a slow download times out without enabling the pinned scene", async () => {
  const h = setup();
  await flush();
  for (const timer of [...h.timers]) timer();
  assert.equal(h.state.signal.aborted, true);
  h.finish();
  await flush();
  assert.equal(h.state.ready, 0);
  assert.equal(h.timers.size, 0);
});

test("decode failures keep the poster and release the video", async () => {
  const h = setup();
  await flush();
  h.finish();
  await flush();
  h.video.dispatchEvent(new Event("error"));
  assert.equal(h.state.ready, 0);
  assert.equal(h.video.src, undefined);
  assert.deepEqual(h.state.revoked, ["blob:film"]);
});

for (const options of [{ scrollY: 400 }, { saveData: true }, { reducedMotion: true }]) {
  test(`static preference avoids downloading video: ${JSON.stringify(options)}`, async () => {
    const h = setup(options);
    await flush();
    assert.equal(h.state.fetches, 0);
    assert.equal(h.state.ready, 0);
    h.cancel();
  });
}

test("unmount cancels in-flight work and prevents late activation", async () => {
  const h = setup();
  await flush();
  h.cancel();
  h.finish();
  await flush();
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.ready, 0);
  assert.equal(h.video.src, undefined);
});

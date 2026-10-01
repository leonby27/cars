import assert from "node:assert/strict";
import test from "node:test";
import { prepareServiceVideo } from "../src/service-video-loading.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup({ scrollY = 0, saveData = false, reducedMotion = false, stream = false } = {}) {
  const win = new EventTarget();
  const video = new EventTarget();
  let resolveDownload;
  const state = { fetches: 0, ready: 0, unavailable: 0, progress: [], revoked: [], signal: null };
  Object.assign(win, {
    scrollY, navigator: { connection: { saveData } },
    matchMedia: () => ({ matches: reducedMotion }),
    URL: { createObjectURL: () => "blob:film", revokeObjectURL: (url) => state.revoked.push(url) },
    fetch: (_url, { signal }) => {
      state.fetches++;
      state.signal = signal;
      if (stream) {
        const parts = [new Uint8Array(4), new Uint8Array(4)];
        return Promise.resolve({ ok: true, headers: { get: (key) => key === "content-length" ? "8" : "video/mp4" },
          body: { getReader: () => ({ read: async () => parts.length ? { done: false, value: parts.shift() } : { done: true } }) } });
      }
      return Promise.resolve({ ok: true, blob: () => new Promise((resolve) => { resolveDownload = resolve; }) });
    },
  });
  Object.assign(video, { pause() {}, load() {}, removeAttribute(name) { delete this[name]; } });
  const cancel = prepareServiceVideo({ video, poster: { decode: () => Promise.resolve() }, source: "/film.mp4",
    win, onReady: () => state.ready++, onUnavailable: () => state.unavailable++, onProgress: (value) => state.progress.push(value) });
  return { win, video, state, cancel, finish: () => resolveDownload(new Blob(["film"])) };
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

test("scrolling during download does not prevent the film from appearing", async () => {
  const h = setup();
  await flush();
  h.win.scrollY = 100;
  h.win.dispatchEvent(new Event("scroll"));
  assert.equal(h.state.signal.aborted, false);
  h.finish();
  await flush();
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.ready, 1);
  assert.equal(h.video.src, "blob:film");
  h.cancel();
});

test("scrolling while the opening frame decodes still activates the film", async () => {
  const h = setup();
  await flush();
  h.finish();
  await flush();
  h.win.scrollY = 40;
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.ready, 1);
  h.cancel();
  assert.deepEqual(h.state.revoked, ["blob:film"]);
});

test("a slow download keeps waiting for the film", async () => {
  const h = setup();
  await flush();
  assert.equal(h.state.signal.aborted, false);
  h.finish();
  await flush();
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.ready, 1);
  h.cancel();
});

test("the line follows received bytes and finishes after the opening frame", async () => {
  const h = setup({ stream: true });
  await flush();
  assert.deepEqual(h.state.progress, [0.48, 0.96]);
  assert.equal(h.state.ready, 0);
  h.video.dispatchEvent(new Event("loadeddata"));
  assert.equal(h.state.progress.at(-1), 1);
  assert.equal(h.state.ready, 1);
  h.cancel();
});

test("decode failures keep the poster and release the video", async () => {
  const h = setup();
  await flush();
  h.finish();
  await flush();
  h.video.dispatchEvent(new Event("error"));
  assert.equal(h.state.ready, 0);
  assert.equal(h.state.unavailable, 1);
  assert.equal(h.video.src, undefined);
  assert.deepEqual(h.state.revoked, ["blob:film"]);
});

for (const options of [{ saveData: true }, { reducedMotion: true }]) {
  test(`static preference avoids downloading video: ${JSON.stringify(options)}`, async () => {
    const h = setup(options);
    await flush();
    assert.equal(h.state.fetches, 0);
    assert.equal(h.state.ready, 0);
    assert.equal(h.state.unavailable, 1);
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

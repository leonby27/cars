import test from "node:test";
import assert from "node:assert/strict";
import { bindModalViewport } from "../src/modal-viewport.js";

function events(target = {}) {
  const listeners = new Map();
  return Object.assign(target, {
    listeners,
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    fire(name) { for (const fn of listeners.get(name) || []) fn(); },
  });
}

function setup({ mobile = true, withViewport = true } = {}) {
  const frames = new Map();
  let id = 0;
  const viewport = events({ height: 800, offsetTop: 0 });
  const media = events({ matches: mobile });
  const view = events({
    innerHeight: 800,
    visualViewport: withViewport ? viewport : undefined,
    matchMedia: () => media,
    requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key) { frames.delete(key); },
  });
  const properties = new Map();
  const document = { activeElement: null };
  const backdrop = events({
    ownerDocument: document,
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
    },
  });
  const field = {
    top: 200, bottom: 246,
    matches: () => true,
    getBoundingClientRect() { return { top: this.top, bottom: this.bottom }; },
  };
  const scroller = {
    scrollTop: 0,
    top: 100, bottom: 700,
    contains: (target) => target === field,
    getBoundingClientRect() { return { top: this.top, bottom: this.bottom }; },
  };
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn());
  };
  const dispose = bindModalViewport(backdrop, scroller, view);
  return { view, viewport, media, backdrop, scroller, field, document, properties, frames, flush, dispose };
}

test("keyboard opening and Safari viewport shifts keep the focused field inside the scrolling form", () => {
  const state = setup();
  state.document.activeElement = state.field;
  state.viewport.height = 380;
  state.viewport.offsetTop = 120;
  state.scroller.top = 180;
  state.scroller.bottom = 310;
  state.field.top = 320;
  state.field.bottom = 366;
  state.viewport.fire("resize");
  state.viewport.fire("scroll");
  assert.equal(state.frames.size, 1, "viewport events share one layout update");
  state.flush();
  assert.equal(state.properties.get("--modal-viewport-height"), "380px");
  assert.equal(state.properties.get("--modal-viewport-top"), "120px");
  assert.equal(state.scroller.scrollTop, 64);

  state.document.activeElement = null;
  state.viewport.height = 800;
  state.viewport.offsetTop = 0;
  state.viewport.fire("resize");
  state.flush();
  assert.equal(state.properties.get("--modal-viewport-height"), "800px");
  assert.equal(state.properties.get("--modal-viewport-top"), "0px");
  assert.equal(state.scroller.scrollTop, 64, "closing the keyboard preserves the form position");
  state.dispose();
});

test("switching to an earlier field reveals it without resetting the whole form", () => {
  const state = setup();
  state.scroller.scrollTop = 220;
  state.field.top = 50;
  state.field.bottom = 96;
  state.document.activeElement = state.field;
  state.backdrop.fire("focusin");
  state.flush();
  assert.equal(state.scroller.scrollTop, 162);
  state.field.top = 120;
  state.field.bottom = 166;
  state.backdrop.fire("focusin");
  state.flush();
  assert.equal(state.scroller.scrollTop, 162, "an already visible field does not move");
  state.dispose();
});

test("desktop and unrelated focus do not move the form; resizing works without VisualViewport", () => {
  const desktop = setup({ mobile: false });
  desktop.document.activeElement = desktop.field;
  desktop.field.bottom = 1000;
  desktop.backdrop.fire("focusin");
  desktop.flush();
  assert.equal(desktop.scroller.scrollTop, 0);
  assert.equal(desktop.properties.size, 0);
  desktop.dispose();

  const fallback = setup({ withViewport: false });
  fallback.document.activeElement = {};
  fallback.view.innerHeight = 400;
  fallback.view.fire("resize");
  fallback.flush();
  assert.equal(fallback.properties.get("--modal-viewport-height"), "400px");
  assert.equal(fallback.scroller.scrollTop, 0);
  fallback.media.matches = false;
  fallback.media.fire("change");
  fallback.flush();
  assert.equal(fallback.properties.size, 0);
  fallback.dispose();
});

test("closing removes listeners, pending updates and viewport overrides", () => {
  const state = setup();
  state.viewport.fire("resize");
  state.dispose();
  assert.equal(state.frames.size, 0);
  assert.equal(state.properties.size, 0);
  for (const target of [state.viewport, state.view, state.media, state.backdrop]) {
    for (const listeners of target.listeners.values()) assert.equal(listeners.size, 0);
  }
  state.viewport.fire("resize");
  state.backdrop.fire("focusin");
  assert.equal(state.frames.size, 0);
});

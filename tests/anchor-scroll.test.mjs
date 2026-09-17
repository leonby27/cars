import test from "node:test";
import assert from "node:assert/strict";
import { holdAnchor } from "../src/anchor-scroll.js";

const fakeView = () => {
  const timers = [];
  const listeners = new Map();
  return {
    timers,
    listeners,
    setTimeout: (fn, delay) => { timers.push({ fn, delay, cleared:false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    addEventListener: (name, fn) => { listeners.set(name, [...(listeners.get(name) || []), fn]); },
    removeEventListener: (name, fn) => { listeners.set(name, (listeners.get(name) || []).filter((item) => item !== fn)); },
    fire: (name) => { for (const fn of listeners.get(name) || []) fn(); },
    run: () => { for (const timer of timers) if (!timer.cleared) timer.fn(); },
  };
};
const fakeTarget = () => {
  const target = { calls:0 };
  target.scrollIntoView = () => { target.calls += 1; };
  return target;
};

test("к якорю возвращаемся, пока страница достраивается", () => {
  const view = fakeView();
  const target = fakeTarget();
  holdAnchor(target, view);
  assert.equal(target.calls, 1, "сразу встаём на якорь");
  assert.ok(view.timers.length >= 4, "повторы расставлены");
  view.run();
  assert.equal(target.calls, 1 + view.timers.length);
  view.fire("load");
  assert.equal(target.calls, 2 + view.timers.length);
});

test("как только человек прокрутил сам, страница его не дёргает", () => {
  for (const event of ["wheel", "touchmove", "keydown", "mousedown"]) {
    const view = fakeView();
    const target = fakeTarget();
    holdAnchor(target, view);
    view.fire(event);
    view.run();
    view.fire("load");
    assert.equal(target.calls, 1, `после «${event}» повторов быть не должно`);
  }
});

test("уход со страницы снимает повторы и подписки", () => {
  const view = fakeView();
  const target = fakeTarget();
  holdAnchor(target, view)();
  view.run();
  view.fire("load");
  assert.equal(target.calls, 1);
  for (const [, fns] of view.listeners) assert.deepEqual(fns, []);
});

test("без блока и без окна ничего не ломается", () => {
  assert.doesNotThrow(() => holdAnchor(null, fakeView())());
  assert.doesNotThrow(() => holdAnchor(fakeTarget(), null)());
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHoverPhotoQueue, observeHoverPhotos } from "../src/hover-photo-queue.js";

function setup(concurrency = 2) {
  const images = [];
  const request = createHoverPhotoQueue({ concurrency, createImage: () => {
    const image = { decode: async () => {} };
    images.push(image);
    return image;
  } });
  const finish = async index => { await images[index].onload(); };
  return { request, images, finish };
}

test("очередь ограничивает загрузки всего каталога и переиспользует готовые кадры", async () => {
  const { request, images, finish } = setup();
  const a = request("a"), b = request("b"), c = request("c");
  assert.equal(images.length, 2);
  assert.equal(request("a"), a);
  await finish(0);
  assert.equal(images.length, 3);
  await finish(1); await finish(2);
  assert.deepEqual(await Promise.all([a,b,c]), [true,true,true]);
  assert.equal(await request("a"), true);
  assert.equal(images.length, 3);
});

test("кадр под курсором опережает фоновые запросы и получает высокий приоритет", async () => {
  const { request, images, finish } = setup(1);
  const a = request("a"), b = request("b"), c = request("c");
  request("c", { urgent: true });
  await finish(0);
  assert.equal(images[1].src, "c");
  assert.equal(images[1].fetchPriority, "high");
  await finish(1); await finish(2);
  await Promise.all([a,b,c]);
});

test("фото ушедшей с экрана карточки не начинает скачиваться", async () => {
  const { request, images, finish } = setup(1);
  const a = request("a");
  const controller = new AbortController();
  const b = request("b", { signal: controller.signal });
  controller.abort();
  await finish(0);
  assert.equal(await a, true);
  assert.equal(await b, false);
  assert.equal(images.length, 1);
});

test("кадр готов к переключению после декодирования; ошибка освобождает очередь", async () => {
  const { request, images, finish } = setup(1);
  let decoded;
  const a = request("a");
  images[0].decode = () => new Promise(resolve => { decoded = resolve; });
  let ready = false;
  a.then(() => { ready = true; });
  const loaded = finish(0);
  await Promise.resolve();
  assert.equal(ready, false);
  decoded(); await loaded;
  assert.equal(await a, true);
  const b = request("b");
  images[1].onerror();
  assert.equal(await b, false);
  const retry = request("b");
  await finish(2);
  assert.equal(await retry, true);
});

test("фон оставляет свободное место: выбранное фото начинает загружаться сразу", async () => {
  const images = [];
  const request = createHoverPhotoQueue({ concurrency: 4, reserveUrgent: 1, createImage: () => {
    const image = { decode: async () => {} }; images.push(image); return image;
  } });
  const pending = ["a", "b", "c", "d"].map(href => request(href));
  assert.equal(images.length, 3);
  pending.push(request("selected", { urgent: true }));
  assert.equal(images.length, 4);
  assert.equal(images[3].src, "selected");
  for (let i = 0; i < images.length; i++) await images[i].onload();
  assert.deepEqual(await Promise.all(pending), [true,true,true,true,true]);
});

test("видимая карточка обгоняет ещё не дошедшие до экрана", async () => {
  const { request, images, finish } = setup(1);
  const pending = [request("current"), request("far"), request("visible")];
  request("visible", { priority: 1 });
  await finish(0);
  assert.equal(images[1].src, "visible");
  await finish(1); await finish(2);
  await Promise.all(pending);
});

test("каталог заранее готовит обложку и кадры, повышает приоритет на экране и отменяет после ухода", () => {
  const observers = [], calls = [];
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); }
    observe() {}
    disconnect() { this.closed = true; }
  }
  const stop = observeHoverPhotos({}, ["cover", "second"], { ahead: 1200, Observer, prepare: (href, options) => calls.push({ href, ...options }) });
  assert.equal(observers[0].options.rootMargin, "1200px 0px");
  observers[0].callback([{ isIntersecting: true }]);
  assert.deepEqual(calls.map(call => call.href), ["cover", "second"]);
  observers[1].callback([{ isIntersecting: true }]);
  assert.equal(calls[2].priority, 1);
  observers[0].callback([{ isIntersecting: false }]);
  assert.ok(calls.every(call => call.signal.aborted));
  stop();
  assert.ok(observers.every(observer => observer.closed));
});

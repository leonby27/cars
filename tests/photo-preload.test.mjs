import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as pause } from "node:timers/promises";
import { bindPhotoIntent, createPhotoPreloader } from "../src/photo-preload.js";

const fixture = (connection = () => null) => {
  const images = [];
  const preload = createPhotoPreloader({ connection, createImage: () => {
    const image = { decode: async () => {} };
    images.push(image);
    return image;
  } });
  return { images, preload };
};

test("открытие повышает приоритет уже начатого оригинала без второго запроса", () => {
  const { preload, images } = fixture();
  const image = preload("/photo/cover.webp");
  assert.equal(image.fetchPriority, "low");
  assert.equal(preload("/photo/cover.webp", true), image);
  assert.equal(image.fetchPriority, "high");
  assert.equal(images.length, 1);
});

test("при экономии трафика и 2G нет фоновой загрузки, но открытие работает", () => {
  for (const connection of [{ saveData: true }, { effectiveType: "2g" }, { effectiveType: "slow-2g" }]) {
    const { preload, images } = fixture(() => connection);
    assert.equal(preload("/photo/a.webp"), null);
    assert.equal(images.length, 0);
    assert.ok(preload("/photo/a.webp", true));
  }
});

test("быстрое движение по каталогу не создаёт очередь оригиналов; ошибка допускает повтор", () => {
  const { preload, images } = fixture();
  const a = preload("a");
  preload("b");
  assert.equal(preload("c"), null);
  assert.equal(images.length, 2);
  a.onerror();
  assert.ok(preload("a"));
  images[1].onload();
  assert.ok(preload("c"));
});

test("декодирование начинается после загрузки, сохранённые кадры ограничены", () => {
  const { preload } = fixture();
  let decoded = false;
  const first = preload("0");
  first.decode = async () => { decoded = true; };
  first.onload();
  assert.equal(decoded, true);
  for (let i = 1; i <= 24; i++) preload(String(i)).onload();
  assert.notEqual(preload("0"), first);
});

const pointer = (type, pointerType = "mouse") => Object.assign(new Event(type), { pointerType, button: 0 });

test("намерение открыть: задержка наведения, отмена при уходе, немедленное касание", async () => {
  const target = new EventTarget();
  const calls = [];
  const unbind = bindPhotoIntent(target, "cover", { delay: 10, preload: (...args) => calls.push(args) });
  target.dispatchEvent(pointer("pointerenter"));
  target.dispatchEvent(pointer("pointerleave"));
  await pause(20);
  assert.equal(calls.length, 0);
  target.dispatchEvent(pointer("pointerenter", "touch"));
  await pause(20);
  assert.equal(calls.length, 0);
  target.dispatchEvent(pointer("pointerenter"));
  await pause(20);
  assert.deepEqual(calls, [["cover"]]);
  target.dispatchEvent(pointer("pointerdown", "touch"));
  assert.deepEqual(calls.at(-1), ["cover", true]);
  target.dispatchEvent(pointer("pointerenter"));
  unbind();
  target.dispatchEvent(new Event("focusin"));
  await pause(20);
  assert.equal(calls.length, 2);
});

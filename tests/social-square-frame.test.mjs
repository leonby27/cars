// Кадры для лент должны быть одинаковыми квадратами: Instagram подгоняет всю
// галерею под пропорции первого снимка и разнобой режет по своему усмотрению.
// Здесь проверяется и выбор исходника (крупный у источника, диск — запасной),
// и сам квадрат.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "social-frame-"));
process.env.ABCARS_MEDIA_ROOT = path.join(tmp, "media");

const { bestSource, FRAME_SHAPES, prepareFrames } = await import("../scripts/lib/photo-local.mjs");

const photo = "https://erscglobal2.autoimg.cn/escimg/auto/g33/M02/4D/77/600x0_c42_car.jpg.webp";
const silent = () => {};

function withFetch(handler, body) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  return body().finally(() => { globalThis.fetch = real; });
}

test("исходник берётся у источника в крупном размере", () =>
  withFetch(async (url) => {
    assert.match(String(url), /\/1440x0_car\.jpg$/);
    assert.doesNotMatch(String(url), /webp/);
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }, async () => {
    const raw = path.join(tmp, "raw.jpg");
    assert.equal(await bestSource(photo, raw, { log: silent }), raw);
  }));

// Адреса из карточки оканчиваются на «.webp», а на диске имя ровно такое же.
// Пока код дописывал окончание второй раз, файл не находился никогда, и кадры
// молча шли в обход диска — эта проверка стоит именно за тем.
test("когда источник молчит, кадр берётся с диска", async () => {
  const stored = path.join(process.env.ABCARS_MEDIA_ROOT, "photo", "escimg/auto/g33/M02/4D/77/600x0_c42_car.jpg.webp");
  await fs.mkdir(path.dirname(stored), { recursive: true });
  await fs.writeFile(stored, "кадр");
  await withFetch(async () => { throw new Error("источник недоступен"); }, async () => {
    assert.equal(await bestSource(photo, path.join(tmp, "raw2.jpg"), { log: silent }), stored);
  });
});

// Ниже нужен Pillow: на сервере он есть, на чужом ноутбуке может не быть.
const hasPillow = await run("python3", ["-c", "import PIL"]).then(() => true, () => false);

test("кадр 4:3 становится нужной формой: целиком с полосами или обрезанным", { skip: hasPillow ? false : "нет Pillow" }, async () => {
  const src = path.join(tmp, "wide.jpg");
  await run("python3", ["-c", `from PIL import Image; Image.new("RGB",(1024,768),(200,30,40)).save(${JSON.stringify(src)})`]);
  for (const shape of Object.keys(FRAME_SHAPES)) {
    const [expectedW, expectedH] = FRAME_SHAPES[shape];
    for (const mode of ["fit", "crop"]) {
      const out = path.join(tmp, `${shape}-${mode}.jpg`);
      await run("python3", ["scripts/photo-to-social.py", src, out, mode, shape]);
      const size = await run("python3", ["-c", `from PIL import Image; im=Image.open(${JSON.stringify(out)}); print(im.width, im.height, im.getpixel((5,5)))`]);
      const [width, height] = size.stdout.trim().split(" ").map(Number);
      assert.equal(width, expectedW, `${shape}/${mode}: ширина`);
      assert.equal(height, expectedH, `${shape}/${mode}: высота`);
      // У «fit» верхний угол — полоса фона (тёмная), у «crop» — сам снимок.
      const corner = size.stdout.match(/\((\d+), (\d+), (\d+)\)/).slice(1).map(Number);
      if (mode === "fit") assert.deepEqual(corner, [23, 25, 28], `${shape}/fit: угол не фон`);
      else assert.ok(corner[0] > 150, `${shape}/crop: ожидал сам снимок в углу, получил ${corner}`);
    }
  }
});

test("кадры, которых нет нигде, пропускаются, а запись выходит с остальными", () =>
  withFetch(async (url) => {
    if (String(url).includes("missing")) throw new Error("нет такого кадра");
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }, async () => {
    const dir = path.join(tmp, "frames");
    const frames = await prepareFrames(
      ["https://erscglobal2.autoimg.cn/escimg/auto/g33/600x0_c42_missing.jpg.webp"],
      { dir, prefix: "t", log: silent },
    );
    assert.deepEqual(frames, []);
  }));

// Кабинет показывает обрезанный квадрат, и публикация обязана делать так же:
// витрина стиля бессмысленна, если лента выйдет другой.
test("обрезка и квадрат — умолчание и в подготовке кадров, и в команде публикации", async () => {
  const module = await fs.readFile(new URL("../scripts/lib/photo-local.mjs", import.meta.url), "utf8");
  const command = await fs.readFile(new URL("../scripts/social-post.mjs", import.meta.url), "utf8");
  const script = await fs.readFile(new URL("../scripts/photo-to-social.py", import.meta.url), "utf8");
  assert.match(module, /prepareFrames\(photos, \{ dir, prefix = "frame", mode = "crop", shape = "square"/);
  assert.match(command, /option\("square", process\.env\.SOCIAL_SQUARE_MODE \|\| "crop"\)/);
  assert.match(command, /option\("shape", process\.env\.SOCIAL_FRAME_SHAPE \|\| "square"\)/);
  assert.match(script, /def main\(src, out, mode="crop", shape="square"\)/);
});

// Форма кадра переключается флагом — витрина стиля показывает обе, но публиковать
// вертикальный кадр нужно уметь той же командой, без отдельного скрипта.
test("форма кадра переключается флагом --shape", async () => {
  const command = await fs.readFile(new URL("../scripts/social-post.mjs", import.meta.url), "utf8");
  assert.match(command, /const frameShape = FRAME_SHAPES\[/);
  assert.match(command, /shape: frameShape/);
});

test.after(() => fs.rm(tmp, { recursive: true, force: true }));

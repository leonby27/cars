import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { photoWarmUrls, warmPhoto } from "../scripts/lib/photo-warm.mjs";
import { photoHref } from "../server/seo-render.mjs";

const site = "https://abcars.by";
const images = Array.from({ length: 8 }, (_, i) => `https://erscglobal2.autoimg.cn/escimg/auto/g34/M02/1400x0_c42_car${i}.jpg.webp`);

test("ночной проход сохраняет два размера только обложки", () => {
  assert.deepEqual(photoWarmUrls({ image: images[0], images }, { site }),
    ["original", 600].map(width => site + photoHref(images[0], width)));
});

test("новая машина: пять превью и миниатюр, три оригинала, без дублей и дальнейших кадров", () => {
  const urls = photoWarmUrls({ image: images[0], images }, { site, previewCount: 5, galleryCount: 3 });
  assert.equal(urls.length, 13);
  assert.equal(new Set(urls).size, 13);
  for (let i = 0; i < 5; i++) {
    for (const width of [600, 240]) assert.ok(urls.includes(site + photoHref(images[i], width)));
    assert.equal(urls.includes(site + photoHref(images[i], "original")), i < 3);
  }
  assert.ok(urls.every(url => !url.includes("car5")));
});

test("прогрев принимает карточку без image и не запрашивает сторонние адреса", () => {
  assert.equal(photoWarmUrls({ images: [images[0]] }, { site }).length, 2);
  for (const image of [null, "garbage", "/local.webp", "https://autoimg.cn.evil.test/escimg/a.webp", "https://autoimg.cn/private.html"])
    assert.deepEqual(photoWarmUrls({ image }, { site }), []);
});

test("успех означает полное непустое изображение, учитывается попадание в кэш", async () => {
  const result = await warmPhoto("https://example.test/photo", {
    fetcher: async (_url, options) => {
      assert.ok(options.signal instanceof AbortSignal);
      return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp", "x-photo-cache": "HIT" } });
    },
  });
  assert.deepEqual(result, { bytes: 3, hit: true });
});

test("ошибка, пустой файл и HTML с кодом 200 не считаются готовой фотографией", async () => {
  for (const response of [new Response("bad", { status: 503 }), new Response("html"), new Response("", { headers: { "content-type": "image/webp" } })]) {
    await assert.rejects(warmPhoto("https://example.test/photo", { fetcher: async () => response }));
  }
});

test("зависший источник освобождает рабочий поток по таймауту", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(warmPhoto("https://example.test/photo", {
      timeoutMs: 10,
      fetcher: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
    }), { name: "TimeoutError" });
  } finally { clearTimeout(keepAlive); }
});

test("полный запуск собирает списки, убирает дубли и сообщает о недоступном снимке", async () => {
  let fail = false;
  const requested = [];
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/api/cars")) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ items: [{ images }] }));
    } else {
      requested.push(req.url);
      res.statusCode = fail ? 503 : 200;
      res.setHeader("Content-Type", "image/webp");
      res.end("image fixture");
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const run = () => promisify(execFile)(process.execPath, [
      new URL("../scripts/warm-photos.mjs", import.meta.url).pathname,
      `--site=http://127.0.0.1:${server.address().port}`, "--limit=1", "--preview-count=5", "--gallery-count=3",
    ], { timeout: 10_000 });
    const result = await run();
    assert.match(result.stdout, /снимков к проверке: 13/);
    assert.equal(requested.length, 13);
    assert.equal(new Set(requested).size, 13);
    fail = true;
    await assert.rejects(run(), error => error.code === 1 && /не отдалось 13/.test(error.stdout));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

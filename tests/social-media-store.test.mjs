// Хранилище кадров для соцсетей опасно ровно одним: оно умеет удалять файлы в
// репозитории. Эти проверки следят за тем, чтобы под удаление не попало ничего,
// кроме кадров, которые тот же код и загрузил.
import test from "node:test";
import assert from "node:assert/strict";

process.env.GITHUB_MEDIA_TOKEN = "тестовый-ключ";
process.env.GITHUB_MEDIA_REPO = "leonby27/cars";
process.env.GITHUB_MEDIA_TAG = "social-media";

const { unstagePhotos, cleanupStalePhotos } = await import("../scripts/lib/social-media-store.mjs");

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();

// Подменяем сеть: запоминаем, что код попытался удалить.
function withFakeGithub(assets, run) {
  const deleted = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const method = options.method || "GET";
    if (method === "DELETE") {
      deleted.push(String(url));
      return new Response(null, { status: 204 });
    }
    if (String(url).includes("/releases/tags/")) {
      return new Response(JSON.stringify({ assets, upload_url: "https://uploads.example/assets{?name}" }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`тест не ждал запроса ${method} ${url}`);
  };
  return run(deleted).finally(() => { globalThis.fetch = realFetch; });
}

test("чужие файлы не удаляются, даже если их передали на удаление", () =>
  withFakeGithub([], async (deleted) => {
    const silent = () => {};
    await unstagePhotos([
      { id: 1, name: "backup.zip" },
      { id: 2, name: "dist.tar.gz" },
      { id: 3, name: "abcars-social-59876786-1-abc.jpg.bak" },
      { id: 4, name: "../../abcars-social-1-1-abc.jpg" },
    ], { log: silent });
    assert.deepEqual(deleted, [], "ни один посторонний файл не должен уйти на удаление");
  }));

test("свои кадры удаляются по одному, каждый по своему номеру", () =>
  withFakeGithub([], async (deleted) => {
    await unstagePhotos([
      { id: 11, name: "abcars-social-59876786-1-mu5flo6f.jpg" },
      { id: 12, name: "abcars-social-59876786-2-mu5flo6f.jpg" },
    ], { log: () => {} });
    assert.deepEqual(deleted, [
      "https://api.github.com/repos/leonby27/cars/releases/assets/11",
      "https://api.github.com/repos/leonby27/cars/releases/assets/12",
    ]);
  }));

test("подчистка забирает только наши кадры старше суток", () =>
  withFakeGithub([
    { id: 21, name: "abcars-social-1-1-old.jpg", created_at: hoursAgo(30) },
    { id: 22, name: "abcars-social-2-1-fresh.jpg", created_at: hoursAgo(2) },
    { id: 23, name: "release-2026-09-01.zip", created_at: hoursAgo(900) },
    { id: 24, name: "test.jpg", created_at: hoursAgo(48) },
  ], async (deleted) => {
    const removed = await cleanupStalePhotos({ log: () => {} });
    assert.equal(removed, 1);
    assert.deepEqual(deleted, ["https://api.github.com/repos/leonby27/cars/releases/assets/21"]);
  }));

test("пустая подчистка не делает ни одного удаления", () =>
  withFakeGithub([{ id: 31, name: "archive.zip", created_at: hoursAgo(1000) }], async (deleted) => {
    assert.equal(await cleanupStalePhotos({ log: () => {} }), 0);
    assert.deepEqual(deleted, []);
  }));

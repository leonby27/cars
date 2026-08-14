import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fetchSourceText, SourceBlockedError } from "../scripts/lib/source-client.mjs";

async function withServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { return await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("follows an ordinary source redirect", async () => {
  await withServer((request,response) => {
    if (request.url === "/start") { response.writeHead(302, { location:"/card" }); response.end(); return; }
    response.end("listing body");
  }, async (origin) => {
    const result = await fetchSourceText(`${origin}/start`, { attempts:1 });
    assert.equal(result.text, "listing body");
  });
});

test("classifies verification redirects without retrying them", async () => {
  await withServer((_request,response) => { response.writeHead(307, { location:"/captcha" }); response.end(); }, async (origin) => {
    await assert.rejects(fetchSourceText(`${origin}/card`, { attempts:3 }), (error) => error instanceof SourceBlockedError && error.code === "source_blocked");
  });
});

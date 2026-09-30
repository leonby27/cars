import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { encarResizeQuery } from "../src/photo-source.js";

const run = promisify(execFile);

// Opt in with ABCARS_TEST_NGINX=1; uses an installed Docker image, no public origin.
test("nginx: Encar sizes stay separate in either request order and bypass old stored copies", {
  skip: process.env.ABCARS_TEST_NGINX !== "1", timeout: 30000,
}, async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "encar-nginx-"));
  let container;
  t.after(async () => {
    try { if (container) await run("docker", ["rm", "-f", container]); }
    finally { await rm(directory, { recursive: true, force: true }); }
  });
  await chmod(directory, 0o755);
  for (const [href, body] of [
    ["photo/encar/w1920/carpicture/old.jpg", "incorrect old 600px copy"],
    ["photo/encar/v2/w1920/carpicture/saved.jpg", "correct saved large copy"],
  ]) {
    const file = path.join(directory, "media", href);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  }
  const locations = (await readFile(new URL("../deploy/nginx-abcars-photo-location.conf", import.meta.url), "utf8"))
    .replaceAll("include /etc/nginx/snippets/abcars-headers.conf;", "")
    .replaceAll("root /srv/abcars-media;", "root /test/media;")
    .replace('set $photo_origin "ci.encar.com";', 'set $photo_origin "127.0.0.1:8090";')
    .replace("proxy_pass https://$photo_origin$encar_path?", "proxy_pass http://$photo_origin$encar_path?");
  const cache = await readFile(new URL("../deploy/nginx-abcars-photos-cache.conf", import.meta.url), "utf8");
  await writeFile(path.join(directory, "nginx.conf"), `
    events {}
    http {
      ${cache}
      server { listen 8080; ${locations} }
      server {
        listen 8090;
        location / { default_type image/jpeg; return 200 "$uri?$args"; }
      }
    }
  `);
  const mount = ["-v", `${directory}:/test:ro`];
  const image = process.env.ABCARS_TEST_NGINX_IMAGE || "nginx:stable";
  await run("docker", ["run", "--rm", ...mount, image, "nginx", "-t", "-c", "/test/nginx.conf"]);
  container = (await run("docker", ["run", "--rm", "-d", "-p", "127.0.0.1::8080", ...mount, image, "nginx", "-c", "/test/nginx.conf", "-g", "daemon off;"])).stdout.trim();
  const address = (await run("docker", ["port", container, "8080/tcp"])).stdout.trim();
  const origin = `http://${address}`;
  for (let i = 0; ; i++) {
    try { await fetch(origin, { signal: AbortSignal.timeout(500) }); break; }
    catch (error) { if (i >= 30) throw error; await delay(100); }
  }
  const request = async (href, options) => {
    const response = await fetch(origin + href, options);
    return { status: response.status, cache: response.headers.get("x-photo-cache"), body: await response.text() };
  };
  // Preview-first reproduced the production bug; original-first must also work.
  for (const [name, widths] of [["preview-first", [600, 1200, 1920]], ["large-first", [1920, 1200, 600]]]) {
    for (const width of widths) {
      const href = `/photo/encar/v2/w${width}/carpicture/${name}.jpg`;
      const body = `/carpicture/${name}.jpg?${encarResizeQuery(width)}`;
      assert.deepEqual(await request(href), { status: 200, cache: "MISS", body });
      // Browser version must not create another server-side cache entry.
      assert.deepEqual(await request(`${href}?v=another-version`), { status: 200, cache: "HIT", body });
    }
  }
  assert.deepEqual(await request("/photo/encar/w1920/carpicture/old.jpg"), {
    status: 200, cache: "MISS", body: `/carpicture/old.jpg?${encarResizeQuery(1920)}`,
  });
  assert.equal((await request("/photo/encar/v2/w1920/carpicture/old.jpg")).cache, "HIT");
  for (const prefix of ["/photo/encar", "/photo/encar/v2"]) {
    assert.deepEqual(await request(`${prefix}/w1920/carpicture/saved.jpg`), {
      status: 200, cache: "STORED", body: "correct saved large copy",
    });
    assert.equal((await request(`${prefix}/w300/carpicture/a.jpg`)).status, 404);
    assert.equal((await request(`${prefix}/w600/carpicture/a.html`)).status, 404);
    assert.equal((await request(`${prefix}/w600/carpicture/a.jpg`, { method: "POST" })).status, 405);
  }
});

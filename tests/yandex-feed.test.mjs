import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

// Фид для Яндекса стоит в цепочке сборки. На рабочей машине сборка идёт без базы,
// и скрипт обязан тихо ничего не делать: `.env.local` мог бы указывать на боевую базу.
const run = promisify(execFile);
const script = new URL("../scripts/yandex-feed.mjs", import.meta.url).pathname;

test("без разрешения читать базу фид не собирается и ничего не пишет", async () => {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "feed-")), "yandex-cars.xml");
  const { stdout } = await run(process.execPath, [script, `--out=${out}`], { env: { ...process.env, SEO_CARS_FROM_DB: "" } });
  assert.match(stdout, /фид не собран/);
  assert.equal(existsSync(out), false);
});

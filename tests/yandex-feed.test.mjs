import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
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
  const { stdout } = await run(process.execPath, [script, `--out=${out}`], { env: { ...process.env, SEO_CARS_FROM_DB: "", ABCARS_YANDEX_FEED_ENABLED:"1" } });
  assert.match(stdout, /фид не собран/);
  assert.equal(existsSync(out), false);
});

test("disabled feed removes stale variants without DB access or reuse", async () => {
  const out = path.join(mkdtempSync(path.join(os.tmpdir(), "feed-disabled-")), "yandex-cars.xml");
  for (const suffix of ["", ".gz", ".br", ".meta.json"]) writeFileSync(out+suffix,"old private feed");
  const {stdout} = await run(process.execPath,[script,"--db",`--out=${out}`],{env:{...process.env,ABCARS_YANDEX_FEED_ENABLED:"0",ABCARS_REUSE_FEED:"1",SEO_CARS_FROM_DB:"1",DATABASE_URL:"postgres://invalid:invalid@127.0.0.1:1/no_database"}});
  assert.match(stdout,/публикация отключена/);
  for (const suffix of ["", ".gz", ".br", ".meta.json"]) assert.equal(existsSync(out+suffix),false);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolvePillowPython } from "../scripts/lib/python-pillow.mjs";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");

test("финализация старого пакета публикует исходник и не требует generated.file", async () => {
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), "social-source-"));
  try {
    const python = await resolvePillowPython();
    const week = "2026-11-02";
    const dir = path.join(runtime, week);
    await fs.mkdir(dir);
    const source = path.join(dir, "source.png");
    const generated = path.join(dir, "generated.png");
    await run(python, ["-c", "from PIL import Image; import random,sys; Image.frombytes('RGB',(1080,1350),random.Random(1).randbytes(1080*1350*3)).save(sys.argv[1])", source]);
    const manifestFile = path.join(dir, "manifest.json");
    const oldPost = { id:`${week}-01`, kind:"visual", source:{ file:source }, generated:{ file:generated }, prompt:{ number:1 } };
    const finalize = () => run(process.execPath, [path.join(root, "scripts/social-week-finalize.mjs"), `--week=${week}`], {
      cwd:root, env:{ ...process.env, CODEX_PYTHON:python, SOCIAL_WEEK_RUNTIME_ROOT:runtime },
    });
    await fs.writeFile(manifestFile, JSON.stringify({ week, status:"awaiting-generation", posts:[oldPost] }));
    await finalize();
    const ready = JSON.parse(await fs.readFile(manifestFile, "utf8"));
    assert.equal(ready.status, "ready");
    assert.equal(ready.imageMode, "source");
    assert.equal(ready.posts[0].cover.origin, "source");
    assert.equal(ready.posts[0].generated, undefined);
    assert.equal(ready.posts[0].prompt, undefined);
    const expected = path.join(dir, "expected.jpg");
    await run(python, [path.join(root, "scripts/photo-to-social.py"), source, expected, "fit", "vertical"]);
    assert.deepEqual(await fs.readFile(path.join(dir, "upload", ready.posts[0].cover.asset)), await fs.readFile(expected));

    // Полный серверный цикл повторно использует готовый пакет, не обращаясь к AI
    // или внешнему хранилищу. --dry не отправляет посты.
    ready.posts[0].publishAt = "2000-01-01T13:00:00+03:00";
    ready.posts[0].rubric = "cheapest";
    ready.posts[0].texts = { instagram:"Тест", threads:"Тест", telegram:"Тест" };
    ready.threadPosts = [];
    await fs.writeFile(manifestFile, JSON.stringify(ready));
    const before = await fs.readFile(manifestFile, "utf8");
    const jpegBefore = await fs.stat(path.resolve(root, ready.posts[0].cover.file));
    const result = await run(process.execPath, [path.join(root, "scripts/social-week-run.mjs"), `--week=${week}`, "--dry"], {
      cwd:root,
      env:{ ...process.env, CODEX_PYTHON:python, SOCIAL_WEEK_RUNTIME_ROOT:runtime, SOCIAL_WEEK_PUBLISH_STATE_FILE:path.join(runtime, "published.json") },
    });
    assert.match(result.stdout, /готова к публикации/);
    assert.equal(await fs.readFile(manifestFile, "utf8"), before);
    assert.equal((await fs.stat(path.resolve(root, ready.posts[0].cover.file))).mtimeMs, jpegBefore.mtimeMs);
    await assert.rejects(fs.access(path.join(runtime, "published.json")), { code:"ENOENT" });

    // Даже существующая старая генерация не заменяет пропавший исходник.
    await fs.rename(source, generated);
    await fs.writeFile(manifestFile, JSON.stringify({ week, status:"awaiting-generation", posts:[oldPost] }));
    await assert.rejects(finalize(), /Нет готового исходника/);
    assert.equal(JSON.parse(await fs.readFile(manifestFile, "utf8")).status, "awaiting-generation");
  } finally {
    await fs.rm(runtime, { recursive:true, force:true });
  }
});

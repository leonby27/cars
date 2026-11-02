// Переводит оформленные исходники в JPEG и сохраняет готовый пакет на сервере.
// AI-генерация не используется, в том числе для ранее подготовленных манифестов.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolvePillowPython } from "./lib/python-pillow.mjs";
import { weekKey } from "./lib/social-week.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const week = process.argv.find((arg) => arg.startsWith("--week="))?.slice(7) || weekKey();
const runtimeRoot = process.env.SOCIAL_WEEK_RUNTIME_ROOT || path.join(ROOT, "runtime", "social-week");
const packageDir = path.join(runtimeRoot, week);
const manifestFile = path.join(packageDir, "manifest.json");
const uploadDir = path.join(packageDir, "upload");
const socialFrame = path.join(ROOT, "scripts", "photo-to-social.py");
const python = await resolvePillowPython();

const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
if (manifest.week !== week || !Array.isArray(manifest.posts) || !manifest.posts.length) throw new Error("Недельный манифест повреждён");
await fs.mkdir(uploadDir, { recursive:true });

for (const post of manifest.posts) {
  if (!post.source?.file) throw new Error(`Нет исходника ${post.id}`);
  const source = path.resolve(ROOT, post.source.file);
  const stat = await fs.stat(source).catch(() => null);
  if (!stat?.isFile() || stat.size < 10_000) throw new Error(`Нет готового исходника ${post.id}: ${post.source.file}`);
  const asset = `abcars-week-${week}-${post.id.split("-").at(-1)}.jpg`;
  const jpeg = path.join(uploadDir, asset);
  await run(python, [socialFrame, source, jpeg, "fit", "vertical"]);
  post.cover = { origin:"source", asset, file:path.relative(ROOT, jpeg) };
  delete post.generated;
  delete post.prompt;
}

manifest.imageMode = "source";
manifest.status = "ready";
manifest.readyAt = new Date().toISOString();
const readyManifest = path.join(uploadDir, `abcars-week-${week}.json`);
await fs.writeFile(readyManifest, `${JSON.stringify(manifest, null, 2)}\n`);

await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Готов локальный недельный пакет ${week}: ${readyManifest}\n`);

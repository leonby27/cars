// Проверяет результаты генерации, переводит обложки в JPEG и выкладывает готовый
// недельный пакет в отдельный GitHub Release. Сервер читает только этот пакет;
// исходники и частично выполненная генерация туда не попадают.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { weekKey } from "./lib/social-week.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const TAG = process.env.GITHUB_WEEKLY_TAG || "social-weekly";
const REPOSITORY = process.env.GITHUB_MEDIA_REPO || "leonby27/cars";
const dryRun = process.argv.includes("--dry");
const week = process.argv.find((arg) => arg.startsWith("--week="))?.slice(7) || weekKey();
const runtimeRoot = process.env.SOCIAL_WEEK_RUNTIME_ROOT || path.join(ROOT, "runtime", "social-week");
const packageDir = path.join(runtimeRoot, week);
const manifestFile = path.join(packageDir, "manifest.json");
const uploadDir = path.join(packageDir, "upload");
const socialFrame = path.join(ROOT, "scripts", "photo-to-social.py");
const python = process.env.CODEX_PYTHON || "python3";

const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
if (manifest.week !== week || !Array.isArray(manifest.posts) || !manifest.posts.length) throw new Error("Недельный манифест повреждён");
await fs.mkdir(uploadDir, { recursive:true });

const assetBase = `https://github.com/${REPOSITORY}/releases/download/${TAG}`;
const assets = [];
for (const post of manifest.posts) {
  const generated = path.resolve(ROOT, post.generated.file);
  const stat = await fs.stat(generated).catch(() => null);
  if (!stat?.isFile() || stat.size < 10_000) throw new Error(`Нет готовой генерации ${post.id}: ${post.generated.file}`);
  const asset = `abcars-week-${week}-${post.id.split("-").at(-1)}.jpg`;
  const jpeg = path.join(uploadDir, asset);
  await run(python, [socialFrame, generated, jpeg, "fit", "vertical"]);
  post.cover = { asset, url:`${assetBase}/${asset}` };
  assets.push(jpeg);
}

manifest.status = "ready";
manifest.readyAt = new Date().toISOString();
const readyManifest = path.join(uploadDir, `abcars-week-${week}.json`);
await fs.writeFile(readyManifest, `${JSON.stringify(manifest, null, 2)}\n`);

if (!dryRun) {
  try {
    await run("gh", ["release", "view", TAG, "--repo", REPOSITORY]);
  } catch {
    await run("gh", ["release", "create", TAG, "--repo", REPOSITORY, "--title", "Social weekly packages", "--notes", "Готовые недельные пакеты для автопубликации abcars.by."]);
  }
  await run("gh", ["release", "upload", TAG, ...assets, "--repo", REPOSITORY, "--clobber"]);
  // Манифест загружается последним: сервер никогда не увидит ссылки на обложки,
  // которые ещё не успели попасть в хранилище.
  await run("gh", ["release", "upload", TAG, readyManifest, "--repo", REPOSITORY, "--clobber"]);
}
await fs.writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${dryRun ? "Проверен" : "Готов и загружен"} недельный пакет ${week}: ${readyManifest}\n`);

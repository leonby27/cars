// Весь плановый цикл выполняется сервером: исходники → JPEG → наступившие посты.
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { weekKey } from "./lib/social-week.mjs";

process.env.TZ = "Europe/Minsk";
const ROOT = path.resolve(import.meta.dirname, "..");
try { process.loadEnvFile?.(path.join(ROOT, ".env.local")); } catch {}
try { process.loadEnvFile?.(path.join(ROOT, ".env")); } catch {}
const week = process.argv.find((arg) => arg.startsWith("--week="))?.slice(7) || weekKey();
if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error("Неверная неделя");
const runtimeRoot = process.env.SOCIAL_WEEK_RUNTIME_ROOT || path.join(ROOT, "runtime", "social-week");
const manifestFile = path.join(runtimeRoot, week, "manifest.json");

async function run(script, args = []) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, "scripts", script), `--week=${week}`, ...args], {
      cwd:ROOT, env:{ ...process.env, TZ:"Europe/Minsk", SOCIAL_WEEK_MANIFEST_FILE:manifestFile }, stdio:"inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${script}: код завершения ${code}`)));
  });
}

await run("social-week-prepare.mjs");
const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
const coversExist = await Promise.all((manifest.posts || []).map(async (post) => {
  if (post.cover?.origin !== "source" || !post.cover?.file) return false;
  const stat = await fs.stat(path.resolve(ROOT, post.cover.file)).catch(() => null);
  return stat?.isFile() && stat.size >= 10_000;
}));
if (manifest.status !== "ready" || manifest.imageMode !== "source" || !coversExist.length || coversExist.some((exists) => !exists)) {
  await run("social-week-finalize.mjs");
}
// --dry проверяет очередь без отправки в социальные сети.
await run("social-week-publish.mjs", process.argv.includes("--dry") ? ["--dry"] : []);

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classesOf, stateModifiers, topLevelBlocks, splitBlock } from "../server/page-css.mjs";

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};

const clientDir = arg("dir", `${process.env.ABCARS_BUILD_DIR || "dist"}/client`);
const assetsDir = join(clientDir, "assets");
const indexPath = join(clientDir, "index.html");

const criticalClasses = new Set();
{
  const config = JSON.parse(readFileSync("config/critical-classes.json", "utf8"));
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith("_") || !Array.isArray(value)) continue;
    for (const name of value) criticalClasses.add(name);
  }
}

const isCritical = (selector) => {
  const meaningful = classesOf(selector).filter((name) => !stateModifiers.has(name));
  return !meaningful.length || meaningful.some((name) => criticalClasses.has(name));
};

const cssFiles = readdirSync(assetsDir).filter((name) => name.endsWith(".css"));
if (!cssFiles.length) {
  console.log("[split-css] в сборке нет файлов стилей — делить нечего");
  process.exit(0);
}

let html = readFileSync(indexPath, "utf8");
if (html.includes("<style data-page-css>")) {
  console.log("[split-css] стили уже подготовлены");
  process.exit(0);
}
let totalCritical = 0;
let totalExternal = 0;

for (const file of cssFiles) {
  const path = join(assetsDir, file);
  const css = readFileSync(path, "utf8");
  const criticalParts = [];
  const restParts = [];
  for (const block of topLevelBlocks(css)) {
    const split = splitBlock(block, isCritical);
    if (split.critical) criticalParts.push(split.critical);
    if (split.rest) restParts.push(split.rest);
  }
  const critical = criticalParts.join("\n");
  const complete = [critical, restParts.join("\n")].filter(Boolean).join("\n");

  const href = `/assets/${file}`;
  const link = new RegExp(`\\s*<link[^>]+href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`);
  if (!link.test(html)) {
    console.log(`[split-css] ${file}: ссылки на файл в index.html нет, оставляем как есть`);
    continue;
  }
  const replacement = `\n    <style data-page-css>${critical}</style>\n    <link rel="stylesheet" crossorigin href="${href}" media="print" onload="this.media='all'" />\n    <noscript><link rel="stylesheet" crossorigin href="${href}" /></noscript>`;
  html = html.replace(link, replacement);
  writeFileSync(path, complete);
  totalCritical += Buffer.byteLength(critical);
  totalExternal += Buffer.byteLength(complete);
  const kb = (value) => (value / 1024).toFixed(1);
  console.log(`[split-css] ${file}: ${kb(Buffer.byteLength(css))} КБ → в странице ${kb(Buffer.byteLength(critical))} КБ, полный внешний файл ${kb(Buffer.byteLength(complete))} КБ`);
}

writeFileSync(indexPath, html);
console.log(`[split-css] готово: срочных ${(totalCritical / 1024).toFixed(1)} КБ, во внешних файлах ${(totalExternal / 1024).toFixed(1)} КБ`);

import { spawn } from "node:child_process";
import { assertImportSourceEnabled } from "../config/import-policy.mjs";

assertImportSourceEnabled("Guazi");

const intervalMs = Number(process.env.GUAZI_SYNC_INTERVAL_MS || 6 * 60 * 60 * 1000);
const importLimit = Number(process.env.GUAZI_IMPORT_LIMIT || 60);
const importScan = Number(process.env.GUAZI_IMPORT_SCAN || 2500);
const discovery = process.env.GUAZI_DISCOVERY || "targeted";
const importerArgs = ["scripts/import-guazi.mjs", `--limit=${importLimit}`, `--scan=${importScan}`, `--discovery=${discovery}`, "--concurrency=10"];

function runImport() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, importerArgs, { stdio: "inherit", env: process.env });
    child.once("exit", (code) => {
      if (code !== 0) console.error(`[guazi-sync] import failed with code ${code}`);
      resolve();
    });
  });
}

async function loop() {
  if (process.env.GUAZI_SYNC_SKIP_INITIAL === "1") {
    console.log(`[guazi-sync] using existing snapshot; next import at ${new Date(Date.now() + intervalMs).toISOString()}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  while (true) {
    await runImport();
    console.log(`[guazi-sync] next import at ${new Date(Date.now() + intervalMs).toISOString()}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

loop();

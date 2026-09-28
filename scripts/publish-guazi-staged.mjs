#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { pool, withTransaction } from "../server/db.mjs";
import { importCars } from "../server/repository.mjs";

const APPLY = process.argv.includes("--apply");
const STAGED_ROOT = process.env.GUAZI_STAGED_ROOT || "/opt/abcars-guazi-pilot/runtime/guazi-import-20260926";
const ACCEPTED_DIR = path.join(STAGED_ROOT, "accepted");
const AUDIT_FILE = path.join(STAGED_ROOT, "completion-audit.json");
const BATCH_SIZE = 100;

const audit = JSON.parse(await fs.readFile(AUDIT_FILE, "utf8"));
if (audit.status !== "complete" || audit.issues?.length || audit.missingFiles?.length || audit.extraFiles?.length || audit.missingResults?.length) {
  throw new Error("Guazi completion audit is not clean");
}

const files = (await fs.readdir(ACCEPTED_DIR)).filter((name) => /^[a-z0-9]+\.json$/i.test(name)).sort();
if (files.length !== audit.counts?.accepted || files.length !== audit.acceptedFiles) {
  throw new Error(`Staged count mismatch: files=${files.length}, audit=${audit.counts?.accepted}/${audit.acceptedFiles}`);
}

const source = await pool.query("SELECT enabled FROM catalog_sources WHERE source='Guazi'");
if (source.rowCount !== 1) throw new Error("Guazi source visibility setting is missing");
if (source.rows[0].enabled) throw new Error("Guazi must remain hidden until staged import completes");

console.log(JSON.stringify({ mode: APPLY ? "apply" : "check", staged: files.length, audit: audit.checkedAt }));
if (!APPLY) {
  await pool.end();
  process.exit(0);
}

for (let offset = 0; offset < files.length; offset += BATCH_SIZE) {
  const names = files.slice(offset, offset + BATCH_SIZE);
  const cars = await Promise.all(names.map(async (name) => JSON.parse(await fs.readFile(path.join(ACCEPTED_DIR, name), "utf8"))));
  for (const [index, car] of cars.entries()) {
    if (car.source !== "Guazi" || car.id !== `guazi-${car.externalId}` || car.priceBasis !== "FOB" || car.fobPort !== "Horgos" || car.localPreview) {
      throw new Error(`Invalid staged Guazi card: ${car.id || names[index]}`);
    }
  }
  await importCars(cars, BATCH_SIZE);
  if ((offset + names.length) % 1000 === 0 || offset + names.length === files.length) {
    console.log(JSON.stringify({ imported: offset + names.length, total: files.length }));
  }
}

const count = await pool.query("SELECT count(*)::int AS total FROM listings WHERE source='Guazi' AND status='active'");
if (count.rows[0].total !== files.length) throw new Error(`Imported count mismatch: ${count.rows[0].total} != ${files.length}`);

await withTransaction(async (client) => {
  await client.query("UPDATE catalog_sources SET enabled=true, updated_at=now() WHERE source='Guazi'");
});

console.log(JSON.stringify({ published: files.length, source: "Guazi", enabled: true }));
await pool.end();

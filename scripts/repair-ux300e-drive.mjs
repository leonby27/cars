// Explicitly bounded repair of the six listings verified on 2026-09-09.
// Defaults to read-only. --apply takes row locks and saves a private backup
// before updating only drivetrain and its payload representations.
import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "../server/db.mjs";
import { repairVerifiedDrive } from "../src/vehicle-spec-integrity.js";

const ids = ["59173881", "59213906", "59230029", "59277099", "59313990", "59358008"].map((id) => `che168-${id}`);
const apply = process.argv.includes("--apply");
const client = await pool.connect();
try {
  await client.query(apply ? "BEGIN" : "BEGIN READ ONLY");
  const { rows } = await client.query(`SELECT l.id, l.vehicle_id, l.source_payload, v.drivetrain,
    v.brand, v.model, v.powertrain FROM listings l JOIN vehicles v ON v.id=l.vehicle_id
    WHERE l.id=ANY($1::text[]) ORDER BY l.id ${apply ? "FOR UPDATE OF l,v" : ""}`, [ids]);
  if (rows.length !== ids.length) throw new Error("Expected all six verified listings; no changes applied");
  const changes = [];
  for (const row of rows) {
    if (row.id !== row.vehicle_id || row.brand !== "Lexus" || row.model !== "UX EV" || row.powertrain !== "Электромобиль") throw new Error(`Unexpected identity: ${row.id}`);
    const car = { ...row.source_payload, brand: row.brand, model: row.model, type: row.powertrain, drive: row.drivetrain };
    const fixed = repairVerifiedDrive(car);
    if (fixed.drive !== "Передний") throw new Error(`Unverified variant: ${row.id}`);
    if (fixed !== car) changes.push({ row, fixed });
  }
  console.log(JSON.stringify({ apply, changes: changes.map(({ row }) => ({ id: row.id, from: row.drivetrain, to: "Передний" })) }));
  if (apply && changes.length) {
    const shared = await client.query("SELECT id FROM listings WHERE vehicle_id=ANY($1::text[]) AND NOT (id=ANY($2::text[]))", [rows.map((row) => row.vehicle_id), ids]);
    if (shared.rowCount) throw new Error("Unexpected shared vehicles; no changes applied");
    const backupDir = path.resolve("runtime", "data-repair-backups");
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
    const backup = path.join(backupDir, `ux300e-drive-${Date.now()}.json`);
    await fs.writeFile(backup, JSON.stringify(rows, null, 2), { flag: "wx", mode: 0o600 });
    const saved = JSON.parse(await fs.readFile(backup, "utf8"));
    if (JSON.stringify(saved) !== JSON.stringify(rows)) throw new Error("Backup verification failed");
    console.log(`Verified backup: ${backup}`);
    for (const { row, fixed } of changes) {
      await client.query("UPDATE vehicles SET drivetrain=$2 WHERE id=$1", [row.vehicle_id, fixed.drive]);
      await client.query("UPDATE listings SET source_payload=source_payload || $2::jsonb WHERE id=$1", [row.id, JSON.stringify({ drive: fixed.drive, technicalSpecs: fixed.technicalSpecs, specCorrections: fixed.specCorrections })]);
    }
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}

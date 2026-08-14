import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../server/db.mjs";
import { importCars } from "../server/repository.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const payload = JSON.parse(await fs.readFile(path.join(root, "public", "data", "cars.json"), "utf8"));
const count = await importCars(payload.cars || []);
console.log(`Imported ${count} cars into PostgreSQL`);
await pool.end();

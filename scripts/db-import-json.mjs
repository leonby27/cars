import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../server/db.mjs";
import { importCars } from "../server/repository.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Дамп вне git и пересоздаётся импортом: без него переносить в базу нечего, и
// сказать об этом надо внятно, а не уронить скрипт на ENOENT.
const dumpPath = path.join(root, "public", "data", "cars.json");
const payload = await fs.readFile(dumpPath, "utf8").then(JSON.parse).catch((error) => {
  if (error.code !== "ENOENT") throw error;
  console.error(`Дампа ${path.relative(root, dumpPath)} нет: заливать в базу нечего. Сначала соберите каталог импортом (npm run importv2).`);
  process.exit(1);
});
const count = await importCars(payload.cars || []);
console.log(`Imported ${count} cars into PostgreSQL`);
await pool.end();

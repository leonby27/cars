import { pool } from "../server/db.mjs";
import { scheduleStaleListings } from "../server/crawler-maintenance.mjs";

const limit = Math.max(1, Number(process.argv.find((value) => value.startsWith("--limit="))?.split("=")[1]) || 1000);
const queued=await scheduleStaleListings(limit);
console.log(`Queued ${queued} stale listings`);
await pool.end();

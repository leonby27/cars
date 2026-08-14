import { pool } from "../server/db.mjs";
import { expireUnseenListings } from "../server/crawler-maintenance.mjs";

const days = Math.max(7, Number(process.argv.find((value) => value.startsWith("--days="))?.split("=")[1]) || 30);
const expired=await expireUnseenListings(days);
console.log(`Marked ${expired} listings unavailable after ${days} days without a successful sighting`);
await pool.end();

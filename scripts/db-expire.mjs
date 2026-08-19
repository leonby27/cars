import { pool } from "../server/db.mjs";
import { expireUnseenListings } from "../server/crawler-maintenance.mjs";
import { purgeExpiredRateLimits } from "../server/rate-limit.mjs";

const days = Math.max(7, Number(process.argv.find((value) => value.startsWith("--days="))?.split("=")[1]) || 30);
const expired=await expireUnseenListings(days);
console.log(`Marked ${expired} listings unavailable after ${days} days without a successful sighting`);
// Просроченные счётчики частоты и мёртвые сессии копятся сами по себе: за ними никто
// не возвращается, а лишняя строка сессии — это лишний живой ключ доступа в базе.
const rateLimits=await purgeExpiredRateLimits();
console.log(`Removed ${rateLimits} stale rate limit counters`);
const sessions=await pool.query("DELETE FROM customer_sessions WHERE expires_at < now()");
console.log(`Removed ${sessions.rowCount} expired customer sessions`);
await pool.end();

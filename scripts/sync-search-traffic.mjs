import { pool } from '../server/db.mjs';
import { collectSearchTraffic } from '../server/search-traffic.mjs';
try {
  const result = await collectSearchTraffic();
  console.log(JSON.stringify(result));
  if (Object.values(result).some((source) => source.status === 'error')) process.exitCode = 1;
} catch {
  console.error('Search traffic sync failed; saved history retained.');
  process.exitCode = 1;
} finally { await pool.end(); }

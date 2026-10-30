#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { repairGuaziFamily } from './lib/guazi-family-repair.mjs';
import { createGuaziRefreshStore } from './lib/guazi-refresh-store.mjs';
import { refreshAfterManualCatalog } from './lib/sitemap-refresh.mjs';

if (process.argv.slice(2).join(' ') !== '--run') {
  console.log('Use --run to recheck only the saved AITO-family brand/segment failures in the stopped current round.');
  process.exit(process.argv.length > 2 ? 1 : 0);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { pool, withTransaction, DATABASE_URL } = await import('../server/db.mjs');
const { upsertCar } = await import('../server/repository.mjs');
const controller = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => controller.abort());
const store = createGuaziRefreshStore({ pool, withTransaction, upsertCar, databaseUrl: DATABASE_URL,
  finalize: async () => {
    await promisify(execFile)(process.execPath, ['scripts/deduplicate-cross-source.mjs', '--apply'], { cwd: root, timeout: 300000 });
    await refreshAfterManualCatalog({ root });
  },
});
try {
  const report = await repairGuaziFamily({ root, signal: controller.signal }, { store });
  console.log(JSON.stringify({ status: report.status, completed: report.completed, total: report.targets.length, outcomes: report.outcomes, audit: report.audit }));
} catch (error) {
  console.error(String(error.message).split('\n')[0]); process.exitCode = 1;
} finally { await pool.end(); }

#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runGuaziRefresh } from './lib/guazi-refresh.mjs';
import { createGuaziRefreshStore } from './lib/guazi-refresh-store.mjs';
import { sendTelegram } from './lib/telegram.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (!args.includes('--run') || args.some(arg => !['--run', '--new-circle'].includes(arg))) {
  console.log('Guazi: --run --new-circle starts a fresh round; --run resumes its checkpoint. Both write to the configured catalog database.');
  process.exit(args.length ? 1 : 0);
}
const { pool, withTransaction, DATABASE_URL } = await import('../server/db.mjs');
const { upsertCar } = await import('../server/repository.mjs');
const controller = new AbortController();
process.on('SIGTERM', () => controller.abort());
process.on('SIGINT', () => controller.abort());
const store = createGuaziRefreshStore({ pool, withTransaction, upsertCar, databaseUrl: DATABASE_URL,
  finalize: () => promisify(execFile)(process.execPath, ['scripts/deduplicate-cross-source.mjs', '--apply'], { cwd: root, timeout: 300000 }),
});
try {
  await runGuaziRefresh({ root, newCircle: args.includes('--new-circle'), signal: controller.signal }, {
    store, notify: text => sendTelegram(text, { root }),
  });
} catch (error) {
  console.error(String(error.message).split('\n')[0]);
  if (!controller.signal.aborted) process.exitCode = 1;
} finally { await pool.end(); }

// Encar refresh: list snapshot -> existing cards -> discoveries for import.
// A missing list entry alone never marks a sale; the detail page decides.
// --resume retains completed cards, repairing incomplete list evidence if needed.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EncarClient } from './lib/encar-client.mjs';
import { loadKoreaSpecs } from './lib/korea-specs.mjs';
import { runEncarRefresh } from './lib/encar-refresh.mjs';
import { ENCAR_MANUFACTURERS } from './lib/encar-parser.mjs';
import { canonicalImportBrand, importPolicyViolation } from '../config/import-policy.mjs';
import { sourceUsdRate } from '../src/pricing.js';
import { pool, withTransaction } from '../server/db.mjs';
import { upsertEncarCar } from './lib/encar-write.mjs';
import { refreshAfterManualCatalog } from './lib/sitemap-refresh.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const numeric = (key, fallback, minimum = 0) => {
  const value = Number(args.get(key) ?? fallback);
  if (!Number.isFinite(value) || value < minimum || (key !== 'max-minutes' && !Number.isInteger(value))) throw new Error(`Invalid --${key}`);
  return value;
};
const concurrency = numeric('concurrency', 2, 1);
const pace = numeric('pace', 300);
const yearFrom = numeric('year-from', 2020, 1900);
const detailLimit = numeric('detail-limit', 0);
const maxMinutes = numeric('max-minutes', 0);
const deadline = maxMinutes > 0 ? Date.now() + maxMinutes * 60_000 : Infinity;
const brandFilter = args.get('brands')?.split(',').map(brand => canonicalImportBrand(brand.trim())).filter(Boolean) || null;
const brands = Object.keys(ENCAR_MANUFACTURERS).filter(brand => !brandFilter || brandFilter.includes(brand));
const log = line => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const dryRun = args.get('dry') === 'true';
const runtimeFile = name => path.join(ROOT, 'runtime', `${name}${dryRun ? '-dry' : ''}.json`);
let stopping = false;
const requestStop = () => { stopping = true; };
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, requestStop);

try {
  if (!brands.length) throw new Error('Encar: ни одной поддерживаемой марки');
  const usdPerKrw = sourceUsdRate('KRW');
  if (!(usdPerKrw > 0)) throw new Error('Encar: курс воны не задан');
  const specs = await loadKoreaSpecs(path.join(ROOT, 'config', 'korea-specs'));
  log(`[specs] справочник характеристик: марок ${Object.keys(specs).length}`);
  const client = new EncarClient({ pace, log, specs });
  await runEncarRefresh({
    client, db: pool,
    // A failed card write rolls back facts, listing, media and history together.
    upsert: car => withTransaction(db => upsertEncarCar(car, db)),
    policyViolation: importPolicyViolation, canonicalBrand: canonicalImportBrand,
    brands, yearFrom, usdPerKrw, concurrency, detailLimit,
    dryRun, resume: args.get('resume') === 'true',
    stop: () => stopping || Date.now() >= deadline, log,
    checkpointPath: runtimeFile('encar-refresh-checkpoint'),
    reportPath: runtimeFile('encar-refresh-report'),
    discoveriesPath: runtimeFile('encar-discoveries'),
  });
  if (!dryRun) await refreshAfterManualCatalog({ root: ROOT });
} catch (error) {
  console.error(`[fail] ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const signal of ['SIGTERM', 'SIGINT']) process.off(signal, requestStop);
  await pool.end().catch(() => {});
}

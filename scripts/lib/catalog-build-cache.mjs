import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { serialize, deserialize } from 'node:v8';

const VERSION = 1;
export const CATALOG_CACHE_MAX_AGE = 24 * 3600_000;

// Hash the actual working files, including server-local rate updates. JSX/CSS
// only render these inputs; data modules and build rules must match exactly.
export function catalogRateKey(root) {
  const hash = createHash('sha256');
  for (const file of ['src/pricing.js','src/ev-quota.js']) hash.update(file).update(readFileSync(join(root,file)));
  return hash.digest('hex');
}

export function catalogBuildKey(root, settings) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(join(root,directory),{withFileTypes:true})) {
      const file = join(directory,entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.(js|mjs|json|sql)$/.test(file)) files.push(file);
    }
  };
  for (const dir of ['src','server','config','db','scripts/lib']) walk(dir);
  files.push('scripts/generate-seo-pages.mjs','package.json','package-lock.json');
  const hash = createHash('sha256').update(JSON.stringify({version:VERSION,v8:process.versions.v8,settings}));
  for (const file of files.sort()) hash.update(relative(root,join(root,file))).update('\0').update(readFileSync(join(root,file))).update('\0');
  return hash.digest('hex');
}

export function readCatalogBuildCache(file, key, { now = Date.now(), maxAge = CATALOG_CACHE_MAX_AGE } = {}) {
  try {
    const saved = deserialize(readFileSync(file));
    if (saved.version !== VERSION || saved.key !== key) return {reason:'изменились правила подготовки данных'};
    if (!Number.isFinite(saved.createdAt) || saved.createdAt > now || now-saved.createdAt >= maxAge) return {reason:'сохранённые данные старше суток'};
    const {live,marketPrices} = saved;
    if (!live || !['models','modelChanged','modelPrices','listPages','stock','changed','collections'].every(k=>live[k] instanceof Map)
      || !Array.isArray(live.showcase) || !Array.isArray(live.carEntries)
      || !marketPrices || marketPrices.version !== 1 || !Array.isArray(marketPrices.normal) || !Array.isArray(marketPrices.refund50)) {
      return {reason:'сохранённые данные имеют другой формат'};
    }
    return {saved};
  } catch { return {reason:'сохранённых данных нет или файл повреждён'}; }
}

export function writeCatalogBuildCache(file, { key, live, marketPrices, createdAt = Date.now(), rateKey }) {
  writeFileSync(file,serialize({version:VERSION,key,createdAt,live,marketPrices,rateKey}));
  writeFileSync(`${file}.meta.json`,JSON.stringify({version:VERSION,key,createdAt,rateKey}));
}

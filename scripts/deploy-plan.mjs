#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { catalogRateKey } from './lib/catalog-build-cache.mjs';
import { execFileSync } from 'node:child_process';
import { deploymentPlan } from './lib/deploy-plan.mjs';
const [before, after, refreshed = '0'] = process.argv.slice(2);
let knownBase = Boolean(before && after), files = [];
if (knownBase) {
  try {
    // No rename detection: both the old and new paths must be classified.
    files = execFileSync('git',['diff','--no-renames','--name-only','-z',before,after],{encoding:'utf8'}).split('\0').filter(Boolean);
    // Nightly jobs intentionally keep rates/quota dirty in Git. Cache fingerprints
    // compare their actual contents with the last build; dirty alone is not a change.
    files.push(...execFileSync('git',['diff','--name-only','-z','HEAD'],{encoding:'utf8'}).split('\0')
      .filter(file=>file && !['src/pricing.js','src/ev-quota.js'].includes(file)));
  } catch { knownBase = false; }
}
let ratesChanged = refreshed === '1';
try {
  const previous = JSON.parse(readFileSync('dist/catalog-build-data.bin.meta.json','utf8'));
  ratesChanged ||= previous.rateKey !== catalogRateKey(process.cwd());
} catch {
  // The first deployment with this feature prepares a complete, trusted baseline.
  knownBase = false;
}
const plan = deploymentPlan(files,{knownBase,pricingRefreshed:ratesChanged});
console.error(`[выкладка] ${plan.mode === 'presentation' ? 'быстрая: используем совместимые готовые данные' : 'полная: обновляем данные'}`);
console.error(`[выкладка] причина: ${plan.reasons.join(', ')}`);
// Fixed numeric fields only; the shell does not evaluate file names as code.
console.log([plan.reuseCatalog,plan.reuseFeed,plan.recalculatePrices,plan.checkDuplicates,plan.migrate,plan.restartBot].map(Number).join(' '));

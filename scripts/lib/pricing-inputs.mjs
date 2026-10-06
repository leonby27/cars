import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const roots = ['src/pricing.js', 'scripts/backfill-estimates.mjs', 'scripts/lib/che168-parser.mjs'];

// Follow literal local imports without executing application code or opening DB
// connections. Missing/computed dependencies fall back to the conservative policy.
export function pricingInputs(root = projectRoot) {
  const files = new Set();
  const visit = (file) => {
    if (files.has(file)) return;
    files.add(file);
    const absolute = resolve(root, file);
    const code = readFileSync(absolute, 'utf8');
    if (!/\.[cm]?js$/.test(file)) return;
    for (const match of code.matchAll(/\bimport\s*\(([^)]*)/g)) {
      if (!/^\s*(['"])[^'"\\]*\1\s*$/.test(match[1])) throw new Error('Computed import');
    }
    if (/\brequire\s*\(/.test(code)) throw new Error('CommonJS dependency');
    const imports = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(['"])(\.[^'"]+)\1/g;
    for (const match of code.matchAll(imports)) {
      const target = resolve(dirname(absolute), match[2]);
      const candidates = extname(target) ? [target] : [target, target + '.js', target + '.mjs', join(target, 'index.js'), join(target, 'index.mjs')];
      const found = candidates.find((candidate) => existsSync(candidate));
      if (!found) throw new Error('Missing import');
      const local = relative(root, found).replaceAll('\\', '/');
      if (local.startsWith('../')) throw new Error('Import outside project');
      visit(local);
    }
  };
  try {
    for (const file of roots) visit(file);
    return files;
  } catch { return null; }
}
